import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /**
   * Extra room below the last field, on top of the bottom safe-area inset.
   * Give a screen with a pinned footer the footer's height.
   */
  extraBottomInset?: number;
  contentContainerStyle?: ViewStyle;
}

/**
 * A scrolling form body that stays usable once the keyboard is up.
 *
 * The audit found 69 screens with a text field and only 14 handling the
 * keyboard at all. The 14 that did all wrote out the same three-part
 * arrangement by hand. That arrangement lives here now:
 *
 *   * **`behavior` is `'padding'` on Android too, deliberately.** The usual
 *     advice is to leave it unset there and let the window resize itself via
 *     `adjustResize`. That advice is now wrong for this app: it targets SDK 36,
 *     and Android 15+ (API 35+) enforces edge-to-edge for apps targeting 35+,
 *     which stops honouring `adjustResize` — the app is expected to consume the
 *     IME inset itself.
 *
 *     This was measured, not assumed. On a device, opening the keyboard on the
 *     sign-in screen left the layout *pixel-identical*: nothing moved, and the
 *     primary button simply sat behind the keyboard. Three successive layout
 *     changes made no difference, because the window was never resizing in the
 *     first place. `'padding'` makes the avoiding view apply the keyboard
 *     height itself, which does not depend on the window resizing.
 *
 *   * **`keyboardShouldPersistTaps="handled"`.** Without it the first tap on a
 *     Submit button only dismisses the keyboard, so the member has to tap
 *     twice and it reads as an unresponsive button.
 *   * **The bottom inset is reserved.** A form whose content stops at the last
 *     field leaves that field under the home indicator.
 */
export function KeyboardAwareScrollView({
  children,
  extraBottomInset = 0,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  ...props
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        {...props}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: (contentContainerStyle?.paddingBottom as number ?? 0) + insets.bottom + 24 + extraBottomInset },
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
