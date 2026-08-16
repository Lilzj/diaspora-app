// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Sign-in methods (Frontend Phase 16, §21 · §22 · §23 · §24)
//
// §24's screen. The one thing it must never let a member do is remove their
// only way back into their own account.
//
// The unlink control for a member's last usable method is **rendered disabled
// with the reason beside it**, not hidden. Hiding it would leave a member
// looking for a control that other rows have and theirs does not, with no
// explanation; showing it disabled with "this is the only way you can sign in"
// answers the question before it is asked.
//
// The rule is computed by `applyUnlinkRules` over the whole set — never per row
// — and the server refuses independently (FRONTEND-PHASE16-GAP-007). This
// screen is the courtesy; the 409 is the control.
//
// ── §22, on this screen specifically ─────────────────────────────────────────
//
// Only `identity.*` providers appear here. A member's Google *Calendar*
// connection is a different integration on a different screen, and merging them
// would mean disconnecting one appeared to disconnect the other.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { useIdentityLinks } from '@/hooks/integrations';
import {
  IntegrationGapNotice,
  IntegrationStatusBadge,
  IntegrationErrorNotice,
} from '@/components/integrations';
import { describeAccount, identityProviders } from '@/lib/integrations/identity';
import { resolveIdentityProviders } from '@/lib/integrations/registry';
import { descriptorFor } from '@/lib/integrations/catalog';
import type { IdentityLink } from '@/types/integrations';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function IdentityIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { links, isLoading, error } = useIdentityLinks();

  const phone = links.find((link) => link.provider === 'identity.phone');
  const thirdParty = identityProviders(links).filter((link) => link.provider !== 'identity.phone');
  const available = resolveIdentityProviders();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Sign-in methods" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : (
          <>
            {error ? (
              <View className="mb-4">
                <IntegrationErrorNotice message={error.message} hint={error.hint} />
              </View>
            ) : null}

            <Heading
              title="How you sign in"
              subtitle="You need at least one of these. Diaspora will not let you remove the last one."
            />

            {/* Phone is real: `/auth/otp/*` is certified and is how every member
                signs in today. Listing it first, and as connected, is accurate
                rather than generous. */}
            {phone ? <LinkRow link={phone} /> : null}
            {thirdParty.map((link) => (
              <LinkRow key={link.provider} link={link} />
            ))}

            <Heading
              title="Add another way to sign in"
              subtitle="A second method means you can still get in if you lose your phone number."
            />

            {available.map((provider) => {
              const descriptor = descriptorFor(provider.descriptor.id);
              const alreadyLinked = links.some(
                (link) => link.provider === provider.descriptor.id && link.status === 'CONNECTED'
              );

              if (alreadyLinked) return null;

              return (
                <View
                  key={provider.descriptor.id}
                  style={{ borderColor: tokens.color.border.default }}
                  className="border rounded-2xl p-4 mb-2.5"
                >
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black mb-1"
                  >
                    {descriptor?.name ?? provider.descriptor.label}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-semibold leading-relaxed mb-3"
                  >
                    {descriptor?.description ?? ''}
                  </Text>
                  <IntegrationStatusBadge
                    status="BACKEND_GAP"
                    mode={provider.descriptor.mode}
                    showDescription
                  />
                </View>
              );
            })}

            <View className="mt-2 mb-4">
              <IntegrationGapNotice
                gapKey="oauthExchange"
                detail="Signing in with Google or Apple needs a backend that exchanges the authorization securely. Diaspora will not open a sign-in screen it cannot finish — completing one would give away a real permission for nothing."
              />
            </View>

            <Heading title="Your phone number" />
            <Button
              label="Change phone number"
              variant="outline"
              onPress={() => router.push('/verification/phone')}
            />
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function LinkRow({ link }: { link: IdentityLink }) {
  const { tokens } = useTheme();
  const account = describeAccount(link);
  const descriptor = descriptorFor(link.provider);

  return (
    <View
      style={{ borderColor: tokens.color.border.default }}
      className="border rounded-2xl p-4 mb-2.5"
      testID={`identity-link-${link.provider}`}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
          {descriptor?.name ?? providerLabel(link.provider)}
        </Text>
        {link.isPrimary ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase tracking-widest"
          >
            Primary
          </Text>
        ) : null}
      </View>

      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-bold mb-1">
        {account.primary}
      </Text>

      {/* §23. An Apple private-relay address is real and is not the member's
          own; presenting it as "your email" would be wrong twice. */}
      {account.caveat ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold leading-relaxed mb-2"
        >
          {account.caveat}
        </Text>
      ) : null}

      <View className="mt-1.5">
        <IntegrationStatusBadge status={link.status} mode={link.mode} />
      </View>

      <View className="mt-3">
        {link.canUnlink ? (
          <Button label="Remove" variant="outline" onPress={() => {}} />
        ) : (
          // Disabled with the reason, not hidden. See the file header.
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-3"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Cannot be removed. ${link.cannotUnlinkReason ?? ''}`}
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
            >
              {link.cannotUnlinkReason ?? 'This cannot be removed.'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function providerLabel(provider: string): string {
  if (provider === 'identity.phone') return 'Phone number';
  if (provider === 'identity.email') return 'Email address';
  return provider;
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useTheme();
  return (
    <View className="mb-2.5 mt-5">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black uppercase tracking-widest"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
