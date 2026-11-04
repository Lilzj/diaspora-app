// ─────────────────────────────────────────────────────────────────────────────
// One way of asking for a photograph — 21 Sep 2026
//
// The housing wizard's photo step had three controls that all open a picker,
// drawn three different ways: a 160px dashed panel for the cover, an 85px
// dashed square reading "+ ADD PHOTO" for the gallery, and a thin bordered row
// reading "Select cover image from gallery" for the fallback. Nothing about
// the task differs between them — each one asks the member for a photograph —
// so nothing about them should look different except what they are asking for.
//
// This is deliberately presentational. The wizard owns the picker sheet, the
// upload hook and the photographs themselves; a control that also owned any of
// that could not be the *same* control in three places, which is the whole
// point of it. `ImagePickerInput` is the other half of this story: it renders a
// similar panel and runs its own upload, which is right for a screen with one
// photograph and wrong for a wizard that manages a cover, a gallery and their
// two separate upload states.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface PhotoDropZoneProps {
  /** The heading above the panel. Between the three of these, the only difference. */
  label: string;
  /** What tapping it does, in the member's words. */
  prompt: string;
  /** Where the photograph can come from. The same everywhere, because it is. */
  hint?: string;
  /** The picture on the empty panel. */
  icon?: string;
  /** The photograph already chosen, if there is one. Fills the panel. */
  previewUri?: string | null;
  /** What the overlay says over a chosen photograph. */
  changeLabel?: string;
  /** An upload in flight. The panel says so and refuses a second one. */
  busy?: boolean;
  /**
   * What the wait is. Uploading and processing are different waits and are said
   * differently: a bar that reaches 100% and keeps spinning reads as stuck.
   */
  busyLabel?: string;
  /** What the platform said when it refused. Rendered under the panel. */
  error?: string | null;
  /**
   * No more photographs can be added — a set that is full, say. The panel is
   * genuinely inert rather than inert-on-tap: a control that looks as though it
   * will do something and then refuses is worse than one that says it will not.
   * Say what would change it in `prompt`.
   */
  disabled?: boolean;
  onPress: () => void;
  /**
   * Anything that belongs between the heading and the panel — the gallery's
   * photographs, which are a set rather than a single chosen image and so do
   * not belong inside the panel that adds to them.
   */
  children?: React.ReactNode;
}

export function PhotoDropZone({
  label,
  prompt,
  hint = 'Camera or Photo Gallery',
  icon = '🖼️',
  previewUri = null,
  changeLabel = '📷 Change photo',
  busy = false,
  busyLabel,
  error = null,
  disabled = false,
  onPress,
  children,
}: PhotoDropZoneProps) {
  const inert = busy || disabled;

  return (
    <View>
      <Text className="text-xs font-bold text-content-secondary mb-2">{label}</Text>

      {children}

      <TouchableOpacity
        onPress={onPress}
        disabled={inert}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={busy ? `${label}, ${busyLabel ?? 'uploading'}` : `${label}. ${prompt}`}
        accessibilityState={{ disabled: inert, busy }}
        className={`h-40 border-2 border-dashed border-line rounded-2xl bg-surface-background justify-center items-center overflow-hidden ${
          disabled && !busy ? 'opacity-50' : ''
        }`}
      >
        {previewUri ? (
          <View className="w-full h-full relative">
            <Image
              source={{ uri: previewUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            <View className="absolute inset-0 bg-black/30 justify-center items-center">
              <Text className="text-white font-extrabold text-xs bg-black/40 px-3 py-1.5 rounded-full">
                {changeLabel}
              </Text>
            </View>
          </View>
        ) : (
          <View className="items-center px-6">
            <Text className="text-3xl mb-1.5">{icon}</Text>
            <Text className="text-xs font-bold text-content-muted text-center">{prompt}</Text>
            <Text className="text-[9px] text-content-faint mt-1 font-semibold text-center">
              {hint}
            </Text>
          </View>
        )}

        {busy && (
          <View className="absolute inset-0 bg-black/40 justify-center items-center">
            <ActivityIndicator color="#FFF" />
            {busyLabel ? (
              <Text className="text-white text-[10px] font-bold mt-1 uppercase">{busyLabel}</Text>
            ) : null}
          </View>
        )}
      </TouchableOpacity>

      {/* The empty branch is a spacer, not an oversight: the gap under the panel
          is the same whether or not there is a message in it, so an upload
          failing does not shift the rest of the step under the member's thumb. */}
      {error ? (
        <View className="flex-row items-start mt-2 mb-3">
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text className="text-[11px] font-semibold text-error-default ml-1.5 flex-1">{error}</Text>
        </View>
      ) : (
        <View className="mb-3" />
      )}
    </View>
  );
}

export default PhotoDropZone;
