// ─────────────────────────────────────────────────────────────────────────────
// Camera or gallery — one chooser for every photo (Android UAT, 3 Nov 2026)
//
// The "Register Hub" logo and cover went straight to the gallery while other
// screens asked "Take photo, or choose from gallery". Six screens opened the
// library directly, `ImagePickerInput` offered the camera only when a caller
// opted in, and when one did it opened the front camera to photograph an item.
//
// `ask` shows the choice and calls back with the answer. It deliberately does
// not return a promise: Android's back button closes the dialog without
// pressing any button, so a chooser awaited by a screen that had already
// set itself busy would leave it spinning. Nothing starts until a source is
// picked.
//
// `launch` asks for that source's permission, opens it, and answers the chosen
// assets or `null` (refused, or the member backed out). The camera is the back
// one unless the caller asks for the front, as the selfie step does.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { useNotification } from '@/providers/notification-provider';

export type PhotoSource = 'camera' | 'library';

export type PhotoLaunchOptions = Omit<ImagePicker.ImagePickerOptions, 'cameraType' | 'mediaTypes'> & {
  /** Which way the camera faces. The back, unless this is a selfie. */
  cameraType?: 'front' | 'back';
};

export function usePhotoSource() {
  const { showAlert } = useNotification();

  const ask = useCallback(
    (title: string, pick: (source: PhotoSource) => void) => {
      showAlert({
        type: 'info',
        title,
        message: 'Take a new photo, or choose one you already have.',
        buttons: [
          { text: 'Take photo', onPress: () => pick('camera') },
          { text: 'Choose from gallery', onPress: () => pick('library') },
          // Styled as a cancel so the dialog does not read as three things
          // worth doing.
          { text: 'Cancel', style: 'cancel' },
        ],
      });
    },
    [showAlert]
  );

  const launch = useCallback(
    async (source: PhotoSource, options: PhotoLaunchOptions): Promise<ImagePicker.ImagePickerAsset[] | null> => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        showAlert(
          source === 'camera'
            ? {
                type: 'error',
                title: 'Camera permission needed',
                message: 'Diaspora needs access to your camera to take this photo.',
              }
            : {
                type: 'error',
                title: 'Permission needed',
                message: 'Diaspora needs access to your photo library to pick images.',
              }
        );
        return null;
      }

      const { cameraType = 'back', ...rest } = options;
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              ...rest,
              mediaTypes: ['images'],
              cameraType: cameraType === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
            })
          : await ImagePicker.launchImageLibraryAsync({ ...rest, mediaTypes: ['images'] });

      return result.canceled || !result.assets?.length ? null : result.assets;
    },
    [showAlert]
  );

  return { ask, launch };
}
