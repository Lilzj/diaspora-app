// List a home: the cover and gallery photographs, each uploaded before it is held.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it. Choosing
// and uploading a photograph is `usePhotoUpload`'s since 27 Nov 2026 (FARCH-007).

import { useState } from 'react';
import { usePhotoUpload } from '@/hooks/photo-upload';
import type { ChosenPhoto } from '@/types/media';

export function useHousingPhotos() {
  // STEP 6: Photos
  //
  // Empty, and empty renders as empty. Both of these used to be seeded with
  // Unsplash URLs, so a property listed without a single photograph was posted
  // and previewed as though it had three.
  const [coverPhoto, setCoverPhoto] = useState<ChosenPhoto | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<ChosenPhoto[]>([]);

  // An upload each: one shared would let a gallery photo cancel a cover still going up.
  const cover = usePhotoUpload('Select Cover Image');
  const gallery = usePhotoUpload('Select Gallery Image');

  const handleCoverPhotoSelect = () => cover.choose(setCoverPhoto);

  // Appended, so the member's order is the order the gallery is sent in.
  const handleAddGalleryPhoto = () => gallery.choose((photo) => setGalleryPhotos((prev) => [...prev, photo]));

  return {
    coverPhoto, setCoverPhoto, galleryPhotos, setGalleryPhotos, cover, gallery,
    handleCoverPhotoSelect, handleAddGalleryPhoto,
  };
}

/** What `useHousingPhotos` holds, as the screen reads it. */
export type HousingPhotos = ReturnType<typeof useHousingPhotos>;
