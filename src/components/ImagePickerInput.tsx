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
   * The owning record, when it already exists.
   *
   * Where a caller can supply it the asset is claimed at upload and never enters
   * the orphan population. A create screen cannot — the listing has no id yet —
   * and sends the reference with its create call instead.
   */
  owner?: { ownerType: MediaOwnerType; ownerId: string; role: string } | null;
  kind?: MediaKind;
}

export function ImagePickerInput({
  label,
  value,
  onChangeImage,
  aspect = [16, 9],
  circle = false,
  owner = null,
  kind = 'image',
}: ImagePickerInputProps) {
  const { showAlert } = useNotification();
  const [picking, setPicking] = useState(false);

  /** The device's copy, shown until the platform has a rendition of its own. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const upload = useMediaUpload({ kind, owner });

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({
        type: 'error',
        title: 'Permission Denied',
        message: 'We need access to your photo library to pick images.',
      });
      return;
    }

    try {
      setPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const picked = result.assets[0];
      setLocalPreview(picked.uri);

      const asset = await upload.upload(toLocalFile(picked));

      if (!asset) {
        // The hook holds the reason and the panel below renders it. Clearing the
        // preview as well would leave the member looking at nothing with an
        // error beside it, and no sense of which photograph failed.
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
  }, [aspect, kind, onChangeImage, showAlert, upload]);

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
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">
        {label}
      </Text>

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
        className={`bg-surface-background border border-subtle justify-center items-center overflow-hidden ${
          circle ? 'w-24 h-24 rounded-full' : 'h-40 rounded-2xl'
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
                  <Text className="text-white text-[10px] font-bold mt-1 uppercase">
                    {/* Two different waits, said differently. A bar at 100%
                        that keeps spinning reads as a stuck upload. */}
                    {upload.phase === 'processing'
                      ? 'Processing…'
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
          <View className="items-center px-4">
            {busy ? (
              <ActivityIndicator color="#F59300" />
            ) : (
              <>
                <Ionicons name="images-outline" size={28} color="#F59300" />
                <Text className="text-xs font-extrabold text-content-muted mt-2">
                  Tap to Select Photo
                </Text>
                <Text className="text-[10px] text-content-faint mt-1">From Photo Gallery</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* The server's own sentence where it gave one — it knows whether the file
          was too large, the wrong type or refused by a scanner, and each needs a
          different next step from the member. */}
      {upload.phase === 'failed' && upload.error ? (
        <View className="flex-row items-start mt-2">
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text className="text-[11px] font-semibold text-red-600 ml-1.5 flex-1">
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
