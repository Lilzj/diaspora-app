// ─────────────────────────────────────────────────────────────────────────────
// The four states every tab in the organisation workspace has to render
//
// §26: no tab may show an empty white area while it is loading or when it has
// nothing. §27: and the empty state must say what *this* tab is for — one
// generic "nothing here" repeated five times tells a member nothing about the
// organisation they are looking at.
//
// The primitives themselves are Community Life's — `EmptyState`, `Card`,
// `InlineRefusal` from `components/community`. This file is the small amount of
// glue that decides which of them a tab is in, so five tabs do not each write
// the same four-branch conditional slightly differently.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { EmptyState, InlineRefusal } from '@/components/community';
import { useTheme } from '@/design-system';
import type { FinancialFailureKind } from '@/lib/financial-errors';

// ─────────────────────────────────────────────────────────────────────────────

export function TabLoading({ label }: { label: string }) {
  const { tokens } = useTheme();

  return (
    <View className="items-center justify-center py-10" accessibilityLabel={`Loading ${label}`}>
      <ActivityIndicator color={tokens.color.primary[500]} />
      <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-semibold mt-3">
        Loading {label}…
      </Text>
    </View>
  );
}

/**
 * A failed read.
 *
 * **A 403 is not a connection problem and must not be offered a retry button.**
 * The roster endpoint refuses anyone without `canManageMembers`, so an Organizer
 * opening Members gets a 403 — and telling them to try again is both wrong and
 * an invitation to hammer an endpoint that will refuse them every time.
 *
 * `kind` comes from the shared error mapper, which already turns an HTTP status
 * into `'forbidden'`. Anything else is treated as transient and gets the retry.
 */
export function TabError({
  label,
  subject,
  kind,
  onRetry,
}: {
  label: string;
  /** What the caller may not see, in the refusal sentence. */
  subject?: string;
  kind?: FinancialFailureKind;
  onRetry: () => void;
}) {
  if (kind === 'forbidden') {
    return (
      <TabRefused
        reason={`Your role in this organisation does not include ${
          subject ?? label.toLowerCase()
        }. Somebody who manages it can change that.`}
      />
    );
  }

  if (kind === 'unauthenticated') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="You have been signed out"
        body="Sign in again to see this organisation."
      />
    );
  }

  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={`${label} could not be loaded`}
      body="This is usually a connection problem rather than a permission one. Try again."
      action="Try again"
      onAction={onRetry}
    />
  );
}

/**
 * What a member sees when their role does not include this tab's subject.
 *
 * Deliberately not an empty state: "no members found" and "you may not see the
 * members" are different facts, and showing the first for the second is how a
 * member concludes an organisation is empty when it is not.
 */
export function TabRefused({ reason }: { reason: string }) {
  return <InlineRefusal reason={reason} />;
}

/**
 * What a tab shows when the adapter behind it is not in this build.
 *
 * §34. This is neither an empty state nor an error, and rendering either would
 * lie: "No members yet" claims an organisation has nobody when the truth is
 * that nothing was asked. Every organisation hook returns `isEnabled: false`
 * with an empty payload in a release build without
 * `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`, so without this branch all five tabs
 * would read as empty organisations rather than as an unbuilt data source —
 * which looks exactly like the blank tabs this work replaced.
 */
export function TabUnavailable({ label }: { label: string }) {
  return (
    <EmptyState
      icon="construct-outline"
      title={`${label} are not available in this build`}
      body="The organisation service is not wired into this build, so nothing was requested. This is a build setting rather than a permission — an internal preview build shows real data here."
    />
  );
}

/**
 * The strip that says a tab's data is simulated.
 *
 * Community Life already has `CommunityGapNotice` for a whole screen. Inside a
 * sheet, at tab granularity, a full notice per tab would be five notices; this
 * is the one-line form.
 *
 * ── Why the background is a surface token and not `primary[50]` ─────────────
 *
 * It was `primary[50]`, which is a palette value and therefore the same cream
 * in both schemes, with `text.secondary` for the body — which is *not*, and
 * flips to a light grey in dark. Light grey on cream, and the sentence
 * explaining that the data is simulated became the least readable thing on the
 * screen. Found in the dark capture of this sheet, not by any static check:
 * both tokens are legitimate, and only the pairing is wrong.
 *
 * The rule this file now follows: never pair a fixed palette value with a
 * scheme-aware one. `surface.elevated` and `text.secondary` both flip, so they
 * stay legible together, and the brand stays on the border and the label —
 * where `primary[500]` and `primary[600]` are fixed against a surface that
 * moves, which is the safe direction.
 */
export function TabGapNote({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.elevated,
        borderColor: tokens.color.primary[500],
      }}
      className="rounded-2xl border px-3.5 py-2.5 mb-3"
      accessible
      accessibilityRole="text"
    >
      <Text
        style={{ color: tokens.color.text.brand }}
        className="text-[9px] font-black uppercase tracking-widest mb-1"
      >
        ⚗️ Preview data
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[10.5px] font-semibold leading-relaxed"
      >
        {children}
      </Text>
    </View>
  );
}

/** A small heading inside a tab, with an optional trailing action. */
export function TabHeading({
  title,
  count,
  action,
  onAction,
}: {
  title: string;
  count?: number;
  action?: string;
  onAction?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest flex-1 mr-2"
        numberOfLines={1}
      >
        {title}
        {typeof count === 'number' ? ` · ${count}` : ''}
      </Text>

      {action && onAction ? (
        <Text
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={{ color: tokens.color.text.brand }}
          className="text-[10px] font-black uppercase tracking-tight"
        >
          {action}
        </Text>
      ) : null}
    </View>
  );
}
