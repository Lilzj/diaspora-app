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
 * arrangement by hand, and one of them got the Android branch wrong. That
 * arrangement lives here now:
 *
 *   * **`behavior` is unset on Android on purpose.** Expo's Android window
 *     already resizes for the keyboard, so `'height'` or `'padding'` there
 *     counts the keyboard twice and leaves a gap the height of the keyboard
 *     under the form.
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
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
