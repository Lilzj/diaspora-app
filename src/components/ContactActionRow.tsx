// ─────────────────────────────────────────────────────────────────────────────
// Call · Message · Email — the row that appears on every listing detail
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// Two screens hand-rolled it, identically and separately: a `TouchableOpacity`
// with `p-3`, a `text-xl` emoji, a margin, and a label underneath. Stacking an
// icon above a label makes a control roughly twice the height of every other
// button in the app, which is what the report described — "those buttons are
// too big… we need re-usable button components across the entire application
// so that this stays consistent".
//
// The app already has that component. `components/Button` handles variants,
// sizes, loading, icons and the disabled foreground, and the canonical answer
// for an icon *beside* a label is `icon` with `iconPosition`. Nothing here
// invents a new button — this composes three of the existing one and owns the
// layout, so the two screens cannot drift apart again and a third screen
// needing the same row does not hand-roll a third copy.
//
// ── Disabled rather than hidden ──────────────────────────────────────────────
//
// A listing with no phone number keeps its Call button, disabled. Hiding it
// would shift the other two and make the row a different shape per listing,
// and "there is no phone number for this listing" is worth saying — the member
// otherwise wonders whether they missed it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';

export interface ContactAction {
  label: string;
  icon: React.ComponentProps<typeof Button>['icon'];
  onPress: () => void;
  /** Absent contact details, or the member's own listing. */
  disabled?: boolean;
  accessibilityHint?: string;
  /** The one action the member is most likely to want. */
  isPrimary?: boolean;
}

export function ContactActionRow({ actions }: { actions: ContactAction[] }) {
  return (
    <View className="flex-row" style={{ gap: 8 }}>
      {actions.map((action) => (
        <View key={action.label} className="flex-1">
          <Button
            label={action.label}
            icon={action.icon}
            iconPosition="leading"
            variant={action.isPrimary ? 'primary' : 'outline'}
            emphasis="compact"
            disabled={action.disabled}
            accessibilityHint={action.accessibilityHint}
            onPress={action.onPress}
          />
        </View>
      ))}
    </View>
  );
}
