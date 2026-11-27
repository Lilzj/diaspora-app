import React from 'react';
import { View, Text } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';

interface WizardProgressProps {
  /** The wizard, in the member's words: "List a home", "Register Hub". */
  name: string;
  /** The step on screen, counted from 0. */
  step: number;
  /** How many steps the wizard has. */
  total: number;
}

/**
 * Where a member is in a wizard: its name, "Step 2 of 6", and a bar.
 *
 * One component since 27 Nov 2026 (FARCH-007). Ten wizards drew their own: bars
 * of three heights, one of them segmented, under the header in some and above it
 * in others, "Step 2 of 6" beside the wizard's name or under it, and one that
 * said "Upload File (3 of 5)". Only the campaign wizard told a screen reader
 * where the member was; this does it for all of them.
 */
export function WizardProgress({ name, step, total }: WizardProgressProps) {
  // Counted from 1 for the member, and never past either end.
  const shown = Math.min(Math.max(step + 1, 1), total);

  return (
    <View className="bg-surface-card border-b border-faint px-6 py-3">
      <View className="flex-row justify-between items-center mb-2">
        <Text
          className="text-xs font-bold text-content-faint uppercase tracking-widest flex-1 mr-3"
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text className="text-xs font-extrabold text-primary-500">
          Step {shown} of {total}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${shown} of ${total}`}
        accessibilityValue={{ min: 1, max: total, now: shown }}
        className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden"
      >
        <View className="h-full bg-primary-500 rounded-full" style={{ width: `${(shown / total) * 100}%` }} />
      </View>
    </View>
  );
}

interface WizardHeaderProps {
  /** The wizard, in the member's words. */
  name: string;
  /** Each step's title, in order. The one on screen heads it. */
  steps: readonly string[];
  /** The step on screen, counted from 0. */
  step: number;
  /** As `ScreenHeader`: shown unless a wizard says otherwise. */
  showBack?: boolean;
  /** As `ScreenHeader`: a wizard that steps back before it leaves says so here. */
  onBack?: () => void;
  /** As `ScreenHeader`: "Save & Exit", "Save draft", "Cancel". */
  rightAction?: React.ReactNode;
}

/**
 * The top of every step wizard: where the member is, then the step's own title.
 * `WizardFooter` is the bottom, and between the two each wizard draws its step.
 */
export function WizardHeader({ name, steps, step, showBack, onBack, rightAction }: WizardHeaderProps) {
  return (
    <>
      <WizardProgress name={name} step={step} total={steps.length} />
      <ScreenHeader title={steps[step]} showBack={showBack} onBack={onBack} rightAction={rightAction} />
    </>
  );
}
