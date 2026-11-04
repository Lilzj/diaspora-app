// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a landlord's page
//
// **It could never fill in.** The screen read `data.host` and `data.listings`
// from `GET /housing/landlords/{idOrSlug}`; that route answers one
// `LandlordProfileResponse` and has no such fields, so `host` was undefined and
// every visit rendered "Host Profile Not Found". Behind that, the home page
// opened it with `listing.host.providerId` — a *Providers* identifier, null for
// every landlord who does not also run a service business, so the usual journey
// was `/housing/host/undefined`.
//
// What the page shows now is only what the platform sends: the landlord's name,
// kind, verification, bio, the contact channels they published, and their homes
// — read through the search, narrowed by `landlordId`. The fixture's
// description, follower count, response time and verification date are gone;
// none of them exists on this platform.
//
// See `lib/housing-landlord.ts` for the mapping, and its tests for the shape.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HousingCard } from '@/components/HousingCard';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/apiClient';
import { readPage, unwrapEnvelope } from '@/lib/platform-envelope';
import { toHousingCardListings, type HousingCardWire } from '@/lib/housing-cards';
import {
  landlordHomesParams,
  landlordKindLabel,
  landlordProfileFromWire,
  landlordResponseLabel,
  memberSinceLabel,
  type LandlordProfile,
  type LandlordProfileWire,
} from '@/lib/housing-landlord';
import { readOutcome, type ReadOutcome } from '@/lib/read-outcome';
import type { HousingListing } from '@/types/housing';
import { ConversationHub } from '@/lib/conversation-hub';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { backOr } from '@/lib/navigation';

export default function LandlordProfileScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { id } = useLocalSearchParams<{ id: string }>();
  const [landlord, setLandlord] = useState<LandlordProfile | null>(null);
  const [homes, setHomes] = useState<HousingListing[]>([]);
  const [homesFailed, setHomesFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  // Null while loading or loaded; otherwise what the failure actually established.
  const [failure, setFailure] = useState<ReadOutcome | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let abandoned = false;

    const load = async () => {
      setLoading(true);
      setFailure(null);
      setHomesFailed(false);

      try {
        const response = await apiClient.get(
          `/housing/landlords/${encodeURIComponent(String(id))}`
        );

        const profile = landlordProfileFromWire(
          unwrapEnvelope<LandlordProfileWire>(response.data)
        );

        if (abandoned) return;

        if (!profile) {
          // A 200 that is not a landlord is the same fact as a 404.
          setFailure('gone');
          return;
        }

        setLandlord(profile);

        // Their homes are a second read, in its own `try`: a search that fails
        // must not blank a profile that loaded.
        try {
          const homesResponse = await apiClient.get('/housing/search', {
            params: landlordHomesParams(profile.landlordId),
          });

          if (abandoned) return;

          setHomes(toHousingCardListings(readPage<HousingCardWire>(homesResponse.data).items));
        } catch (cause) {
          if (abandoned) return;
          console.error('Failed to load the homes of a landlord', cause);
          setHomes([]);
          setHomesFailed(true);
        }
      } catch (cause) {
        if (abandoned) return;
        console.error('Failed to load landlord profile', cause);
        // "Not there" and "we could not ask" are different sentences.
        setFailure(readOutcome(cause));
        setLandlord(null);
      } finally {
        if (!abandoned) setLoading(false);
      }
    };

    if (id) {
      void load();
    } else {
      setLoading(false);
      setFailure('gone');
    }

    return () => {
      abandoned = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const handleMessage = async () => {
    // A landlord profile is not a person. Without the member behind it there is
    // nobody to write to, and the button is not offered.
    if (!landlord?.ownerUserId) return;

    await ConversationHub.openOrCreateConversation({
      recipientId: landlord.ownerUserId,
      recipientName: landlord.name,
      contextType: 'HousingListing',
      entityId: landlord.landlordId,
      entityTitle: landlord.name,
      entitySubtitle:
        homes.length > 0 ? `${homes.length} home${homes.length === 1 ? '' : 's'} listed` : undefined,
      deepLink: `/housing/host/${landlord.landlordId}`,
      campaignSource: 'landlord_profile',
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-sm font-semibold text-content-muted mt-3">Loading landlord…</Text>
      </SafeAreaView>
    );
  }

  if (failure || !landlord) {
    const unreachable = failure === 'unreachable';

    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Text className="text-4xl mb-3">{unreachable ? '⚠️' : '👤'}</Text>
        <Text className="text-base font-extrabold text-content-primary text-center">
          {unreachable ? 'We could not load this landlord' : 'This landlord is not listed'}
        </Text>
        <Text className="text-xs text-content-faint text-center mt-1.5 leading-relaxed max-w-[260px]">
          {unreachable
            ? 'Diaspora could not be reached just now, so we cannot say whether this landlord is still listed. Check your connection and try again.'
            : 'The profile may have been closed. Any homes they listed are no longer shown either.'}
        </Text>
        {unreachable ? (
          <Button label="Try again" className="mt-6 w-full" onPress={retry} />
        ) : null}
        <Button
          label="Go back"
          variant={unreachable ? 'outline' : 'primary'}
          className="mt-3 w-full"
          onPress={() => backOr()}
        />
      </SafeAreaView>
    );
  }

  const kind = landlordKindLabel(landlord.kind);
  const responded = landlordResponseLabel(landlord.responseRate);
  const joined = memberSinceLabel(landlord.memberSince);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Landlord" showBack />

      <ScrollEndScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="bg-surface-card px-6 py-6 border-b border-subtle shadow-sm items-center">
          <View className="w-20 h-20 rounded-full bg-surface-muted items-center justify-center mb-3 border-2 border-primary-500">
            <Text className="text-3xl font-extrabold text-primary-500">
              {landlord.name.substring(0, 1).toUpperCase()}
            </Text>
          </View>

          <Text className="text-xl font-black text-content-primary mb-1 text-center">
            {landlord.name}
          </Text>

          {landlord.legalName ? (
            <Text className="text-xs text-content-muted mb-2 text-center">{landlord.legalName}</Text>
          ) : null}

          <View className="flex-row items-center flex-wrap justify-center gap-2 mb-3">
            {/* The tick is the platform's own `trust.isVerified`; the wording
                beside it is printed only where Trust sent one. A default badge
                would be this screen deciding what the platform verified. */}
            {landlord.isVerified ? (
              <View className="bg-surface-muted px-2 py-0.5 rounded border border-subtle">
                <Text className="text-[9px] font-black text-success-default uppercase">✓ VERIFIED</Text>
              </View>
            ) : null}
            {landlord.badge ? (
              <Text className="text-[9px] font-black text-content-muted uppercase bg-surface-background border border-subtle px-2 py-0.5 rounded">
                {landlord.badge}
              </Text>
            ) : null}
            {kind ? (
              <Text className="text-xs text-content-muted font-bold bg-surface-background border border-subtle px-2.5 py-0.5 rounded-full">
                {kind}
              </Text>
            ) : null}
          </View>

          {/* Each line is printed only where the platform measured it. The
              screen this replaced printed "Tenure: undefined Years on Platform"
              and a follower count nothing sends. */}
          {joined ? (
            <Text className="text-[11px] text-content-faint font-extrabold uppercase tracking-wider mb-1">
              {joined}
            </Text>
          ) : null}
          {responded ? (
            <Text className="text-[11px] text-content-muted font-semibold mb-1">{responded}</Text>
          ) : null}
          {landlord.completedLets > 0 ? (
            <Text className="text-[11px] text-content-muted font-semibold mb-1">
              {landlord.completedLets} completed let{landlord.completedLets === 1 ? '' : 's'}
            </Text>
          ) : null}

          {landlord.bio ? (
            <Text className="text-sm text-content-tertiary text-center leading-relaxed max-w-[280px] mt-3">
              {landlord.bio}
            </Text>
          ) : null}
        </View>

        {/* Only the channels this landlord published. A profile read is not a
            viewing, so the platform withholds a telephone number until one is
            booked — and an empty row is better than a dead button. */}
        {landlord.ownerUserId || landlord.phoneNumber || landlord.email || landlord.websiteUrl ? (
          <View className="bg-surface-card p-6 mt-3 border-y border-subtle">
            <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">
              Get in touch
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {landlord.ownerUserId ? (
                <TouchableOpacity
                  onPress={handleMessage}
                  accessibilityRole="button"
                  className="flex-1 min-w-[120px] py-3 rounded-xl items-center active:opacity-85"
                  style={{ backgroundColor: '#F59300' }}
                >
                  <Text className="text-xs font-black text-white">💬 Message</Text>
                </TouchableOpacity>
              ) : null}
              {landlord.phoneNumber ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${landlord.phoneNumber}`)}
                  accessibilityRole="button"
                  className="flex-1 min-w-[120px] bg-surface-background border border-subtle py-3 rounded-xl items-center active:bg-surface-muted"
                >
                  <Text className="text-xs font-bold text-content-secondary">📞 Call</Text>
                </TouchableOpacity>
              ) : null}
              {landlord.email ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${landlord.email}`)}
                  accessibilityRole="button"
                  className="flex-1 min-w-[120px] bg-surface-background border border-subtle py-3 rounded-xl items-center active:bg-surface-muted"
                >
                  <Text className="text-xs font-bold text-content-secondary">✉️ Email</Text>
                </TouchableOpacity>
              ) : null}
              {landlord.websiteUrl ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(landlord.websiteUrl as string)}
                  accessibilityRole="button"
                  className="flex-1 min-w-[120px] bg-surface-background border border-subtle py-3 rounded-xl items-center active:bg-surface-muted"
                >
                  <Text className="text-xs font-bold text-content-secondary">🌐 Website</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="p-6 mb-10 mt-3 bg-surface-card border-y border-subtle">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-4">
            Homes from {landlord.name}
          </Text>

          {homes.length > 0 ? (
            homes.map((home) => <HousingCard key={home.id} listing={home} />)
          ) : homesFailed ? (
            <View className="items-center py-8">
              <Text className="text-xs text-content-muted font-bold text-center">
                We could not load their homes just now.
              </Text>
              <Button label="Try again" variant="outline" className="mt-4" onPress={retry} />
            </View>
          ) : (
            <View className="items-center py-8">
              <Text className="text-xs text-content-muted font-bold">No homes listed just now.</Text>
            </View>
          )}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
