// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Template gallery (Frontend Phase 18, §31)
//
// The automations a member can have without building one.
//
// ── Why this is the default route from "Create an automation" ────────────────
//
// §7 asks for a builder ordinary users can understand, and the honest reading
// of that is that most people should never open one. A member who wants to be
// told about software jobs in Mauritius does not want a rule engine; they want
// two questions and a switch. The builder is the escape hatch at the bottom of
// this screen, not the front door.
//
// ── §31: "permission-aware and context-aware" ────────────────────────────────
//
// `templatesFor()` does the permission filtering against the server's
// capability set, so a template a member cannot use is not rendered at all —
// the same hidden-not-disabled rule as everywhere else in this phase. Context
// comes from the fields each template asks for, which are the two or three
// decisions genuinely theirs to make.
//
// **Support status is shown, not filtered on.** A template whose parts are all
// backend gaps still appears, with its badge. Hiding it would leave a member
// unable to configure something that will start working the day the platform
// ships, and §31 asks for permission-awareness rather than for hiding what is
// still being built.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useAutomationAccess, useAvailableScopes, useScopeFor } from '@/hooks/automation';
import {
  TEMPLATE_CATEGORY_LABELS,
  templatesByCategory,
  templatesFor,
} from '@/lib/automation/templates';
import { trackAutomationEvent } from '@/lib/automation/events';
import { ScopePicker, SCOPE_PRESENTATION, SupportBadge } from '@/components/automation';
import type {
  AutomationOwnerKind,
  AutomationTemplate,
  AutomationTemplateCategory,
} from '@/types/automation';

/** The order categories appear in. Reminders first, because they are the ask. */
const CATEGORY_ORDER: AutomationTemplateCategory[] = [
  'reminders',
  'alerts',
  'money',
  'community',
  'growth',
  'admin',
];

export default function AutomationTemplatesScreen() {
  const { tokens } = useTheme();

  // §45: which hat the member is wearing. Chosen first, because "am I setting
  // this up for myself or for the community I moderate?" is the first question
  // rather than a setting buried in a later step.
  const [ownerKind, setOwnerKind] = useState<AutomationOwnerKind>('user');

  const scope = useScopeFor(ownerKind);
  const { access } = useAutomationAccess(scope);
  const { kinds } = useAvailableScopes();

  const templates = useMemo(() => templatesFor(ownerKind, access), [ownerKind, access]);
  const grouped = useMemo(() => templatesByCategory(templates), [templates]);

  useEffect(() => {
    trackAutomationEvent('automation.templates.viewed', { automationCount: templates.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Ready-made automations" showBack />

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }}>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-medium leading-relaxed mt-2 mb-3"
        >
          Pick one and answer a question or two. You can change anything afterwards.
        </Text>

        {/* Renders nothing when the member has only one scope — a picker with a
            single option teaches somebody that a control does something. */}
        <ScopePicker
          scopes={kinds}
          selected={ownerKind}
          onSelect={setOwnerKind}
          compact
        />

        {CATEGORY_ORDER.map((category) => {
          const entries = grouped.get(category);
          if (!entries || entries.length === 0) return null;

          return (
            <View key={category} className="mb-6">
              <Text
                accessibilityRole="header"
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest mb-2"
              >
                {TEMPLATE_CATEGORY_LABELS[category]}
              </Text>

              {entries.map((template) => (
                <TemplateCard key={template.id} template={template} ownerKind={ownerKind} />
              ))}
            </View>
          );
        })}

        {templates.length === 0 ? (
          <View className="items-center py-12">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black mb-1 text-center"
            >
              Nothing here yet
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium text-center leading-relaxed"
            >
              {/* Names the scope rather than saying "your account", because
                  with a picker on screen the member needs to know *which*
                  choice produced the empty list. */}
              There are no ready-made automations for “
              {SCOPE_PRESENTATION[ownerKind].label}” yet.
            </Text>
          </View>
        ) : null}

        {/* The escape hatch, at the bottom rather than at the top. See the
            file header: most people should never need it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build one from scratch"
          accessibilityHint="Opens the automation builder"
          onPress={() => router.push(`/automation/create?scope=${ownerKind}` as never)}
          style={{ borderColor: tokens.color.surface.border }}
          className="rounded-2xl border p-4 flex-row items-center"
        >
          <Ionicons name="construct-outline" size={18} color={tokens.color.text.secondary} />
          <View className="flex-1 ml-3">
            <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
              Build one from scratch
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-0.5"
            >
              Choose your own trigger, conditions and actions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TemplateCard({
  template,
  ownerKind,
}: {
  template: AutomationTemplate;
  ownerKind: AutomationOwnerKind;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${template.name}. ${template.description}`}
      accessibilityHint="Opens this automation so you can set it up"
      onPress={() => {
        trackAutomationEvent('automation.template.used', {
          templateId: template.id,
          ownerKind,
        });
        // The scope travels with the template, so the builder does not have to
        // re-derive which hat the member was wearing when they chose it.
        router.push(`/automation/create?template=${template.id}&scope=${ownerKind}` as never);
      }}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-4 mb-2"
      testID={`automation-template-${template.id}`}
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-black leading-snug"
          >
            {template.name}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-medium mt-1 leading-relaxed"
          >
            {template.description}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
      </View>

      <View className="flex-row items-center mt-3" importantForAccessibility="no-hide-descendants">
        <SupportBadge support={template.support} compact />
        {template.fields.length > 0 ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold ml-2"
          >
            {template.fields.length} {template.fields.length === 1 ? 'question' : 'questions'}
          </Text>
        ) : (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold ml-2"
          >
            Nothing to fill in
          </Text>
        )}
      </View>
    </Pressable>
  );
}
