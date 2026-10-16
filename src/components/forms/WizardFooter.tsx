import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';

interface WizardFooterProps {
  /** Shown when there is a previous step. Omit on the first. */
  onBack?: () => void;
  onNext: () => void;
  /** `Next` on every step but the last, where it names the action (`Publish`). */
  nextLabel: string;
  /** What the server will refuse without, named on this step. Disables Next. */
  stillNeeded?: string[];
  /** A value that is present but wrong (e.g. a price below zero). Shown instead, and disables Next. */
  problem?: string | null;
  isLoading?: boolean;
  loadingLabel?: string;
  /** Disabled for a reason other than a missing field (e.g. a check in flight). */
  disabled?: boolean;
  /** Back is held while a publish is in flight, where going back would edit a half-created item. */
  backDisabled?: boolean;
  /** The phone's gesture area, on screens that draw edge to edge. */
  bottomInset?: number;
}

/**
 * The bottom of every create and edit wizard: what is still needed, then Back
 * and Next side by side.
 *
 * One component since 16 Oct 2026. Each wizard drew its own, and the
 * marketplace's had drifted: a small grey "Back" box at one end and a
 * "Next Step" box at the other, where housing, jobs and businesses had two
 * equal buttons. A tester saw the difference at once.
 *
 * `fullWidth={false}` on both buttons is load-bearing: `Button` defaults to
 * `w-full`, and two of those in a row do not share it. The second runs off the
 * screen (found on a 1080px emulator, 21 Sep 2026).
 */
export function WizardFooter({
  onBack,
  onNext,
  nextLabel,
  stillNeeded = [],
  problem,
  isLoading,
  loadingLabel,
  disabled,
  backDisabled,
  bottomInset = 0,
}: WizardFooterProps) {
  return (
    <>
      {/* Named, not implied: a disabled Next with no reason sends a member
          scrolling the whole form for what they missed. */}
      {problem || stillNeeded.length > 0 ? (
        <View className="px-6 pt-3 flex-row items-start">
          <Ionicons name="alert-circle-outline" size={14} color="#F59300" />
          <Text className="text-[11px] font-semibold text-content-tertiary ml-1.5 flex-1">
            {stillNeeded.length > 0 ? `Still needed: ${stillNeeded.join(', ')}` : problem}
          </Text>
        </View>
      ) : null}

      <View
        className="px-6 pt-4 border-t border-faint bg-surface-card"
        style={{ paddingBottom: Math.max(16, bottomInset) }}
      >
        <View className="flex-row gap-3">
          {onBack ? (
            <Button
              label="Back"
              variant="outline"
              fullWidth={false}
              className="flex-1"
              disabled={backDisabled}
              onPress={onBack}
            />
          ) : null}
          <Button
            label={nextLabel}
            fullWidth={false}
            className="flex-1"
            isLoading={isLoading}
            loadingLabel={loadingLabel}
            disabled={disabled || !!problem || stillNeeded.length > 0}
            onPress={onNext}
          />
        </View>
      </View>
    </>
  );
}
