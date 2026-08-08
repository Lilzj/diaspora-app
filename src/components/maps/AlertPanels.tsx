// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — community alert surfaces (Frontend Phase 8, §27–§29)
//
// §27 says do not create a parallel notification system, and this phase does
// not. Every alert rendered here is a **B9 Community Update** read through the
// certified contract and translated by `toCommunityAlert`. The same record
// appears in the Knowledge tab; this is a second *presentation* of it, on a
// map, which is what §2 says maps are for.
//
// What is genuinely absent is the affected-area geometry
// (FRONTEND-MAPS-GAP-017), and the honest handling of that runs through this
// file: an alert with no stated area is drawn as a point and labelled
// "reported near", never as a circle somebody might route around.
//
// ── The lifecycle rule ───────────────────────────────────────────────────────
//
// §29: expired alerts do not stay visible. That is enforced in
// `lib/maps/markers.ts`, where `alertMarker` returns null for anything expired,
// withdrawn or cancelled — so no map can show one even if a screen forgets to
// filter. `<AlertStatusBadge>` here covers the states that *are* visible: an
// alert that has been amended says so, and one about to expire says when.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { formatRelativeTime } from '@/utils/format';
import { alertKindLabel } from '@/lib/maps/markers';
import type { AlertArea, AlertSeverity, CommunityAlert } from '@/types/maps';
import { MapsGapNotice } from './MapsGapNotice';

const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone: 'error' | 'warning' | 'info' }
> = {
  critical: { label: 'Emergency', icon: 'alert-circle', tone: 'error' },
  high: { label: 'Urgent', icon: 'warning', tone: 'error' },
  moderate: { label: 'Community', icon: 'information-circle', tone: 'warning' },
  low: { label: 'Notice', icon: 'chatbubble-ellipses-outline', tone: 'info' },
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { tokens } = useTheme();
  const meta = SEVERITY_META[severity];
  const tone = tokens.color[meta.tone];

  return (
    <View
      style={{ backgroundColor: tone.surface }}
      className="flex-row items-center px-2 py-0.5 rounded-full self-start"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${meta.label} alert`}
    >
      <Ionicons name={meta.icon} size={11} color={tone.default} />
      <Text
        style={{ color: tone.default }}
        className="text-[9px] font-black uppercase tracking-wider ml-1"
      >
        {meta.label}
      </Text>
    </View>
  );
}

/**
 * The lifecycle badge.
 *
 * `Updated` and an imminent expiry are the two states a member acts on
 * differently. An amended alert may say something different from what they read
 * an hour ago, and one expiring in twenty minutes is about to stop being
 * relevant — both are worth a word, and neither is visible from the body text.
 */
export function AlertStatusBadge({ alert }: { alert: CommunityAlert }) {
  const { tokens } = useTheme();

  const expiresInMs = alert.expiresAt ? new Date(alert.expiresAt).getTime() - Date.now() : null;
  const expiringSoon = expiresInMs !== null && expiresInMs > 0 && expiresInMs < 60 * 60 * 1000;

  if (alert.status === 'Updated') {
    return (
      <Text
        style={{ color: tokens.color.info.default }}
        className="text-[9px] font-black uppercase tracking-wider"
        accessibilityLabel="This alert has been updated since it was first published"
      >
        Updated {alert.updatedAt ? formatRelativeTime(alert.updatedAt) : ''}
      </Text>
    );
  }

  if (expiringSoon) {
    return (
      <Text
        style={{ color: tokens.color.warning.default }}
        className="text-[9px] font-black uppercase tracking-wider"
        accessibilityLabel={`This alert expires in about ${Math.round(expiresInMs / 60000)} minutes`}
      >
        Expires in {Math.round(expiresInMs / 60000)} min
      </Text>
    );
  }

  return null;
}

export function AlertCard({
  alert,
  onPress,
  compact = false,
}: {
  alert: CommunityAlert;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const meta = SEVERITY_META[alert.severity];

  const label = [
    `${meta.label} alert.`,
    alert.title,
    `${alertKindLabel(alert.kind)} in ${alert.areaName}.`,
    `Reported ${formatRelativeTime(alert.publishedAt)}.`,
    alert.confirmationCount
      ? `Confirmed by ${alert.confirmationCount} ${alert.confirmationCount === 1 ? 'person' : 'people'}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <View className="flex-row items-center justify-between mb-1.5">
        <AlertSeverityBadge severity={alert.severity} />
        <AlertStatusBadge alert={alert} />
      </View>

      <Text
        numberOfLines={compact ? 1 : 2}
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black leading-snug"
      >
        {alert.title}
      </Text>

      {!compact ? (
        <Text
          numberOfLines={2}
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {alert.body}
        </Text>
      ) : null}

      <View className="flex-row items-center flex-wrap gap-2 mt-2">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-black uppercase tracking-wider"
        >
          {alertKindLabel(alert.kind)}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold"
        >
          · {alert.areaName}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold"
        >
          · {formatRelativeTime(alert.publishedAt)}
        </Text>
        {alert.confirmationCount ? (
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={10} color={tokens.color.success.default} />
            <Text
              style={{ color: tokens.color.success.default }}
              className="text-[10px] font-black ml-0.5"
            >
              {alert.confirmationCount}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const style = {
    backgroundColor: tokens.color.surface.card,
    borderColor: `${tokens.color[meta.tone].default}33`,
  };

  if (!onPress) {
    return (
      <View
        style={style}
        className="rounded-2xl border p-3.5"
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        testID={`alert-card-${alert.id}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={style}
      className="rounded-2xl border p-3.5"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Activate to see the full alert"
      testID={`alert-card-${alert.id}`}
    >
      {body}
    </Pressable>
  );
}

/**
 * The affected area, or an honest statement that none was published.
 *
 * The second branch is the one that matters. §28 asks for the affected area
 * "where available", and the certified contract never carries one
 * (FRONTEND-MAPS-GAP-017). Saying "reported near here" is the truth; drawing a
 * confident circle would let a member route around an area that is not closed,
 * or through one that is.
 */
export function AlertAreaNote({
  area,
  areaName,
}: {
  area: AlertArea | null | undefined;
  areaName: string;
}) {
  const { tokens } = useTheme();

  if (!area) {
    return (
      <View
        className="flex-row items-start"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`The person who reported this did not say how large an area it affects. It was reported near ${areaName}.`}
        testID="alert-area-unknown"
      >
        <Ionicons name="location-outline" size={13} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold leading-relaxed ml-1.5 flex-1"
        >
          Reported near {areaName}. The affected area was not stated, so the map shows a single
          point rather than a zone.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="flex-row items-start"
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        area.radiusMetres
          ? `Estimated to affect roughly ${Math.round(area.radiusMetres)} metres around ${areaName}. ${area.description ?? ''}`
          : `Affected area around ${areaName}. ${area.description ?? ''}`
      }
      testID="alert-area-note"
    >
      <Ionicons name="radio-outline" size={13} color={tokens.color.warning.default} />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed ml-1.5 flex-1"
      >
        {area.radiusMetres
          ? `Roughly ${Math.round(area.radiusMetres)} m around ${areaName}`
          : `Affected area around ${areaName}`}
        {area.description ? ` — ${area.description}` : ''}
      </Text>
    </View>
  );
}

/**
 * The alert detail body.
 *
 * Carries the source and the community verification count prominently, because
 * §26's principle — say where a claim comes from — applies at least as strongly
 * to a stranger's report of a road closure as it does to a safety score.
 */
export function AlertDetailPanel({
  alert,
  area,
  onShare,
  onSave,
  onNavigate,
}: {
  alert: CommunityAlert;
  area?: AlertArea | null;
  onShare?: () => void;
  onSave?: () => void;
  onNavigate?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View testID="alert-detail-panel">
      <View className="flex-row items-center justify-between mb-2">
        <AlertSeverityBadge severity={alert.severity} />
        <AlertStatusBadge alert={alert} />
      </View>

      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xl font-black leading-snug"
      >
        {alert.title}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-sm font-semibold leading-relaxed mt-2"
      >
        {alert.body}
      </Text>

      <View className="mt-4 gap-2.5">
        <AlertAreaNote area={area} areaName={alert.areaName} />

        <View
          className="flex-row items-start"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Reported ${formatRelativeTime(alert.publishedAt)} by ${alert.sourceName}.${
            alert.confirmationCount
              ? ` Confirmed by ${alert.confirmationCount} other ${alert.confirmationCount === 1 ? 'person' : 'people'}.`
              : ' Not yet confirmed by anyone else.'
          }`}
        >
          <Ionicons name="person-outline" size={13} color={tokens.color.text.placeholder} />
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold leading-relaxed ml-1.5 flex-1"
          >
            {alert.sourceName} · {formatRelativeTime(alert.publishedAt)}
            {alert.confirmationCount
              ? ` · confirmed by ${alert.confirmationCount}`
              : ' · not yet confirmed by anyone else'}
          </Text>
        </View>

        {alert.expiresAt ? (
          <View
            className="flex-row items-start"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`This alert stops showing ${formatRelativeTime(alert.expiresAt)}.`}
          >
            <Ionicons name="time-outline" size={13} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold leading-relaxed ml-1.5 flex-1"
            >
              Stops showing {formatRelativeTime(alert.expiresAt)}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row gap-2 mt-5">
        {onNavigate ? (
          <Pressable
            onPress={onNavigate}
            accessibilityRole="button"
            accessibilityLabel="Get directions to this location"
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="flex-1 py-3 rounded-2xl items-center"
            testID="alert-navigate"
          >
            <Text className="text-white text-[11px] font-black uppercase tracking-wider">
              Directions
            </Text>
          </Pressable>
        ) : null}

        {onShare && alert.isShareable ? (
          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share this alert"
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="px-4 py-3 rounded-2xl border items-center justify-center"
            testID="alert-share"
          >
            <Ionicons name="share-outline" size={16} color={tokens.color.text.secondary} />
          </Pressable>
        ) : null}

        {onSave ? (
          <Pressable
            onPress={onSave}
            accessibilityRole="button"
            accessibilityLabel="Save this alert"
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="px-4 py-3 rounded-2xl border items-center justify-center"
            testID="alert-save"
          >
            <Ionicons name="bookmark-outline" size={16} color={tokens.color.text.secondary} />
          </Pressable>
        ) : null}
      </View>

      {!area ? (
        <View className="mt-4">
          <MapsGapNotice
            gapKey="alertAffectedArea"
            compact
            detail="This alert is real — it is a community report from the Diaspora platform. What is missing is the affected area: nobody stated how far it extends, so the map shows a point rather than a zone."
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The banner that says how current the alert feed is.
 *
 * §43 forbids claiming real-time safety data while offline, and §30 makes
 * realtime a degraded capability today (FRONTEND-MAPS-GAP-018). So this says
 * "checked a minute ago" rather than "live" whenever that is the truth — a road
 * closure that cleared four minutes ago is a member sent the long way round,
 * and the word "live" is what would make them trust it.
 */
export function AlertFreshnessBanner({
  mode,
  lastUpdatedAt,
  isOffline,
}: {
  mode: 'live' | 'polling' | 'off';
  lastUpdatedAt: number | null;
  isOffline?: boolean;
}) {
  const { tokens } = useTheme();

  const text = isOffline
    ? 'You are offline. These alerts are the last ones we saw and may have changed.'
    : mode === 'live'
      ? 'Alerts update as they are published.'
      : mode === 'polling'
        ? `Alerts are checked every minute${
            lastUpdatedAt ? ` · last checked ${formatRelativeTime(new Date(lastUpdatedAt).toISOString())}` : ''
          }`
        : 'Alerts are not updating automatically. Pull to refresh.';

  const tone = isOffline ? tokens.color.warning : tokens.color.info;

  return (
    <View
      style={{ backgroundColor: tone.surface }}
      className="flex-row items-center px-3 py-2 rounded-xl"
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="alert-freshness-banner"
    >
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : 'sync-outline'}
        size={12}
        color={tone.default}
      />
      <Text style={{ color: tone.default }} className="text-[10px] font-bold ml-1.5 flex-1">
        {text}
      </Text>
    </View>
  );
}
