// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the modal primitives
//
// The application had 48 hand-rolled `<Modal>` instances across 41 files. An
// audit of them found:
//
//   * eight different backdrop values — `bg-black/30`, `/40`, `/45`, `/50`,
//     `/60`, and `rgba(0,0,0,·)` at 0.1, 0.35 and 0.4;
//   * two dismissal behaviours, three modals with no Android back handling at
//     all, which trapped anyone navigating with the back gesture;
//   * no `statusBarTranslucent` anywhere, so on Android a full-height sheet
//     left a pale strip under the status bar;
//   * 17 of 41 respected the bottom safe area, so a sheet's last control could
//     sit under the home indicator;
//   * 6 of 41 handled the keyboard, though many contain a text field;
//   * none marked itself as a modal to assistive technology, so a screen
//     reader could wander into the screen behind the sheet.
//
// These two components decide all of that once. `Sheet` is the bottom-anchored
// form (35 of the 48 were this); `Dialog` is the centred confirmation (13 were).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design-system';

interface OverlayBaseProps {
  visible: boolean;
  /**
   * Required, not optional. This is what the Android hardware back button
   * calls; the modals that omitted it could not be dismissed with a back
   * gesture at all.
   */
  onClose: () => void;
  title?: string;
  /** Shown under the title. */
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned below the scrolling body — the place for the confirm/cancel row. */
  footer?: React.ReactNode;
  /** Set false for a destructive confirmation that must be answered. */
  dismissOnBackdropPress?: boolean;
  /**
   * Set false when the body brings its own scrolling container — a `FlatList`
   * inside the sheet's `ScrollView` is a nested-scroll conflict, and the inner
   * list stops receiving the gesture.
   */
  scrollable?: boolean;
  testID?: string;
}

/** Shared backdrop. One value, from the token set, for every overlay. */
function Backdrop({
  onPress,
  dismissable,
}: {
  onPress: () => void;
  dismissable: boolean;
}) {
  const { tokens } = useTheme();
  const style = [StyleSheet.absoluteFill, { backgroundColor: tokens.color.surface.overlay }];

  // A non-dismissable scrim is a plain View, not a Pressable with no handler:
  // an inert Pressable still swallows the touch and still reads as an
  // interactive element to assistive technology.
  if (!dismissable) {
    return <View testID="overlay-backdrop" style={style} importantForAccessibility="no" />;
  }

  return (
    <Pressable
      testID="overlay-backdrop"
      style={style}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
    />
  );
}

function OverlayHeader({
  title,
  subtitle,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  if (!title && !subtitle) return null;

  return (
    <View className="flex-row items-start justify-between mb-4">
      <View className="flex-1 pr-3">
        {!!title && (
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-xl font-black tracking-tight"
          >
            {title}
          </Text>
        )}
        {!!subtitle && (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed mt-1"
          >
            {subtitle}
          </Text>
        )}
      </View>
      <Pressable
        testID="overlay-close"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        // 44pt target: the close control was frequently a bare glyph with a
        // tap area smaller than a fingertip.
        hitSlop={8}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={24} color={tokens.color.text.secondary} />
      </Pressable>
    </View>
  );
}

/**
 * A bottom-anchored sheet.
 *
 * Reserves the bottom safe area, lifts above the keyboard, and caps its height
 * so a long body scrolls inside the sheet rather than pushing its footer off
 * the screen.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissOnBackdropPress = true,
  scrollable = true,
  height,
  testID,
}: OverlayBaseProps & {
  /** Fixed height, e.g. `'80%'`, for a sheet whose body is a list. */
  height?: number | `${number}%`;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const body = (
    <>
      <OverlayHeader title={title} subtitle={subtitle} onClose={onClose} />
      {children}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Both edges, and the second was missing.
      //
      // `statusBarTranslucent` extends the backdrop under the status bar;
      // without it the scrim stops short and leaves a pale band above the
      // dimmed screen. That was fixed. `navigationBarTranslucent` is the same
      // fault at the other end and was not: the modal window stopped above the
      // Android navigation bar, so every sheet floated with a strip of dimmed
      // app between it and the bottom of the screen. Reported on the location
      // picker, the language picker and the badge sheet — which is to say, on
      // every sheet in the app, because they all come through here.
      //
      // `SHEET_MODAL_PROPS` in `layout/bottom-inset` has carried both flags as
      // the canonical set the whole time. This is the primitive that should
      // have been using it.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Backdrop onPress={onClose} dismissable={dismissOnBackdropPress} />

        <KeyboardAvoidingView
          // `padding` on both platforms. The usual advice — leave this unset on
          // Android and let the window resize — is wrong for this app: it
          // targets SDK 36, and Android 15+ stops honouring `adjustResize`
          // under enforced edge-to-edge, so the window never resizes and the
          // sheet's own fields end up behind the keyboard. Measured on device
          // (F-033).
          behavior="padding"
          className="w-full"
        >
          <View
            testID={testID}
            // Holds a screen reader inside the sheet. Without it the reader
            // walks straight through onto the screen behind the scrim.
            accessibilityViewIsModal
            style={{
              backgroundColor: tokens.color.surface.elevated,
              maxHeight: '85%',
              height,
              // The home indicator sits over the sheet's last control unless
              // the sheet reserves its own bottom inset.
              paddingBottom: insets.bottom,
            }}
            className="rounded-t-3xl w-full"
          >
            {scrollable ? (
              <ScrollView
                contentContainerStyle={{ padding: tokens.spacing[6] }}
                keyboardShouldPersistTaps="handled"
              >
                {body}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, padding: tokens.spacing[6] }}>{body}</View>
            )}

            {footer ? (
              <View
                style={{
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: tokens.color.border.default,
                  paddingHorizontal: tokens.spacing[6],
                  paddingTop: tokens.spacing[4],
                  paddingBottom: tokens.spacing[4],
                }}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/**
 * A centred dialog, for a confirmation or a short message.
 *
 * Use `Sheet` for anything with more than a couple of controls — a dialog that
 * grows tall enough to scroll should have been a sheet.
 */
export function Dialog({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissOnBackdropPress = true,
  testID,
}: OverlayBaseProps) {
  const { tokens } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 items-center justify-center px-6">
        <Backdrop onPress={onClose} dismissable={dismissOnBackdropPress} />

        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            backgroundColor: tokens.color.surface.elevated,
            borderRadius: tokens.radius['2xl'],
            padding: tokens.spacing[6],
            maxHeight: '80%',
            ...tokens.shadow.floating,
          }}
          className="w-full"
        >
          <OverlayHeader title={title} subtitle={subtitle} onClose={onClose} />
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ marginTop: tokens.spacing[4] }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
