// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Image picker (Remediation Wave E)
//
// **What this component used to hand back was a lie, and the lie was one line.**
//
//   onChangeImage(result.assets[0].uri);
//
// That is a `file:///…` path into the app's own cache directory. It means
// something on exactly one device, for as long as that device keeps its cache,
// and nothing at all to the server or to anybody else. Three create screens
// stored it and posted it, and one of them defaulted it to an Unsplash URL so
// the result looked plausible whether or not a photograph had been chosen.
//
// The value handed back is now a **`mediaId`** — the platform's identifier for
// an asset it holds. `MediaAssetResponse` states the rule this restores: every
// business module stores `mediaId` and renders from the asset, and none of them
// stores a URL, a bucket name or a storage key.
//
// ── The preview, and why it has two sources ──────────────────────────────────
//
// While bytes are moving the preview comes from the **local** URI, because that
// is the only image that exists yet and a member who has just chosen a
// photograph should see it immediately. Once the asset is ready the preview
// switches to the platform's own thumbnail. The swap is deliberate: it is the
// moment the picture stops being *this device's* and starts being the listing's,
// and if the second source is broken it is better to find that out here than on
// somebody else's screen.
//
// ── Progress is not a spinner ────────────────────────────────────────────────
//
// `uploading` shows a real fraction. `processing` shows that the bytes arrived
// and the platform is deriving renditions — a distinct state, because a bar
// sitting at 100% reads as a stuck upload rather than as work still happening.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useMediaUpload, toLocalFile } from '@/hooks/media';
import type { MediaKind, MediaOwnerType } from '@/types/media';

interface ImagePickerInputProps {
  label: string;
  /**
   * The `mediaId` of the chosen asset, or null.
   *
   * **Not a URI.** A caller holding this value sends it to the platform as a
   * media reference; it is never rendered directly and never stored as a URL.
   */
  value: string | null;
  /** Called with the `mediaId` once the upload is accepted, or null when cleared. */
  onChangeImage: (mediaId: string | null) => void;
  aspect?: [number, number];
  circle?: boolean;
  /**
   * Suppress the heading above the control — **not** the `label` itself, which
   * is still the accessibility name and still titles the camera-or-gallery
   * dialog. Use it where the surrounding screen already says what the control
   * is for: the selfie step is headed "Facematch (Selfie)" and the control's
   * own caption says "Tap to add your photo", so a third "SELFIE" above it was
   * saying the same thing a third time.
   */
  hideLabel?: boolean;
  /**
   * The owning record, when it already exists.
   *
   * Where a caller can supply it the asset is claimed at upload and never enters
   * the orphan population. A create screen cannot — the listing has no id yet —
   * and sends the reference with its create call instead.
   */
  owner?: { ownerType: MediaOwnerType; ownerId: string; role: string } | null;
  kind?: MediaKind;
  /**
   * Offer the camera as well as the library.
   *
   * Off by default, because most of what this component collects is a document
   * that already exists — a passport page, a tenancy agreement, a photograph of
   * a shopfront taken earlier. **A selfie is the exception**: it is a picture
   * that does not exist until it is asked for, and sending somebody to their
   * gallery to find one is asking for the wrong thing. It is also the check the
   * camera makes meaningful — a live capture is harder to borrow from somebody
   * else than a file is.
   */
  allowCamera?: boolean;
}

export function ImagePickerInput({
  label,
  value,
  onChangeImage,
  aspect = [16, 9],
  circle = false,
  hideLabel = false,
  owner = null,
  kind = 'image',
  allowCamera = false,
}: ImagePickerInputProps) {
  const { showAlert } = useNotification();
  const [picking, setPicking] = useState(false);

  /** The device's copy, shown until the platform has a rendition of its own. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const upload = useMediaUpload({ kind, owner });

  /** Runs a picker and uploads whatever it returns. Shared by both sources. */
  const pickWith = useCallback(
    async (launch: () => Promise<ImagePicker.ImagePickerResult>) => {
      try {
        setPicking(true);
        const result = await launch();

        if (result.canceled || !result.assets?.length) return;

        const picked = result.assets[0];
        setLocalPreview(picked.uri);

        const asset = await upload.upload(toLocalFile(picked));

        if (!asset) {
          // The hook holds the reason and the panel below renders it. Clearing
          // the preview as well would leave the member looking at nothing with
          // an error beside it, and no sense of which photograph failed.
          setLocalPreview(null);
          onChangeImage(null);
          return;
        }

        // The identifier is stable from here — the poll that follows is for the
        // thumbnail, not for the value.
        onChangeImage(asset.mediaId);
      } catch {
        showAlert({ type: 'error', title: 'Error', message: 'Failed to select photo.' });
        setLocalPreview(null);
      } finally {
        setPicking(false);
      }
    },
    [onChangeImage, showAlert, upload]
  );

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      showAlert({
        type: 'error',
        title: 'Permission needed',
        message: 'Diaspora needs access to your photo library to pick images.',
      });
      return;
    }

    await pickWith(() =>
      ImagePicker.launchImageLibraryAsync({
        // `MediaTypeOptions` is deprecated in this SDK and logs a warning on
        // every open; `MediaType` is the replacement and takes an array.
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.8,
      })
    );
  }, [aspect, pickWith, showAlert]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      showAlert({
        type: 'error',
        title: 'Camera permission needed',
        message: 'Diaspora needs access to your camera to take this photo.',
      });
      return;
    }

    await pickWith(() =>
      ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.8,
        // The front camera for a selfie. Getting this wrong means the member
        // opens the camera pointed away from their own face, which is a small
        // thing that makes the step feel broken.
        cameraType: ImagePicker.CameraType.front,
      })
    );
  }, [aspect, pickWith, showAlert]);

  /**
   * Where the picture comes from.
   *
   * With the camera offered this asks; without it, it goes straight to the
   * library, which is what every existing caller expects and what a document
   * scan wants.
   */
  const handlePickImage = useCallback(() => {
    if (!allowCamera) {
      void pickFromLibrary();
      return;
    }

    showAlert({
      type: 'info',
      title: `Add your ${label.toLowerCase()}`,
      message: 'Take a new photo, or choose one you already have.',
      buttons: [
        { text: 'Take photo', onPress: () => void takePhoto() },
        { text: 'Choose from gallery', onPress: () => void pickFromLibrary() },
        // Styled as a cancel, not because it does anything different, but
        // because three identical primary buttons read as three things worth
        // doing — which is how it rendered on the first device run.
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [allowCamera, label, pickFromLibrary, showAlert, takePhoto]);

  const handleClear = useCallback(() => {
    upload.reset();
    setLocalPreview(null);
    onChangeImage(null);
  }, [onChangeImage, upload]);

  // The platform's rendition once it exists, the device's copy until then. See
  // the header — the swap is the point, not an implementation detail.
  const remotePreview = upload.asset?.thumbnailUrl ?? upload.asset?.url ?? null;
  const preview = remotePreview ?? localPreview;

  const busy = picking || upload.phase === 'uploading' || upload.phase === 'processing';

  return (
    <View className="mb-4 w-full">
      {hideLabel ? null : (
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">
          {label}
        </Text>
      )}

      {/* A centred column when circular: the control on the axis of the screen
          with its instruction underneath. The instruction is outside the circle
          either way — that is what stopped it being clipped — but below reads
          better than beside for a single round control with nothing next to it. */}
      <View className={circle ? 'items-center' : undefined}>
      <TouchableOpacity
        onPress={handlePickImage}
        disabled={busy}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          busy
            ? upload.phase === 'processing'
              ? `${label}, processing your photo`
              : `${label}, uploading`
            : preview
              ? `Change ${label}`
              : `Choose ${label}`
        }
        accessibilityState={{ disabled: busy, busy }}
        // **Dashed when it is a panel, solid when it is an avatar.** The three
        // create wizards ask for a photograph through `PhotoDropZone`, which is
        // a dashed panel; this one asked through a solid-bordered panel of the
        // same size, so the platform had two looks for one task depending on
        // which screen a member was on. A dashed circle reads as a broken
        // avatar rather than an empty slot, so the circle keeps its solid edge.
        className={`bg-surface-background justify-center items-center overflow-hidden ${
          circle ? 'w-24 h-24 rounded-full border border-subtle' : 'h-40 rounded-2xl border-2 border-dashed border-line'
        }`}
        testID="image-picker-input"
      >
        {preview ? (
          <View className="w-full h-full relative">
            <Image
              source={{ uri: preview }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            <View className="absolute inset-0 bg-black/20 justify-center items-center">
              {busy ? (
                <>
                  <ActivityIndicator color="#FFF" />
                  {/* Two different waits, said differently. A bar at 100% that
                      keeps spinning reads as a stuck upload.

                      The circle carries the percentage alone: "UPLOADING 12%"
                      does not fit 96 px and was clipped at both ends. */}
                  <Text className="text-white text-[10px] font-bold mt-1 uppercase" numberOfLines={1}>
                    {upload.phase === 'processing'
                      ? circle
                        ? '…'
                        : 'Processing…'
                      : circle
                        ? `${Math.round(upload.progress * 100)}%`
                        : `Uploading ${Math.round(upload.progress * 100)}%`}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="camera-outline" size={24} color="#FFF" />
                  <Text className="text-white text-[10px] font-bold mt-1 uppercase">
                    Change Photo
                  </Text>
                </>
              )}
            </View>
          </View>
        ) : (
          // ── The empty state has to fit the shape it is drawn in ───────────
          //
          // One layout was used for both variants: a 28 px icon over "Tap to
          // Select Photo" over "From Photo Gallery". That fits the 160 px
          // rectangle and does not fit the 96 px circle — the words wrapped
          // onto three lines, the icon was pushed under the top edge and the
          // second line was cut off mid-word. The selfie step, which is the
          // only circular one, looked broken before it was touched.
          //
          // So the circle gets an icon and nothing else, and its instruction is
          // rendered beside it where there is room to read it.
          <View className="items-center px-4">
            {busy ? (
              <ActivityIndicator color="#F59300" />
            ) : circle ? (
              <Ionicons name={allowCamera ? 'camera-outline' : 'images-outline'} size={30} color="#F59300" />
            ) : (
              <>
                <Ionicons name={allowCamera ? 'camera-outline' : 'images-outline'} size={28} color="#F59300" />
                <Text className="text-xs font-extrabold text-content-muted mt-2">
                  {allowCamera ? 'Tap to Add Photo' : 'Tap to Select Photo'}
                </Text>
                <Text className="text-[10px] text-content-faint mt-1">
                  {allowCamera ? 'Camera or Gallery' : 'From Photo Gallery'}
                </Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>

      {circle && !preview ? (
        <View className="items-center mt-3 px-4">
          <Text className="text-xs font-extrabold text-content-muted text-center">
            {allowCamera ? 'Tap to add your photo' : 'Tap to select a photo'}
          </Text>
          <Text className="text-[10px] text-content-faint mt-1 leading-relaxed text-center">
            {allowCamera ? 'Take one now, or choose from your gallery.' : 'From your photo gallery.'}
          </Text>
        </View>
      ) : null}
      </View>

      {/* The server's own sentence where it gave one — it knows whether the file
          was too large, the wrong type or refused by a scanner, and each needs a
          different next step from the member. */}
      {upload.phase === 'failed' && upload.error ? (
        <View className={`flex-row items-start mt-2 ${circle ? 'justify-center px-4' : ''}`}>
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text
            className={`text-[11px] font-semibold text-red-600 ml-1.5 ${circle ? 'text-center' : 'flex-1'}`}
          >
            {upload.error}
          </Text>
        </View>
      ) : null}

      {/* Only once there is something to remove, and never mid-upload — a clear
          that raced the response would leave an asset nobody claims. */}
      {value && !busy ? (
        <TouchableOpacity
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          className="mt-2 self-start"
        >
          <Text className="text-[11px] font-black text-content-muted">Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
