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
//
// ── What the served catalogue adds, and what it deliberately does not ────────
//
// `GET /automations/templates` (FRONTEND-PHASE18-GAP-030) is read here. It does
// **not** decide what is shown: the route is filtered to what the member may
// create and the unfiltered catalogue is never served, so an id missing from the
// response is either one they lack a capability for or one this deployment does
// not publish, and nothing can tell those apart. Narrowing the gallery on that
// ambiguity would remove working templates every time the deployment ships fewer
// than the app — which is the case today.
//
// What it does is tell the member when the deployment is **ahead** of the app: a
// template published there and absent from this build cannot be rendered, and a
// build that swallowed that silently would leave nobody able to see why an
// automation they were told about is not on this screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  useAutomationAccess,
  useAutomationCatalog,
  useAutomationTemplates,
  useAvailableScopes,
  useScopeFor,
} from '@/hooks/automation';
import {
  TEMPLATE_CATEGORY_LABELS,
  templatesByCategory,
  templateSupportFrom,
  TEMPLATE_CATALOG,
  templatesFor,
} from '@/lib/automation/templates';
import { trackAutomationEvent } from '@/lib/automation/events';
import { ScopePicker, SCOPE_PRESENTATION, SupportBadge } from '@/components/automation';
import { useBottomInset } from '@/components/layout/bottom-inset';
import type {
  AutomationOwnerKind,
  AutomationSupportStatus,
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
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();

  // §45: which hat the member is wearing. Chosen first, because "am I setting
  // this up for myself or for the community I moderate?" is the first question
  // rather than a setting buried in a later step.
  const [ownerKind, setOwnerKind] = useState<AutomationOwnerKind>('user');

  const scope = useScopeFor(ownerKind);
  const { access } = useAutomationAccess(scope);
  // `noAutomationAccess()` is the placeholder returned while the capability
  // query is in flight, and it grants nothing — so `templatesFor` filters the
  // whole gallery away and the empty state below claims the deployment has no
  // ready-made automations. `provenance` is how the two are told apart: only
  // `'server'` means the platform actually answered.
  const accessIsKnown = access.provenance === 'server';
  const { kinds } = useAvailableScopes();

  const templates = useMemo(() => templatesFor(ownerKind, access), [ownerKind, access]);
  const grouped = useMemo(() => templatesByCategory(templates), [templates]);

  // The ids this build knows at all, not the ones it is currently offering: the
  // question the served list answers is "does this deployment publish something
  // this app has no gallery entry for", and comparing against the permission-
  // filtered subset would report every template the member simply may not use.
  const knownIds = useMemo(() => TEMPLATE_CATALOG.map((template) => template.id), []);
  const published = useAutomationTemplates(ownerKind, knownIds);

  // What this deployment says it can actually run, per part. See
  // `lib/automation/served-support.ts`: keying off the served *template* looks
  // simpler and is wrong, because the two catalogues share ids without sharing
  // definitions.
  const { lookup: servedSupport } = useAutomationCatalog();

  useEffect(() => {
    trackAutomationEvent('automation.templates.viewed', { automationCount: templates.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Ready-made automations" showBack />

      <ScrollEndScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
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
                <TemplateCard
                  key={template.id}
                  template={template}
                  ownerKind={ownerKind}
                  support={templateSupportFrom(template, servedSupport)}
                />
              ))}
            </View>
          );
        })}

        {/* Published there, unbuildable here. Named rather than counted, because
            "two automations you cannot see" is not something a member can act
            on and a name is at least searchable in a release note. */}
        {published.unknownToThisBuild.length > 0 ? (
          <View
            style={{ borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mb-6"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
              {published.unknownToThisBuild.length === 1
                ? 'One more automation is available'
                : `${published.unknownToThisBuild.length} more automations are available`}
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-medium leading-relaxed mt-1"
            >
              {published.unknownToThisBuild.map((template) => template.name).join(', ')}
              {'. '}
              This version of the app cannot set them up yet. Updating will bring
              them here.
            </Text>
          </View>
        ) : null}

        {templates.length === 0 && !accessIsKnown ? (
          /* Not the same sentence as an empty gallery, because it is not the
             same fact. Reached on a cold open of this screen — deep link, or
             a member who lands here before the capability query resolves —
             where the placeholder capability set grants nothing and every
             template is filtered out. Saying "there are none" there tells the
             member the deployment has no ready-made automations, which on
             22 Aug 2026 was false for five of them. */
          <View className="items-center py-12">
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium text-center leading-relaxed"
            >
              Checking what you can set up…
            </Text>
          </View>
        ) : null}

        {templates.length === 0 && accessIsKnown ? (
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
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function TemplateCard({
  template,
  ownerKind,
  support,
}: {
  template: AutomationTemplate;
  ownerKind: AutomationOwnerKind;
  /**
   * The badge to render, already resolved against the deployment's catalogue.
   *
   * Passed in rather than read from `template.support` because that field is
   * derived from this build's static parts tables, and those tables were wrong
   * about 59 of the 83 parts the deployment also names. See
   * `lib/automation/served-support.ts`.
   */
  support: AutomationSupportStatus;
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
        <SupportBadge support={support} compact />
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
