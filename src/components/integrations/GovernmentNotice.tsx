// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Government information (Frontend Phase 16, §19 · §20 · §60)
//
// §20 lists what official content must display: source, authority, last
// updated, published date, country, region, official URL and verification
// status. §19 forbids labelling unofficial information as government
// information, and forbids implying that Diaspora itself is the authority.
//
// ── How that is enforced rather than remembered ──────────────────────────────
//
// `<GovernmentNoticeCard>` takes a `GovernmentNotice`, whose `source` field is
// **required and non-nullable** in the domain model. There is no way to render
// a government-looking card without provenance, because the type has no shape
// that omits it and this is the only component that draws one.
//
// The source line is rendered *above* the title, not below the body. That is
// deliberate and it is the whole design of this component: a member reading
// top-to-bottom learns who says this before they read what is said. Provenance
// as a footnote is provenance most people never see.
//
// ── The three source kinds, said plainly ─────────────────────────────────────
//
//   official   — retrieved from a government API or official feed
//   curated    — somebody at Diaspora read an official page and summarised it
//   community  — a member wrote it
//
// Each gets a different word, a different icon and a different colour, and the
// word is never "official" unless the kind is. A curated summary that looked
// official would be the exact failure §19 names.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import type { GovernmentNotice, GovernmentSource } from '@/types/integrations';

/** How long before a check is described as old rather than recent. */
const STALE_AFTER_DAYS = 30;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000));
}

function describeAge(days: number | null): string {
  if (days == null) return 'never checked';
  if (days <= 0) return 'checked today';
  if (days === 1) return 'checked yesterday';
  if (days < 30) return `checked ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'checked over a month ago' : `checked over ${months} months ago`;
}

/**
 * The provenance line.
 *
 * Exported separately so a screen showing a single piece of official
 * information outside a card — a banner, a detail header — still has exactly
 * one way to render its source, rather than assembling one inline and omitting
 * a field.
 */
export function GovernmentSourceLine({ source }: { source: GovernmentSource }) {
  const { tokens } = useTheme();

  const tone =
    source.kind === 'official'
      ? tokens.color.success.default
      : source.kind === 'curated'
        ? tokens.color.info.default
        : tokens.color.text.secondary;

  const label =
    source.kind === 'official'
      ? 'Official source'
      : source.kind === 'curated'
        ? 'Summarised by Diaspora'
        : 'From the community';

  const age = daysSince(source.lastCheckedAt);
  const isStale = source.verification === 'stale' || (age != null && age > STALE_AFTER_DAYS);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}. Published by ${source.authority}. ${describeAge(age)}.${
        source.verification === 'unverified' ? ' Not verified.' : ''
      }`}
      testID={`government-source-${source.kind}`}
    >
      <View className="flex-row items-center flex-wrap">
        <View
          style={{ backgroundColor: `${tone}1A`, borderColor: `${tone}44` }}
          className="flex-row items-center rounded-full border px-2 py-0.5 mr-2 mb-1"
        >
          <Ionicons
            name={
              source.kind === 'official'
                ? 'shield-checkmark-outline'
                : source.kind === 'curated'
                  ? 'document-text-outline'
                  : 'people-outline'
            }
            size={10}
            color={tone}
          />
          <Text style={{ color: tone }} className="text-[9px] font-black uppercase tracking-widest ml-1">
            {label}
          </Text>
        </View>

        {source.verification === 'unverified' ? (
          <View
            style={{
              backgroundColor: tokens.color.warning.surface,
              borderColor: `${tokens.color.warning.default}44`,
            }}
            className="rounded-full border px-2 py-0.5 mr-2 mb-1"
          >
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              Not verified
            </Text>
          </View>
        ) : null}

        {isStale ? (
          <View
            style={{
              backgroundColor: tokens.color.warning.surface,
              borderColor: `${tokens.color.warning.default}44`,
            }}
            className="rounded-full border px-2 py-0.5 mb-1"
          >
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              May be out of date
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-bold mt-0.5"
      >
        {source.authority} · {source.countryCode}
        {source.region ? ` · ${source.region}` : ''} · {describeAge(age)}
      </Text>
    </View>
  );
}

export function GovernmentNoticeCard({ notice }: { notice: GovernmentNotice }) {
  const { tokens } = useTheme();
  const { source } = notice;

  const openOfficial = () => {
    if (!source.officialUrl) return;
    trackIntegrationEvent('government.source.opened', {
      domain: 'government',
      sourceKind: source.kind,
    });
    // The URL is rendered as the visible link text as well as opened, so a
    // member can see where they are going before they tap. A government surface
    // is a high-value phishing target and an opaque "Read more" is exactly the
    // affordance an attacker wants.
    void Linking.openURL(source.officialUrl).catch(() => {});
  };

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="border rounded-2xl p-4 mb-3"
      testID={`government-notice-${notice.id}`}
    >
      {/* Provenance first. See the file header. */}
      <View className="mb-2.5">
        <GovernmentSourceLine source={source} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight mb-1"
        accessibilityRole="header"
      >
        {notice.title}
      </Text>

      {notice.advisoryLevel && notice.advisoryLevel !== 'normal' ? (
        <Text
          style={{ color: tokens.color.warning.default }}
          className="text-[10px] font-black uppercase tracking-widest mb-1.5"
        >
          {advisoryLabel(notice.advisoryLevel)}
        </Text>
      ) : null}

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed"
      >
        {notice.summary}
      </Text>

      {source.publishedAt ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2"
        >
          Published {new Date(source.publishedAt).toLocaleDateString()}
        </Text>
      ) : null}

      {source.officialUrl ? (
        <Pressable
          onPress={openOfficial}
          accessibilityRole="link"
          accessibilityLabel={`Open the official page at ${source.officialUrl}`}
          className="flex-row items-center mt-3 active:opacity-70"
        >
          <Ionicons name="open-outline" size={14} color={tokens.color.primary[500]} />
          <Text
            style={{ color: tokens.color.primary[500] }}
            className="text-xs font-black ml-1.5 flex-1"
            numberOfLines={1}
          >
            {source.officialUrl}
          </Text>
        </Pressable>
      ) : (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold leading-relaxed mt-3"
        >
          No official link is available for this item. Check the authority’s own website before
          relying on it.
        </Text>
      )}
    </View>
  );
}

function advisoryLabel(level: NonNullable<GovernmentNotice['advisoryLevel']>): string {
  switch (level) {
    case 'caution':
      return 'Exercise caution';
    case 'reconsider':
      return 'Reconsider travel';
    case 'doNotTravel':
      return 'Do not travel';
    case 'normal':
    default:
      return '';
  }
}
