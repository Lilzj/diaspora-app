// List a home: the cover and gallery photographs, each uploaded before it is held.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { type AlertOptions, useNotification } from '@/providers/notification-provider';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import type { ChosenPhoto } from '@/types/media';

/** The designed alert modal, passed to helpers that sit outside a component. */
type ShowAlert = (options: AlertOptions) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave E — these two helpers used to end `return result.assets[0].uri`.
//
// That is a `file:///…` path into this app's own cache directory. It means
// something on exactly one device, for as long as that device keeps its cache,
// and nothing at all to the server. This screen stored it and posted it as
// `coverImage`, so every property photograph in this application was a path only
// the phone that took it could resolve.
//
// They now return the **picked asset**, and the upload happens in the component
// through the one media pipeline (`hooks/media` → `lib/media-api`). It has to be
// in the component: `useMediaUpload` is a hook, and progress and failure are
// things a member has to be able to see. What these helpers still own is the
// permission dance — which is why they stay at module scope, taking the alert
// function from their caller so a refusal lands in the designed modal rather
// than the operating system's dialog.
// ─────────────────────────────────────────────────────────────────────────────
const pickFromGallery = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your photos to upload images.' });
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

const pickFromCamera = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your camera to take photos.' });
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

export function useHousingPhotos() {
  const { showAlert } = useNotification();

  // STEP 6: Photos
  //
  // Empty, and empty renders as empty. Both of these used to be seeded with
  // Unsplash URLs, so a property listed without a single photograph was posted
  // and previewed as though it had three.
  const [coverPhoto, setCoverPhoto] = useState<ChosenPhoto | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<ChosenPhoto[]>([]);

  // Two upload slots rather than one, because `useMediaUpload` aborts whatever
  // it was doing when a new upload starts — sharing a single instance would mean
  // adding a gallery photo silently cancelled the cover that was still going up.
  const coverUpload = useMediaUpload({ kind: 'image' });
  const galleryUpload = useMediaUpload({ kind: 'image' });

  // The hook's own definition of busy: `uploading` *or* `processing`. The
  // member's waiting is not over when the bytes land — variants are derived
  // afterwards — and a picker reopened in between would abort the slot.
  const coverBusy = coverUpload.isUploading;
  const galleryBusy = galleryUpload.isUploading;

  /**
   * A picked file, uploaded, as something this screen can hold.
   *
   * The single point where a device path becomes a platform identifier — there
   * is one upload implementation in this application and this calls it.
   */
  const uploadPicked = useCallback(
    async (
      picked: ImagePicker.ImagePickerAsset,
      slot: ReturnType<typeof useMediaUpload>
    ): Promise<ChosenPhoto | null> => {
      const asset = await slot.upload(toLocalFile(picked));

      // Null is a failed or cancelled upload. The slot holds the server's own
      // sentence and step 6 renders it; nothing enters state. That is the point
      // of returning early rather than storing the local URI as a consolation:
      // a photograph the platform never received must not sit in the grid
      // looking exactly like one it did.
      if (!asset) return null;

      // The device's copy is the preview until the platform has a rendition of
      // its own. A direct upload answers at `pending` or `processing` — variants
      // are derived afterwards — so `thumbnailUrl` is usually still null here,
      // and `asset.url` is a route into Media rather than an image that is ready
      // to paint. The identifier below is the part that gets posted, and it is
      // stable from this moment whatever the preview is showing.
      return {
        mediaId: asset.mediaId,
        previewUri: asset.thumbnailUrl ?? picked.uri,
      };
    },
    []
  );

  const chooseCoverPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, coverUpload);
      if (photo) setCoverPhoto(photo);
    },
    [coverUpload, showAlert, uploadPicked]
  );

  const addGalleryPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, galleryUpload);
      // Appended, so the member's order is the order the gallery is sent in.
      if (photo) setGalleryPhotos(prev => [...prev, photo]);
    },
    [galleryUpload, showAlert, uploadPicked]
  );

  const handleCoverPhotoSelect = async () => {
    const title = 'Select Cover Image';
    const message = 'Choose an action to add your property cover photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void chooseCoverPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void chooseCoverPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await chooseCoverPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  const handleAddGalleryPhoto = async () => {
    const title = 'Select Gallery Image';
    const message = 'Choose an action to add a property gallery photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void addGalleryPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void addGalleryPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await addGalleryPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  return {
    coverPhoto, setCoverPhoto, galleryPhotos, setGalleryPhotos, coverUpload, galleryUpload,
    coverBusy, galleryBusy, handleCoverPhotoSelect, handleAddGalleryPhoto,
  };
}

/** What `useHousingPhotos` holds, as the screen reads it. */
export type HousingPhotos = ReturnType<typeof useHousingPhotos>;
