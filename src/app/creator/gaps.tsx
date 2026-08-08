// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Backend gap register (Frontend Phase 7, §35)
//
// The register, on a screen. It exists because a markdown file in the repo is
// read once at review time and then forgotten, whereas a reviewer with the app
// open can see exactly which of the sixteen capabilities they are looking at
// and what contract would close it.
//
// Development only, and gated on the same switch as everything else: a release
// build renders the "not available" state rather than a list of things the
// platform cannot do. It is reachable from the dashboard's own gap notice and
// by deep link; it is deliberately not in any navigation, because it is a tool
// for the team rather than a feature for a member.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { CreatorCard, CreatorScreen, CreatorSection } from '@/components/creator-economy';
import {
  areCreatorGapsEnabled,
  listCreatorGaps,
  type CreatorGap,
  type CreatorGapPriority,
} from '@/config/creator-gaps';

const PRIORITY_TONE: Record<CreatorGapPriority, 'error' | 'warning' | 'info' | 'neutral'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

export default function CreatorGapRegisterScreen() {
  const { tokens } = useTheme();
  const gaps = useMemo(() => listCreatorGaps(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const gap of gaps) map[gap.priority] = (map[gap.priority] ?? 0) + 1;
    return map;
  }, [gaps]);

  return (
    <CreatorScreen
      title="Backend gap register"
      subtitle={`${gaps.length} creator capabilities with no contract behind them`}
      isEnabled={areCreatorGapsEnabled()}
      gapKey="profile"
      gapDetail="This is the register itself — the list of what Phase 7 built without a backend, and what each one would need. It is a development tool, not a member-facing screen."
    >
      <View className="px-5 pt-5">
        <View className="flex-row flex-wrap -mx-1 mb-5">
          {(['critical', 'high', 'medium', 'low'] as CreatorGapPriority[]).map((priority) => (
            <View key={priority} className="w-1/4 px-1">
              <View
                accessible
                accessibilityLabel={`${counts[priority] ?? 0} ${priority} priority gaps`}
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border p-3 items-center"
              >
                <Text
                  style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                  className="text-lg font-black"
                >
                  {counts[priority] ?? 0}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-black uppercase tracking-widest mt-0.5"
                >
                  {priority}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <CreatorSection title="Every gap" subtitle="Ordered by priority. Tap one for the contract.">
          {gaps.map((gap) => (
            <GapRow
              key={gap.id}
              gap={gap}
              isOpen={openId === gap.id}
              onToggle={() => setOpenId((current) => (current === gap.id ? null : gap.id))}
            />
          ))}
        </CreatorSection>

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mb-4 leading-relaxed"
        >
          The same register, in full prose, is in
          frontend-phase-7-creator-economy-backend-gap-register.md.
        </Text>
      </View>
    </CreatorScreen>
  );
}

function GapRow({
  gap,
  isOpen,
  onToggle,
}: {
  gap: CreatorGap;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { tokens } = useTheme();
  const tone = PRIORITY_TONE[gap.priority];
  const toneColour =
    tone === 'error'
      ? tokens.color.error.default
      : tone === 'warning'
        ? tokens.color.warning.default
        : tone === 'info'
          ? tokens.color.info.default
          : tokens.color.text.placeholder;

  return (
    <CreatorCard style={{ marginBottom: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${gap.id}, ${gap.title}. ${gap.priority} priority. Owned by ${gap.owner}. ${
          isOpen ? 'Collapse' : 'Expand for the contract'
        }.`}
        onPress={onToggle}
      >
        <View className="flex-row items-start">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center mb-1">
              <Text
                style={{ color: toneColour }}
                className="text-[9px] font-black uppercase tracking-widest mr-2"
              >
                {gap.priority}
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder, fontVariant: ['tabular-nums'] }}
                className="text-[9px] font-black tracking-widest"
              >
                {gap.id}
              </Text>
            </View>

            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black tracking-tight"
            >
              {gap.title}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mt-0.5"
            >
              {gap.feature}
            </Text>
          </View>

          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={tokens.color.text.placeholder}
          />
        </View>
      </Pressable>

      {isOpen ? (
        <View
          style={{ borderTopColor: tokens.color.border.default }}
          className="border-t mt-3 pt-3"
        >
          <Detail label="What the frontend does" body={gap.frontendBehaviour} />
          <Detail label="Why it cannot be real" body={gap.whyNotImplementable} />

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mb-1.5 mt-3"
          >
            Missing contract
          </Text>
          {gap.missingContract.map((line, index) => (
            <Text
              key={index}
              selectable
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium leading-relaxed mb-1"
            >
              • {line}
            </Text>
          ))}

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest mb-1.5 mt-3"
          >
            What already exists
          </Text>
          {gap.existingSeams.map((line, index) => (
            <Text
              key={index}
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium leading-relaxed mb-1"
            >
              • {line}
            </Text>
          ))}

          <View
            style={{ backgroundColor: tokens.color.surface.elevated }}
            className="rounded-xl p-3 mt-3"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-bold"
            >
              Owner: {gap.owner}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-bold mt-0.5"
            >
              Recommended phase: {gap.recommendedPhase}
            </Text>
          </View>
        </View>
      ) : null}
    </CreatorCard>
  );
}

function Detail({ label, body }: { label: string; body: string }) {
  const { tokens } = useTheme();

  return (
    <View className="mb-3">
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[9px] font-black uppercase tracking-widest mb-1"
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-medium leading-relaxed"
      >
        {body}
      </Text>
    </View>
  );
}
