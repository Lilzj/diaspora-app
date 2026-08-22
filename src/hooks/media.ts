// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Media hooks (Remediation Wave E)
//
// The stable interface over `lib/media-api.ts`. A screen chooses a file and gets
// back a `mediaId`; it never sees a form, a session, a chunk or a poll.
//
// ── Why `processing` is a phase and not a spinner ────────────────────────────
//
// A direct upload answers as soon as the bytes land, and the asset comes back
// `pending` or `processing` at least as often as `ready` — variants are derived
// afterwards. So the honest sequence a member experiences is:
//
//   uploading   bytes are moving; the fraction is real
//   processing  they have arrived and the platform is deriving renditions
//   ready       there is a thumbnail
//
// Collapsing the middle one gives a progress bar that reaches 100% and keeps
// spinning, which reads as a stuck upload. Keeping it lets the screen say
// "processing your photo" — which is both true and shorter than the wait feels
// without it.
//
// **The identifier is stable from the first response.** A caller that only needs
// to store `mediaId` can act at `processing` and does not have to wait; the poll
// exists so a *preview* can appear, not so the value can be used.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  attachMediaInOrder,
  fetchMediaAsset,
  fetchMediaCapabilities,
  guessMimeType,
  uploadDirect,
  type MediaOwner,
} from '@/lib/media-api';
import type {
  LocalFile,
  MediaAsset,
  MediaCapabilities,
  MediaKind,
  MediaOwnerType,
  MediaUploadState,
} from '@/types/media';

/**
 * What this deployment allows.
 *
 * Cached for an hour: the ceiling and the accepted types change with a
 * deployment, not with a member's session, and asking on every picker open would
 * be a request per photograph for an answer that has not moved.
 */
export function useMediaCapabilities(): {
  capabilities: MediaCapabilities | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['media', 'capabilities'],
    queryFn: fetchMediaCapabilities,
    staleTime: 60 * 60 * 1000,
    // One retry. A missing capability answer must not block a picker — the
    // upload is attempted and the server refuses it if it is too large, which is
    // a worse message but not a broken feature.
    retry: 1,
  });

  return { capabilities: query.data ?? null, isLoading: query.isLoading };
}

const IDLE: MediaUploadState = { phase: 'idle', progress: 0, asset: null, error: null };

/** How long to keep asking whether renditions are ready before giving up on the preview. */
const PROCESSING_POLL_MS = 1500;
const PROCESSING_POLL_LIMIT = 8;

export interface UseMediaUploadOptions {
  kind?: MediaKind;
  /**
   * The owning record, when it already exists.
   *
   * Supply it wherever possible: an asset attached at upload never enters the
   * orphan population, and the sweeper never has to reclaim it. A create screen
   * cannot — the listing does not exist yet — which is what `attachAll` below is
   * for.
   */
  owner?: MediaOwner | null;
}

/**
 * Uploads one file and reports where it is.
 *
 * Returns the asset rather than only the id, because a caller almost always
 * wants the thumbnail as well — and because handing back a bare string would
 * invite the same mistake this wave is fixing, where the *string* a screen holds
 * turns out not to be the one the platform understands.
 */
export function useMediaUpload(options: UseMediaUploadOptions = {}) {
  const [state, setState] = useState<MediaUploadState>(IDLE);

  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A screen dismissed mid-upload must not leave a request in flight
      // updating state on an unmounted component, and must not leave a poll
      // running for a preview nobody will see.
      abort.current?.abort();
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const settle = useCallback((next: MediaUploadState) => {
    if (mounted.current) setState(next);
  }, []);

  /**
   * Waits for renditions, then stops.
   *
   * Bounded rather than open-ended. A `quarantined` or `failed` asset never
   * becomes `ready`, and polling for it forever would be a screen that never
   * settles; giving up leaves the asset at `processing`, which is the truthful
   * last thing known about it. The identifier is already usable either way.
   */
  const pollUntilReady = useCallback(
    (asset: MediaAsset, attempt = 0) => {
      if (asset.status === 'ready' || asset.status === 'failed' || asset.status === 'quarantined') {
        settle({
          phase: asset.status === 'ready' ? 'ready' : 'failed',
          progress: 1,
          asset,
          error:
            asset.status === 'quarantined'
              ? 'This file did not pass our safety check.'
              : asset.status === 'failed'
                ? 'This file could not be processed.'
                : null,
        });
        return;
      }

      if (attempt >= PROCESSING_POLL_LIMIT) {
        // Not an error. The upload succeeded and the identifier is good; only
        // the preview is late.
        settle({ phase: 'processing', progress: 1, asset, error: null });
        return;
      }

      pollTimer.current = setTimeout(() => {
        void fetchMediaAsset(asset.mediaId)
          .then((fresh) => pollUntilReady(fresh, attempt + 1))
          .catch(() => settle({ phase: 'processing', progress: 1, asset, error: null }));
      }, PROCESSING_POLL_MS);
    },
    [settle]
  );

  const upload = useCallback(
    async (file: LocalFile): Promise<MediaAsset | null> => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      settle({ phase: 'uploading', progress: 0, asset: null, error: null });

      try {
        const asset = await uploadDirect(file, {
          kind: options.kind ?? 'image',
          owner: options.owner,
          signal: controller.signal,
          onProgress: (fraction) =>
            settle({ phase: 'uploading', progress: fraction, asset: null, error: null }),
        });

        settle({ phase: 'processing', progress: 1, asset, error: null });
        pollUntilReady(asset);

        // Returned at `processing` rather than after the poll: the identifier is
        // stable from here and a caller that only needs to store it should not
        // wait twelve seconds for a thumbnail it is not going to render.
        return asset;
      } catch (cause) {
        if (controller.signal.aborted) {
          settle({ ...IDLE, phase: 'cancelled' });
          return null;
        }

        settle({
          phase: 'failed',
          progress: 0,
          asset: null,
          error: messageFor(cause),
        });
        return null;
      }
    },
    [options.kind, options.owner, pollUntilReady, settle]
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const reset = useCallback(() => settle(IDLE), [settle]);

  return useMemo(
    () => ({
      ...state,
      isUploading: state.phase === 'uploading' || state.phase === 'processing',
      upload,
      cancel,
      reset,
    }),
    [state, upload, cancel, reset]
  );
}

/**
 * Claims a set of uploaded assets once the owning record exists.
 *
 * The create-screen half of the pipeline: photographs are chosen before a
 * listing has an id, so the owner is named afterwards. Order is preserved —
 * `position` is the member's chosen gallery order, and firing the attachments
 * concurrently would let the server receive them in whichever order the network
 * delivered.
 */
export function useMediaAttachment() {
  const [isAttaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachAll = useCallback(
    async (
      mediaIds: string[],
      owner: { ownerType: MediaOwnerType; ownerId: string; role: string }
    ): Promise<boolean> => {
      if (mediaIds.length === 0) return true;

      setAttaching(true);
      setError(null);

      try {
        await attachMediaInOrder(mediaIds, owner);
        return true;
      } catch (cause) {
        setError(messageFor(cause));
        return false;
      } finally {
        setAttaching(false);
      }
    },
    []
  );

  return { attachAll, isAttaching, error };
}

/**
 * One asset, resolved from the `mediaId` a business module stored.
 *
 * Added in Wave D-3, because every module on this platform stores media **by
 * reference** (ADR-005) and none of them stores a URL: `GuideResponse` carries
 * `mediaReferences[].mediaId`, `GuideCardResponse` carries `heroMediaId`, and
 * `EmbassyResponse` carries `mediaId`. A screen holding one of those has an
 * identifier and nothing renderable until it makes this call.
 *
 * **Deliberately not used on list rows.** A page of twenty cards would make
 * twenty of these, so lists render a placeholder and detail screens resolve the
 * one image they show. The alternative — a batch route — does not exist on
 * `/media`, and inventing a fabricated URL is what this whole wave removes.
 *
 * An hour's `staleTime`: an asset's variants are derived once and do not change
 * under a reader.
 */
export function useMediaAsset(mediaId: string | null | undefined): {
  asset: MediaAsset | null;
  /** The best renderable URL, or null. Never a storage key or a provider URL. */
  url: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ['media', 'asset', mediaId ?? null],
    queryFn: () => fetchMediaAsset(mediaId as string),
    enabled: Boolean(mediaId),
    staleTime: 60 * 60 * 1000,
    // A missing asset is final: the reference is dangling and a retry cannot
    // undangle it.
    retry: (failureCount, cause) => {
      const status = (cause as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) return false;
      return failureCount < 1;
    },
  });

  const asset = query.data ?? null;

  return {
    asset,
    url: asset?.url ?? asset?.thumbnailUrl ?? null,
    isLoading: query.isLoading,
  };
}

/**
 * A picker result, as the upload pipeline wants it.
 *
 * One place rather than at each picker, because `expo-image-picker` populates
 * `fileName` and `mimeType` on some platforms and not others, and a screen that
 * handles that itself handles it slightly differently from the next screen.
 */
export function toLocalFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): LocalFile {
  // The URI's last segment is a better name than a constant: it usually carries
  // the extension, which is what `guessMimeType` reads.
  const fromUri = asset.uri.split('/').pop()?.split('?')[0] ?? 'upload.jpg';
  const name = asset.fileName?.trim() || fromUri;

  return {
    uri: asset.uri,
    name,
    mimeType: asset.mimeType?.trim() || guessMimeType(name),
    sizeBytes: asset.fileSize ?? null,
  };
}

/**
 * A sentence a member can act on.
 *
 * The platform's problem envelope carries `detail`, and where it does that is
 * the message worth showing — the server knows whether the file was too large,
 * the wrong type or refused by a scanner, and each needs a different next step
 * from the member.
 */
function messageFor(cause: unknown): string {
  const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;

  return 'That file could not be uploaded. Please try again.';
}
