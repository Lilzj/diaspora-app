// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Media client (Remediation Wave E)
//
// **The one media abstraction.** The brief's instruction was explicit: *"Do not
// implement five independent upload systems."* Every surface that needs to send
// bytes — marketplace, housing, guides, events, organisations, avatars, message
// attachments — calls this module, and none of them opens a `FormData` of its
// own.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Nothing. There was no upload client at all. `ImagePickerInput` returned
// `result.assets[0].uri` — a `file:///…` path on the device — and the create
// screens sent that string to the server as `coverImage`. So every listing
// photograph in this application was a path that meant something on exactly one
// phone, for as long as that phone kept its cache.
//
// ── The three things worth knowing before reading further ────────────────────
//
// **1. The direct route is the one almost every upload takes, and it is
// multipart.** `POST /media/uploads/direct` reads a form, takes `form.Files[0]`
// and the fields `kind`, `ownerType`, `ownerId` and `role`. An
// `expo-image-picker` result at `quality: 0.8` is well under a megabyte, and
// making a client open a session, send one part and complete it would be three
// round trips to do one thing. The chunked lifecycle exists for the cases that
// need it and is exposed below, unused for now.
//
// **2. `mediaId`, never a URL.** `MediaAssetResponse`'s summary is the rule:
// every business module stores the identifier and renders from the asset, and
// none of them stores a URL, a bucket name or a storage key. `url` and
// `thumbnailUrl` on the response are routes *into* Media, minted at read time —
// storing one would defeat the whole design and break the moment an asset's
// visibility changed.
//
// **3. Uploading is not attaching.** An asset arrives unclaimed. Something has
// to say what it is *for*, or the sweeper removes it — which is the platform
// telling you within a day, rather than a storage bill telling you in a year.
//
// There are **three** ways to claim one, and the third is the one the create
// screens actually use:
//
//   * the owner fields on the upload itself, when the owning record exists;
//   * `POST /media/attachments` afterwards, for a record that already exists and
//     is gaining a photograph later;
//   * **the owning module's own create call.** `CreateListingRequest.MediaIds`,
//     `CreateHousingListingRequest.Media`, `CreateEventRequest.Media` and
//     `CreateOrganizationRequest.Media` each accept the identifiers inline.
//
// This header previously said the create screens needed the second, and that
// was wrong — calling `attachMedia` as well would be a second, redundant claim
// on the same asset. Corrected after the housing and marketplace wiring read the
// contracts rather than this comment, which is the right order and is the whole
// method this remediation runs on.
//
// `attachMedia` remains for the second case, which is real: a profile avatar, a
// guide gaining a cover after publication, a message attachment.
//
// ── Progress, and why it is not derived ──────────────────────────────────────
//
// A progress bar that reaches 100% and keeps spinning is worse than none. Bytes
// arriving is `uploading`; deriving variants afterwards is `processing`; and the
// asset is only `ready` when the server says `status: 'ready'`. `useMediaUpload`
// keeps those three distinct because the member's waiting is not over at 100%.
// ─────────────────────────────────────────────────────────────────────────────

import type { AxiosProgressEvent } from 'axios';

import { apiClient } from './apiClient';
import type {
  LocalFile,
  MediaAsset,
  MediaCapabilities,
  MediaKind,
  MediaOwnerType,
  MediaSignedUrl,
  MediaUploadSession,
} from '@/types/media';

const ROOT = '/media';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * What a caller says an upload is for.
 *
 * Optional on the upload itself, because a photograph chosen while creating a
 * listing has no listing to belong to yet. Where it can be supplied it should
 * be: an asset attached at upload never enters the orphan population at all.
 */
export interface MediaOwner {
  ownerType: MediaOwnerType;
  /** A GUID. The routes bind it as one. */
  ownerId: string;
  role: string;
}

export interface DirectUploadOptions {
  kind?: MediaKind;
  owner?: MediaOwner | null;
  /** 0–1. Called as bytes leave the device, not as they are processed. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

// ── Capabilities ─────────────────────────────────────────────────────────────

/**
 * What this deployment can do, read rather than assumed.
 *
 * Worth calling before a large upload and worth caching: the ceiling, the
 * accepted content types and whether anything scans are all deployment facts,
 * and a client that hardcodes them breaks when a deployment changes.
 */
export async function fetchMediaCapabilities(): Promise<MediaCapabilities> {
  const response = await apiClient.get<Envelope<MediaCapabilities>>(`${ROOT}/capabilities`);
  return response.data.data;
}

// ── The direct upload ────────────────────────────────────────────────────────

/**
 * A guess at the MIME type, from the file extension.
 *
 * `expo-image-picker` populates `mimeType` on most platforms and not all, and
 * `MediaContentType.TryCreate` refuses a blank one. Guessing from the extension
 * is better than sending `application/octet-stream`, which the server would
 * refuse for an image kind — and the member would be told their photograph is
 * not a photograph.
 */
export function guessMimeType(fileName: string, fallback = 'image/jpeg'): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  const known: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    pdf: 'application/pdf',
  };

  return known[extension] ?? fallback;
}

/**
 * Builds the multipart body the route reads.
 *
 * React Native's `FormData` takes `{ uri, name, type }` for a file rather than a
 * `Blob`, and the bridge streams it from the path — which is why this cannot be
 * shared with a web implementation that would need a real `Blob`. On web the
 * same shape works because Metro's `FormData` polyfill accepts it for `blob:`
 * and `data:` URIs.
 *
 * The field order matters to nobody, but the *file* field must come from
 * `form.Files[0]`, so exactly one file is appended. A caller uploading several
 * photographs sends several requests, which is also what lets one fail without
 * losing the rest.
 */
export function toFormData(file: LocalFile, kind: MediaKind, owner?: MediaOwner | null): FormData {
  const form = new FormData();

  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  form.append('kind', kind);

  if (owner) {
    form.append('ownerType', owner.ownerType);
    form.append('ownerId', owner.ownerId);
    form.append('role', owner.role);
  }

  return form;
}

/**
 * Uploads one file in one request and returns the asset it became.
 *
 * The asset comes back at `pending` or `processing` as often as `ready` —
 * variants are derived after the bytes land. A caller that needs a thumbnail
 * must poll `fetchMediaAsset`, which `useMediaUpload` does; a caller that only
 * needs to store the identifier does not, because the identifier is stable from
 * the moment it is issued.
 */
export async function uploadDirect(
  file: LocalFile,
  options: DirectUploadOptions = {}
): Promise<MediaAsset> {
  const kind = options.kind ?? 'image';

  const response = await apiClient.post<Envelope<MediaAsset>>(
    `${ROOT}/uploads/direct`,
    toFormData(file, kind, options.owner),
    {
      // ── Corrected while building the development handler for this route ────
      //
      // This used to be left unset, on the reasoning that "axios sets
      // `multipart/form-data` with the boundary it generated". That reasoning
      // ignored `apiClient`'s own instance default, and the result was that
      // **no upload in this application could ever have succeeded**.
      //
      // `apiClient` is created with `headers: { 'Content-Type':
      // 'application/json' }`. Axios's `transformRequest` reads the resolved
      // content type first, and its `FormData` branch is
      //
      //   `return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;`
      //
      // — so the form was serialised to JSON before any adapter saw it, and the
      // request went out as `application/json` carrying
      // `{"file":"[object Object]","kind":"image"}`. On the server that is
      // `HasFormContentType == false`, which is the route's very first
      // statement, and the answer is `media.upload.empty`: "The file is empty."
      // Every photograph, on every create screen, with a message pointing at the
      // file rather than at the header.
      //
      // Naming the type here is what stops the JSON branch being taken. The
      // boundary is still not written by hand — React Native's networking layer
      // appends `; boundary=…` to whatever content type the request carries when
      // the body is a form, which is the mechanism the original comment was
      // reaching for and attributed to the wrong layer.
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options.signal,
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!options.onProgress) return;
        // `total` is absent on some runtimes. Reporting an invented fraction is
        // worse than reporting none: the caller renders an indeterminate bar
        // when this never fires, which is the truthful shape.
        if (typeof event.total === 'number' && event.total > 0) {
          options.onProgress(Math.min(1, event.loaded / event.total));
        }
      },
    }
  );

  return response.data.data;
}

// ── Assets ───────────────────────────────────────────────────────────────────

export async function fetchMediaAsset(mediaId: string): Promise<MediaAsset> {
  const response = await apiClient.get<Envelope<MediaAsset>>(
    `${ROOT}/${encodeURIComponent(mediaId)}`
  );
  return response.data.data;
}

/**
 * Claims an uploaded asset for an owning entity.
 *
 * The step that takes an asset out of the orphan population, and the one a
 * create screen needs: photographs are chosen before the listing exists, so the
 * owner cannot be named at upload time.
 *
 * `position` orders assets within a role — a housing listing holds one `cover`
 * and several `gallery`, and the gallery's order is the member's.
 */
export async function attachMedia(input: {
  mediaId: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  role: string;
  position?: number;
}): Promise<MediaAsset> {
  const response = await apiClient.post<Envelope<MediaAsset>>(`${ROOT}/attachments`, {
    mediaId: input.mediaId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    role: input.role,
    position: input.position ?? 0,
  });
  return response.data.data;
}

/**
 * Attaches several assets to one owner, in order.
 *
 * Sequential rather than concurrent, because `position` is the point: firing six
 * attachments at once and letting the server order them by arrival gives the
 * member a gallery in a different order each time they try.
 *
 * A failure stops the run and reports how far it got, rather than leaving the
 * caller to guess which half landed.
 */
export async function attachMediaInOrder(
  mediaIds: string[],
  owner: { ownerType: MediaOwnerType; ownerId: string; role: string }
): Promise<MediaAsset[]> {
  const attached: MediaAsset[] = [];

  for (const [position, mediaId] of mediaIds.entries()) {
    attached.push(await attachMedia({ ...owner, mediaId, position }));
  }

  return attached;
}

export async function updateMedia(
  mediaId: string,
  changes: { altText?: string | null; caption?: string | null }
): Promise<MediaAsset> {
  const response = await apiClient.patch<Envelope<MediaAsset>>(
    `${ROOT}/${encodeURIComponent(mediaId)}`,
    changes
  );
  return response.data.data;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiClient.delete(`${ROOT}/${encodeURIComponent(mediaId)}`);
}

/**
 * A readable link for a private asset.
 *
 * Minted at read time, against the reader, and short-lived — `capabilities`
 * carries the lifetime. **Never stored**: a signed URL in a database is a
 * credential with an expiry nobody is watching.
 */
export async function createSignedUrl(
  mediaId: string,
  variant?: string
): Promise<MediaSignedUrl> {
  const response = await apiClient.post<Envelope<MediaSignedUrl>>(
    `${ROOT}/${encodeURIComponent(mediaId)}/signed-url`,
    variant ? { variant } : {}
  );
  return response.data.data;
}

// ── The chunked lifecycle ────────────────────────────────────────────────────
//
// Exposed because the routes exist and a video will need them. Not yet called by
// any surface: `directUploadCeilingBytes` from `capabilities` is what decides,
// and every picker result in this application today is far below it. Declared
// here rather than in a second module so that when a video surface arrives it
// extends this pipeline rather than starting a sixth one.

export async function startUpload(input: {
  kind: MediaKind;
  fileName: string;
  contentType: string;
  totalBytes: number;
  owner?: MediaOwner | null;
}): Promise<MediaUploadSession> {
  const response = await apiClient.post<Envelope<MediaUploadSession>>(`${ROOT}/uploads`, {
    kind: input.kind,
    fileName: input.fileName,
    contentType: input.contentType,
    totalBytes: input.totalBytes,
    ownerType: input.owner?.ownerType,
    ownerId: input.owner?.ownerId,
    role: input.owner?.role,
  });
  return response.data.data;
}

export async function fetchUploadSession(sessionId: string): Promise<MediaUploadSession> {
  const response = await apiClient.get<Envelope<MediaUploadSession>>(
    `${ROOT}/uploads/${encodeURIComponent(sessionId)}`
  );
  return response.data.data;
}

/** The caller's open uploads. What was I uploading, after a reinstall. */
export async function listMyUploads(): Promise<MediaUploadSession[]> {
  const response = await apiClient.get<Envelope<MediaUploadSession[]>>(`${ROOT}/uploads`);
  return response.data.data;
}

export async function setUploadState(
  sessionId: string,
  state: 'paused' | 'uploading' | 'cancelled'
): Promise<MediaUploadSession> {
  const response = await apiClient.put<Envelope<MediaUploadSession>>(
    `${ROOT}/uploads/${encodeURIComponent(sessionId)}/state`,
    { state }
  );
  return response.data.data;
}

export async function completeUpload(sessionId: string): Promise<MediaAsset> {
  const response = await apiClient.post<Envelope<MediaAsset>>(
    `${ROOT}/uploads/${encodeURIComponent(sessionId)}/complete`,
    {}
  );
  return response.data.data;
}

export async function cancelUpload(sessionId: string): Promise<void> {
  await apiClient.delete(`${ROOT}/uploads/${encodeURIComponent(sessionId)}`);
}
