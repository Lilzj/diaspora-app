// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the password rules, shown before they are broken
//
// Every screen that takes a new password showed the length rule as placeholder
// text and nothing else, while the server also required an upper case letter, a
// lower case letter and a digit. A member met the length rule, was refused, met
// the next one, was refused again — learning the policy one rejection at a time,
// usually on the recovery screen where they are already locked out.
//
// The list is live rather than a static sentence: a rule that ticks as you type
// is the difference between "here are four hurdles" and "you are nearly there".
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import { PASSWORD_RULES } from '@/lib/password-policy';

interface PasswordRequirementsProps {
  password: string;
  /**
   * Before the member has typed anything every rule is unmet, which is true and
   * reads as four errors on a form they have not filled in. Until then the list
   * is shown in a neutral voice instead.
   */
  hasStartedTyping?: boolean;
}

export function PasswordRequirements({ password, hasStartedTyping }: PasswordRequirementsProps) {
  const { tokens } = useTheme();
  const started = hasStartedTyping ?? password.length > 0;

  const met = PASSWORD_RULES.filter((rule) => rule.isMet(password)).length;

  return (
    <View
      // One label for the group. A screen reader announcing four separate rows
      // on every keystroke is unusable; this announces progress instead.
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        started
          ? `Password requirements: ${met} of ${PASSWORD_RULES.length} met. ${PASSWORD_RULES.map(
              (rule) => `${rule.label}: ${rule.isMet(password) ? 'met' : 'not yet'}`
            ).join('. ')}.`
          : `Your password needs: ${PASSWORD_RULES.map((rule) => rule.label).join(', ')}.`
      }
      className="mt-3"
      style={{ gap: 6 }}
    >
      {PASSWORD_RULES.map((rule) => {
        const isMet = rule.isMet(password);

        return (
          <View key={rule.key} className="flex-row items-center" style={{ gap: 8 }}>
            <Ionicons
              name={isMet ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              // Unmet is muted, never the error colour: a rule you have not got
              // to yet is not a mistake you have made.
              color={isMet ? tokens.color.success.default : tokens.color.text.placeholder}
            />
            <Text
              style={{ color: isMet ? tokens.color.text.secondary : tokens.color.text.placeholder }}
              className="text-xs font-semibold"
            >
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
