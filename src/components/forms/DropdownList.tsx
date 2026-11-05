import React from 'react';
import { ScrollView } from 'react-native';

/**
 * About five rows: enough to choose from, short enough that the field and the
 * form around it stay where the member left them.
 */
export const DROPDOWN_LIST_MAX_HEIGHT = 280;

/**
 * The options of an open dropdown, in a box of their own (owner, 5 Nov 2026).
 * A long list drawn straight into the page ran down the screen, and dragging it
 * scrolled the whole form away. Here it keeps to a fixed height and scrolls by
 * itself. `nestedScrollEnabled` is what lets it do that on Android, where the
 * form is a scroll view too; iOS nests scroll views on its own. Taps stay with
 * the options while the search keyboard is up.
 */
export function DropdownList({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <ScrollView
      style={{ maxHeight: DROPDOWN_LIST_MAX_HEIGHT }}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      persistentScrollbar
      showsVerticalScrollIndicator
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
