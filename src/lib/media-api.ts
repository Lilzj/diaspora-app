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


import { API_BASE_URL, accessTokenForTransport, apiClient } from './apiClient';
import { areSimulatedFeaturesEnabled } from '@/config/gap-preview';
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

/**
 * How long an upload may take.
 *
 * Not `REQUEST_TIMEOUT_MS`. Thirty seconds is chosen in `apiClient` for a
 * gateway round trip carrying a few kilobytes of JSON; a photograph on a slow
 * mobile connection is a different transaction, and killing it at the same
 * ceiling turns a working upload into a failure the member can do nothing
 * about. Two minutes is roughly a 5 MB ceiling — what
 * `verificationDocument` accepts — over a poor 3G link.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

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
 * The longest edge a photo is sent at, and the JPEG quality it is sent with.
 *
 * A phone camera produces four to six thousand pixels across and several
 * megabytes; nothing on this platform renders a listing photo larger than a
 * full-width card. 1600px is generous for that and roughly a tenth of the
 * bytes.
 *
 * It is a **ceiling on the longer edge**, not a width. The first version of
 * this said `resize({ width: 1600 })`, which is neither: it scales *to* that
 * width whichever way the photograph is turned. Watched on a device on
 * 21 Sep 2026, a 1080x2400 portrait image was enlarged to 1600x3556 and the
 * JPEG that came out was 142,646 bytes against the 138,689 it started at —
 * a shrinking step that made the upload bigger, and left the long edge
 * untouched at over three thousand pixels.
 */
const MAX_IMAGE_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

/**
 * `expo-image-manipulator`, through an optional require.
 *
 * The same shape `device-location` uses, for the same reason: a missing native
 * module becomes a runtime `null` rather than a broken bundle, and an upload
 * that cannot be shrunk is still an upload.
 */
function loadImageManipulator(): typeof import('expo-image-manipulator') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator');
  } catch {
    return null;
  }
}

const imageManipulator = loadImageManipulator();

/**
 * Sends a photo at a size worth sending.
 *
 * **`quality` on the picker was never going to do this.** `ImagePicker` applies
 * it when it encodes a JPEG and ignores it for a PNG, which is lossless — so
 * every asset uploaded to production before 21 Sep 2026 was a full-size PNG,
 * and a real camera photo would have gone up at several megabytes. Neither is
 * resized by `quality` at all.
 *
 * That matters for members, not benchmarks. Kestrel refuses a request body
 * arriving under `MinRequestBodyDataRate` — 240 bytes a second after a five
 * second grace — with a 408, and this platform has been watched doing it: a
 * 28KB body was refused minutes after a 187KB one had managed 3KB/s over the
 * same link. The fewer bytes a weak connection has to carry, the more uploads
 * finish.
 *
 * **Downscaling only, and only when there is something to take off.** A photo
 * already inside the ceiling is passed through untouched — not re-encoded,
 * because re-encoding it is how a 138KB screenshot became a 142KB upload.
 *
 * Failure here is not failure: an image that cannot be re-encoded is uploaded
 * as it came. Refusing to upload a photo because it could not be made smaller
 * would be the shrinking step deciding what the member may post.
 */
async function shrinkForUpload(file: LocalFile): Promise<LocalFile> {
  if (!imageManipulator) return file;

  try {
    // Measured, not assumed. `ImagePicker` does report dimensions, but this
    // module is also reached from callers that build a `LocalFile` by hand, and
    // the decision below is wrong in both directions without real numbers.
    // `renderAsync` hands back a native reference carrying them, and
    // `manipulate` takes that reference — so the file is read once, not twice.
    const measured = await imageManipulator.ImageManipulator.manipulate(file.uri).renderAsync();

    if (Math.max(measured.width, measured.height) <= MAX_IMAGE_EDGE_PX) {
      return file;
    }

    const context = imageManipulator.ImageManipulator.manipulate(measured);

    // The longer edge is the one that gets the ceiling; the other follows the
    // ratio. Naming the wrong one leaves the photograph as tall as it was.
    context.resize(
      measured.width >= measured.height
        ? { width: MAX_IMAGE_EDGE_PX }
        : { height: MAX_IMAGE_EDGE_PX }
    );

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: imageManipulator.SaveFormat.JPEG,
      compress: JPEG_QUALITY,
    });

    return {
      uri: saved.uri,
      // Re-encoded, so the name and type say JPEG whatever arrived.
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: null,
    };
  } catch {
    return file;
  }
}

/**
 * Uploads one file in one request and returns the asset it became.
 *
 * The asset comes back at `pending` or `processing` as often as `ready` —
 * variants are derived after the bytes land. A caller that needs a thumbnail
 * must poll `fetchMediaAsset`, which `useMediaUpload` does; a caller that only
 * needs to store the identifier does not, because the identifier is stable from
 * the moment it is issued.
 *
 * ── Why there are two transports ──────────────────────────────────────────
 *
 * The real upload cannot go through axios — see `uploadOverXhr` for the
 * multipart boundary this is all about. But the development mock adapter is
 * installed *on `apiClient`*, so an XHR request walks straight past it and out
 * to whatever `API_BASE_URL` names. In a gap-preview build that is a request to
 * a real server with a mock member's token, which is exactly what the mock
 * adapter exists to prevent.
 *
 * So the mock build keeps the axios path. It is safe there for the reason it is
 * unsafe in production: `MockAdapter` answers before any adapter runs, so the
 * body is never serialised and the missing boundary can never matter.
 * `areSimulatedFeaturesEnabled()` is a runtime read of `__DEV__` and one
 * `EXPO_PUBLIC_` flag, so a signed release takes the XHR branch — always.
 */
export async function uploadDirect(
  file: LocalFile,
  options: DirectUploadOptions = {}
): Promise<MediaAsset> {
  const kind = options.kind ?? 'image';

  // Above the transport split, because the size of a photo is a property of the
  // photo and not of how it travels. Putting it in the real branch only would
  // mean a dev build never exercised it.
  const toSend = kind === 'image' ? await shrinkForUpload(file) : file;

  if (areSimulatedFeaturesEnabled()) {
    return uploadThroughMockAdapter(toSend, kind, options);
  }

  return uploadOverXhr(toSend, kind, await accessTokenForTransport(), options);
}

/**
 * The mock-build transport. Only ever reached when `MockAdapter` is installed,
 * so this never puts a body on a socket.
 *
 * The content type is named here for the reason the old real implementation
 * named it: `apiClient`'s instance default is `application/json`, and axios's
 * `transformRequest` would serialise a form to JSON when it saw one. The mock
 * handler matches on it.
 */
async function uploadThroughMockAdapter(
  file: LocalFile,
  kind: MediaKind,
  options: DirectUploadOptions
): Promise<MediaAsset> {
  const response = await apiClient.post<Envelope<MediaAsset>>(
    `${ROOT}/uploads/direct`,
    toFormData(file, kind, options.owner),
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options.signal,
    }
  );

  options.onProgress?.(1);

  return response.data.data;
}

/**
 * The real transport, and the reason this function is not `apiClient.post`.
 *
 * React Native's `FormData` generates a boundary and builds the body with it,
 * but it writes the `Content-Type` header — `multipart/form-data; boundary=…`
 * — only for a request that has not already declared one. Axios always
 * declares one: naming `multipart/form-data` sends it verbatim, *without* the
 * boundary, and deleting it in `transformRequest` makes axios fall back to
 * `application/x-www-form-urlencoded`. Either way the server receives a
 * multipart body with no delimiter it can find.
 *
 * `XMLHttpRequest` is what React Native's `FormData` was built against, so
 * setting no content type at all is possible here and nowhere else.
 */
function uploadOverXhr(
  file: LocalFile,
  kind: MediaKind,
  token: string | null,
  options: DirectUploadOptions
): Promise<MediaAsset> {
  return new Promise<MediaAsset>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('POST', `${API_BASE_URL}${ROOT}/uploads/direct`);

    // **No Content-Type is set, and that is the whole point.** React Native
    // generates the boundary, builds the body with it, and writes
    // `multipart/form-data; boundary=…` itself — but only for a request that
    // has not already declared a type. Declaring one leaves the server with a
    // body it has no delimiter for.
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('Accept', 'application/json');

    request.timeout = UPLOAD_TIMEOUT_MS;
    request.responseType = 'text';

    if (options.onProgress) {
      request.upload.onprogress = (event) => {
        // `lengthComputable` is the honest guard. Reporting an invented
        // fraction is worse than reporting none: the caller renders an
        // indeterminate bar when this never fires, which is the truthful shape.
        if (event.lengthComputable && event.total > 0) {
          options.onProgress?.(Math.min(1, event.loaded / event.total));
        }
      };
    }

    /** Shaped like an axios error, because `messageFor` reads `response.data.detail`. */
    const fail = (status: number, body: unknown, fallback: string) =>
      reject(Object.assign(new Error(fallback), { response: { status, data: body } }));

    request.onload = () => {
      let body: unknown = null;

      try {
        body = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        body = null;
      }

      if (request.status >= 200 && request.status < 300) {
        const asset = (body as Envelope<MediaAsset> | null)?.data;

        if (!asset) {
          fail(request.status, body, 'The upload succeeded but returned nothing.');
          return;
        }

        resolve(asset);
        return;
      }

      fail(request.status, body, `Upload failed with ${request.status}.`);
    };

    request.onerror = () => fail(0, null, 'The upload could not reach Diaspora.');
    request.ontimeout = () => fail(0, null, 'The upload timed out.');
    request.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { aborted: true }));

    if (options.signal) {
      if (options.signal.aborted) {
        request.abort();
        return;
      }

      options.signal.addEventListener('abort', () => request.abort(), { once: true });
    }

    request.send(toFormData(file, kind, options.owner) as unknown as XMLHttpRequestBodyInit);
  });
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
