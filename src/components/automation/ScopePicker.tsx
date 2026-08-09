// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Owner scope picker (Frontend Phase 18, §45 · §14)
//
// Which hat a member is wearing when they create an automation.
//
// ── Why this exists as its own control ───────────────────────────────────────
//
// §45 requires every automation to have a clear owner, and the domain supports
// nine: user, creator, provider, employer, landlord, seller, organization,
// community and platform. Without a picker, every screen would have to assume
// one — and the first version of this phase did assume `user`, which left the
// community, creator and business templates built and unreachable.
//
// So the scope is chosen once, at the point a member starts, and carried
// through the builder as a route parameter. That is also the honest place for
// it: "am I setting this up for myself or for the community I moderate?" is the
// first question, not a setting buried in a later step.
//
// ── What it never offers ─────────────────────────────────────────────────────
//
// **`platform` is never in the list**, whatever the capability set says.
// `useAvailableScopes()` refuses to add it and this component renders what that
// hook returns. §66: platform-wide automation is not a member surface, and a
// picker is exactly where one would accidentally be introduced.
//
// A scope the server has not granted is **not shown** — the same
// hidden-not-disabled rule as everywhere else in this phase. A member who is
// not a moderator does not learn from this control that community automations
// exist.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';
import type { AutomationOwnerKind } from '@/types/automation';

/** How each scope reads, and what it means. One place, so screens agree. */
export const SCOPE_PRESENTATION: Record<
  AutomationOwnerKind,
  { label: string; description: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  user: {
    label: 'For me',
    description: 'Automations that only affect you.',
    icon: 'person-outline',
  },
  creator: {
    label: 'As a creator',
    description: 'Milestones, rewards and your followers.',
    icon: 'sparkles-outline',
  },
  community: {
    label: 'For a community',
    description: 'Reaches members of a community you help run.',
    icon: 'people-outline',
  },
  organization: {
    label: 'For an organization',
    description: 'Reaches members of an organization you help run.',
    icon: 'business-outline',
  },
  provider: {
    label: 'As a provider',
    description: 'Leads, reviews and your featured placement.',
    icon: 'briefcase-outline',
  },
  employer: {
    label: 'As an employer',
    description: 'Applications to jobs you posted.',
    icon: 'document-text-outline',
  },
  landlord: {
    label: 'As a landlord',
    description: 'Enquiries about your properties.',
    icon: 'home-outline',
  },
  seller: {
    label: 'As a seller',
    description: 'Offers, enquiries and your listings.',
    icon: 'pricetag-outline',
  },
  // Present so the type is exhaustive and a *rendered* platform automation can
  // be labelled correctly. Never offered — see the file header.
  platform: {
    label: 'Platform-wide',
    description: 'Managed by Diaspora.',
    icon: 'globe-outline',
  },
};

export interface ScopePickerProps {
  scopes: AutomationOwnerKind[];
  selected: AutomationOwnerKind;
  onSelect: (scope: AutomationOwnerKind) => void;
  /** A compact row of chips, for a screen that already has a heading. */
  compact?: boolean;
}

export function ScopePicker({ scopes, selected, onSelect, compact = false }: ScopePickerProps) {
  const { tokens } = useTheme();

  // One scope is not a choice. Rendering a picker with a single option teaches
  // somebody that a control does something when it does not.
  if (scopes.length <= 1) return null;

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel="Who this automation is for"
        className="mb-3"
        testID="automation-scope-picker"
      >
        {scopes.map((scope) => {
          const presentation = SCOPE_PRESENTATION[scope];
          const isSelected = selected === scope;

          return (
            <Pressable
              key={scope}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={presentation.label}
              accessibilityHint={presentation.description}
              onPress={() => onSelect(scope)}
              style={{
                backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                borderColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.border,
              }}
              className="flex-row items-center rounded-full border px-3.5 py-2 mr-2 h-9"
            >
              <Ionicons
                name={presentation.icon}
                size={13}
                color={isSelected ? tokens.color.text.inverse : tokens.color.text.secondary}
              />
              <Text
                style={{
                  color: isSelected ? tokens.color.text.inverse : tokens.color.text.secondary,
                }}
                className="text-[11px] font-black ml-1.5"
              >
                {presentation.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Who this automation is for"
      testID="automation-scope-picker"
    >
      {scopes.map((scope) => {
        const presentation = SCOPE_PRESENTATION[scope];
        const isSelected = selected === scope;

        return (
          <Pressable
            key={scope}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={presentation.label}
            accessibilityHint={presentation.description}
            onPress={() => onSelect(scope)}
            style={{
              backgroundColor: isSelected
                ? `${tokens.color.primary[500]}12`
                : tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.border,
            }}
            className="rounded-2xl border p-3.5 mb-2 flex-row items-center"
          >
            {/* The glyph carries selection for anybody who cannot distinguish
                the border colour. §62. */}
            <Ionicons
              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
            />

            <View className="flex-1 ml-2.5">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-bold"
              >
                {presentation.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-medium mt-0.5"
              >
                {presentation.description}
              </Text>
            </View>

            <Ionicons
              name={presentation.icon}
              size={18}
              color={tokens.color.text.placeholder}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
