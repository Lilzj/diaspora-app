import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ContactChoiceProps {
  /** True when members may also see the contact details; false for in-app messages only. */
  shareDetails: boolean;
  onChange: (shareDetails: boolean) => void;
  /** The second option, worded for what this form collects ("Messages, phone or email"). */
  sharedLabel: string;
  sharedDetail: string;
  privateDetail?: string;
}

/**
 * "How should people reach you": in-app messages only, or messages plus the
 * contact details the form collected.
 *
 * Two options, from the housing wizard, shared since 16 Oct 2026: the
 * marketplace had its own three-way list (in-app, call, email) with no email
 * field anywhere on the form. Messaging is never switched off by sharing a
 * number, so the second option is always "both", never "instead".
 */
export function ContactChoice({
  shareDetails,
  onChange,
  sharedLabel,
  sharedDetail,
  privateDetail = 'Your contact details stay private. Members reach you in the app.',
}: ContactChoiceProps) {
  const choices = [
    { share: false, label: 'Diaspora messages only', detail: privateDetail },
    { share: true, label: sharedLabel, detail: sharedDetail },
  ];

  return (
    <View>
      <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">
        How should people reach you
      </Text>
      {choices.map((choice) => {
        const isSel = shareDetails === choice.share;
        return (
          <TouchableOpacity
            key={choice.label}
            onPress={() => onChange(choice.share)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel }}
            className={`px-4 py-3.5 rounded-xl border mb-2.5 ${
              isSel ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-bold text-content-strong flex-1 pr-3">{choice.label}</Text>
              <Text className="text-xs">{isSel ? '🟢' : '⚪'}</Text>
            </View>
            <Text className="text-[11px] text-content-muted mt-1 leading-relaxed">{choice.detail}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
