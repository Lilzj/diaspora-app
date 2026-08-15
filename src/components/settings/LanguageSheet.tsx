// ─────────────────────────────────────────────────────────────────────────────
// Choosing a language — a sheet, not a screen
//
// This was `app/settings/language.tsx`: a full route with its own header and
// back button, for a list of options where picking one is the whole
// interaction. Every other short choice in the app — the radius, the location,
// the period selector, the attachment picker — is a sheet, so the language
// picker being a screen made it the odd one out and cost a member a full
// navigation transition each way to change one value.
//
// The route still exists and still renders this, because `/settings/language`
// is a real path that a deep link or a notification could carry.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { mockLanguages } from '@/mocks/data';

interface LanguageSheetProps {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (code: string) => void;
}

export function LanguageSheet({ visible, onClose, selected, onSelect }: LanguageSheetProps) {
  const { tokens } = useTheme();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Language"
      subtitle="The language Diaspora is shown in"
      testID="language-sheet"
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Language"
        className="px-1 pb-2"
      >
        {mockLanguages.map((language, index) => {
          const isSelected = selected === language.code;

          return (
            <Pressable
              key={language.code}
              onPress={() => {
                onSelect(language.code);
                // Closing on choice is the point of a sheet: the selection *is*
                // the confirmation, and a Done button would ask the member to
                // agree to something they have already seen take effect.
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={language.name}
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: tokens.color.border.default,
                // 44pt minimum touch target (WCAG 2.5.5).
                minHeight: 48,
              }}
              className="flex-row items-center justify-between px-4 py-3.5"
            >
              <Text
                style={{ color: tokens.color.text.primary }}
                className={`text-sm ${isSelected ? 'font-black' : 'font-medium'}`}
              >
                {language.name}
              </Text>

              {isSelected ? (
                <Ionicons name="checkmark" size={20} color={tokens.color.primary[500]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
