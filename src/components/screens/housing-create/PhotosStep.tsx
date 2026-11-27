// List a home, step 6: the cover and gallery photographs.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { PhotoDropZone } from '@/components/PhotoDropZone';
import type { HousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';

interface PhotosStepProps {
  photos: HousingPhotos;
}

export function PhotosStep({ photos }: PhotosStepProps) {
  const {
    coverPhoto, galleryPhotos, setGalleryPhotos, coverUpload, galleryUpload, coverBusy, galleryBusy,
    handleCoverPhotoSelect, handleAddGalleryPhoto,
  } = photos;

  return (
    <View className="pb-8">
      <Text className="text-sm text-content-muted mb-6 leading-relaxed">
        Add high-quality photos representing your property space. You can select files from your library or take new photos.
      </Text>

      {/* Three controls, one design.

          Each of these asks the member for a photograph, and until
          today each asked differently: a 160px dashed panel, an 85px
          dashed square reading "+ ADD PHOTO", and a thin bordered row.
          Nothing about the task differs between them, so the only
          thing that differs now is the heading and what it asks for. */}
      <PhotoDropZone
        label="Cover Image *"
        prompt="Tap to upload cover image"
        previewUri={coverPhoto?.previewUri ?? null}
        changeLabel="📷 Change Cover Photo"
        busy={coverBusy}
        busyLabel={
          coverUpload.phase === 'processing'
            ? 'Processing…'
            : `Uploading ${Math.round(coverUpload.progress * 100)}%`
        }
        // The platform's own sentence where it gave one — it knows
        // whether the file was too large, the wrong type or refused by
        // a scanner, and each needs a different next step. Nothing was
        // added to the listing, and this is how they find that out.
        error={coverUpload.phase === 'failed' ? coverUpload.error : null}
        onPress={handleCoverPhotoSelect}
      />

      <PhotoDropZone
        label="Gallery Images"
        prompt="Tap to add a gallery photo"
        busy={galleryBusy}
        busyLabel={
          galleryUpload.phase === 'processing'
            ? 'Processing…'
            : `Uploading ${Math.round(galleryUpload.progress * 100)}%`
        }
        error={galleryUpload.phase === 'failed' ? galleryUpload.error : null}
        onPress={handleAddGalleryPhoto}
      >
        {/* Above the panel rather than inside it: these are a set the
            member has already built, and the panel is the thing that
            adds to it. A photograph mid-upload is in neither — showing
            it in the grid would put it in the listing before the
            platform had agreed to hold it — so the wait is the panel's
            overlay, which is where every other wait on this step is. */}
        {galleryPhotos.length > 0 && (
          <View className="flex-row flex-wrap gap-3.5 mb-3">
            {galleryPhotos.map((photo, index) => (
              <View
                key={`${photo.mediaId}-${index}`}
                className="w-[85px] h-[85px] rounded-2xl overflow-hidden border border-subtle relative bg-surface-muted"
              >
                <Image
                  source={{ uri: photo.previewUri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
                <TouchableOpacity
                  onPress={() =>
                    setGalleryPhotos(galleryPhotos.filter((_, idx) => idx !== index))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove gallery photo ${index + 1}`}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 items-center justify-center"
                >
                  <Text className="text-[10px] font-black text-white">✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </PhotoDropZone>

      {/* There was a third control here, headed "Select Fallback Cover
          Image". It called `handleCoverPhotoSelect` — the same handler
          as "Cover Image" above — and there was no fallback of any kind
          behind it, in this screen or in the contract. It was a second
          door to the cover photograph under a name that promised
          something else, and drawing it like the others is what made
          that visible. Removed 21 Sep 2026. */}
    </View>
  );
}
