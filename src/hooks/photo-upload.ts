// ─────────────────────────────────────────────────────────────────────────────
// One photograph, chosen and uploaded — 27 Nov 2026 (FARCH-007)
//
// The home and marketplace wizards and the marketplace edit screen each picked
// a photograph their own way: their own permission requests and refusal
// wording, their own "Take Photo (Camera) / Choose from Gallery" sheet, and the
// same pick, upload and hold, three times over. The home edit screen wrote the
// pick and the upload a fourth time around the shared chooser. This is that
// code once. The chooser and the camera or gallery are `usePhotoSource`'s, the
// upload is `useMediaUpload`'s, and what reaches the screen is a `ChosenPhoto`
// the platform already holds.
//
// One upload per hook. `useMediaUpload` aborts whatever it was doing when a new
// upload starts, so a cover and a gallery take one each: sharing one would mean
// that adding a gallery photo silently cancelled a cover still going up.
//
// `PhotoDropZone` stays presentational, as it was designed to be. This hook is
// the other half: what the drop zone says about the upload comes from here.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';

import { useMediaUpload, toLocalFile } from '@/hooks/media';
import { usePhotoSource, type PhotoLaunchOptions, type PhotoSource } from '@/hooks/photo-source';
import type { ChosenPhoto } from '@/types/media';

/** How the wizards have always opened the camera and the gallery. */
const DEFAULT_LAUNCH: PhotoLaunchOptions = { allowsEditing: true, quality: 0.8 };

/**
 * One photograph at a time, uploaded before it is handed over.
 *
 * `title` heads the camera-or-gallery question, in the screen's own words.
 */
export function usePhotoUpload(title: string, launchOptions: PhotoLaunchOptions = DEFAULT_LAUNCH) {
  const photoSource = usePhotoSource();
  const upload = useMediaUpload({ kind: 'image' });

  /** One photograph from that source, uploaded: null if refused, backed out of, or not received. */
  const takeFrom = useCallback(
    async (source: PhotoSource): Promise<ChosenPhoto | null> => {
      const picked = (await photoSource.launch(source, launchOptions))?.[0];
      if (!picked) return null;

      const asset = await upload.upload(toLocalFile(picked));
      // Null is a failed or cancelled upload. The upload holds the server's own
      // sentence and the drop zone shows it; nothing reaches the screen, because
      // a photograph the platform never received must not sit in a grid looking
      // exactly like one it did.
      if (!asset) return null;

      // The device's copy is the preview until the platform has a rendition of
      // its own. A direct upload answers before variants are derived, so the
      // thumbnail is usually still null here; the identifier is what is posted,
      // and it is stable from this moment whatever the preview shows.
      return { mediaId: asset.mediaId, previewUri: asset.thumbnailUrl ?? picked.uri };
    },
    [launchOptions, photoSource, upload]
  );

  /**
   * Ask camera or gallery, then pick and upload. `onPhoto` hears only of a
   * photograph the platform holds; nothing starts until a source is chosen.
   */
  const choose = useCallback(
    (onPhoto: (photo: ChosenPhoto) => void) => {
      photoSource.ask(title, (source) => {
        void takeFrom(source).then((photo) => {
          if (photo) onPhoto(photo);
        });
      });
    },
    [photoSource, takeFrom, title]
  );

  return {
    choose,
    upload,
    /**
     * The upload as `PhotoDropZone` says it. Uploading and processing are
     * different waits, said differently: a bar that reaches 100% and keeps
     * spinning reads as stuck. A refusal is the server's own sentence, because
     * it knows whether the file was too large, the wrong type or refused by a
     * scanner, and each needs a different next step from the member.
     */
    dropZone: {
      busy: upload.isUploading,
      busyLabel: upload.phase === 'processing' ? 'Processing…' : `Uploading ${Math.round(upload.progress * 100)}%`,
      error: upload.phase === 'failed' ? upload.error : null,
    },
  };
}

/** What `usePhotoUpload` gives a screen. */
export type PhotoUpload = ReturnType<typeof usePhotoUpload>;
