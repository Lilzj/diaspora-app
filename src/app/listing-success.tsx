import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useBottomInset } from '@/components/layout/bottom-inset';

const CONFETTI_COUNT = 35;

/**
 * Why a listing is saved but not visible, in a sentence the member can act on.
 *
 * Three reasons rather than one, because the remedies differ completely: a
 * listing missing a required field is the member's to finish, a refused one is
 * not something to retry, and an unknown failure is worth trying again. "Could
 * not publish" would collapse all three into a dead end.
 */
function reasonSentence(reason: string | undefined): string {
  switch (reason) {
    case 'incomplete':
      return 'Your listing is saved, but it needs a little more before it can go live. Open it to see what is missing.';
    case 'refused':
      return 'Your listing is saved but has not been made public. Our team will be in touch — there is nothing you need to do right now.';
    default:
      return 'Your listing is saved, but we could not make it public just now. Nothing is lost — open it and try publishing again.';
  }
}

/** The steps `createAndPublishProvider` runs after creation, in member's words. */
const STEP_LABELS: Record<string, string> = {
  photos: 'your photos',
  services: 'your services and menu',
  hours: 'your opening hours',
};

export default function ListingSuccessScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  // ── What actually happened (UAT-002) ──────────────────────────────────────
  //
  // This screen used to say "Listing Published! Your business is now live on
  // Diaspora" unconditionally, because the only thing that reached it was
  // `router.push('/listing-success')` from a handler that made no network call.
  //
  // `POST /providers` creates a **draft**; publishing is a separate `PUT
  // .../status`. So there are two real outcomes and they must read differently.
  // Anything that arrives here without saying which is treated as the *weaker*
  // claim — a screen that guesses should guess downwards.
  const params = useLocalSearchParams<{
    providerId?: string;
    published?: string;
    reason?: string;
    incomplete?: string;
  }>();

  const isPublished = params.published === '1';
  const incompleteSteps = (params.incomplete ?? '')
    .split(',')
    .map((step) => step.trim())
    .filter((step) => step in STEP_LABELS);

  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }).map((_, i) => ({
      id: i,
      x: Math.random() * 320,
      y: new Animated.Value(-40),
      color: ['#F59300', '#FFA600', '#2563EB', '#10B981', '#EC4899', '#8B5CF6'][i % 6],
      size: Math.random() * 8 + 6,
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    // Only for a listing that actually went live. Confetti over "saved as a
    // draft, we could not publish it" is the same misread the old screen made,
    // in a form no copy change can correct.
    if (!isPublished) return;

    // Trigger confetti physics
    const animations = particles.map((p) => {
      const delay = Math.random() * 600;
      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(p.y, {
            toValue: 600,
            duration: Math.random() * 1500 + 1200,
            useNativeDriver: true,
          }),
          Animated.timing(p.rotate, {
            toValue: 360,
            duration: Math.random() * 1500 + 1200,
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: Math.random() * 500 + 1800,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.parallel(animations).start();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-card px-6 justify-between relative">
      {/* Confetti canvas overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p) => (
          <Animated.View
            key={p.id}
            style={{
              position: 'absolute',
              top: 0,
              left: p.x,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.id % 2 === 0 ? p.size / 2 : 2,
              opacity: p.opacity,
              transform: [
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            }}
          />
        ))}
      </View>

      {/* Top Graphic Celebrations */}
      {/* A plain ScrollView (13 Oct 2026). The scroll-end navigation bar drew
          itself at the bottom of this scroll area, which ends above the two
          buttons below it, so it surfaced mid-screen. The page has its own way
          out ("Back to Diaspora"). */}
      <ScrollView className="flex-1 mt-6" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="items-center mb-6">
          <View className="w-24 h-24 rounded-full bg-surface-muted items-center justify-center mb-5 border border-success-default/15 shadow-md shadow-success-default/5">
            <Text className="text-5xl">{isPublished ? '🎉' : '📄'}</Text>
          </View>

          <Text className="text-2xl font-extrabold text-content-primary text-center mb-2 tracking-tight">
            {isPublished ? 'Listing published' : 'Listing saved as a draft'}
          </Text>
          <Text className="text-sm text-content-muted text-center leading-relaxed max-w-[300px]">
            {isPublished
              ? 'Your business is now live on Diaspora. Members in your city can find it in Discover.'
              : reasonSentence(params.reason)}
          </Text>

          {/* Named individually, because "something went wrong" leaves a member
              with a listing they cannot see the gaps in. */}
          {incompleteSteps.length > 0 ? (
            <View className="mt-4 bg-surface-muted border border-warning-default/20 rounded-2xl px-4 py-3 w-full">
              <Text className="text-xs font-bold text-warning-default uppercase tracking-widest mb-1">
                Not saved yet
              </Text>
              <Text className="text-xs text-content-strong leading-relaxed">
                We could not save {incompleteSteps.map((step) => STEP_LABELS[step]).join(' or ')}.
                Everything else was saved — open your listing to add {incompleteSteps.length > 1 ? 'them' : 'it'} again.
              </Text>
            </View>
          ) : null}
        </View>

        {/* The block that stood here read "Profile 75% Completed" over a
            circular progress ring drawn at 75%, on every listing, for every
            member — a hardcoded string and a hardcoded `strokeDashoffset`. It
            was not read from the member's profile, and there is no client today
            that computes a completion score. A figure nobody calculated is worse
            than no figure: it is the one number on this screen a member would
            act on. The verification prompt it wrapped survives below, which is
            what it was really for. */}

        {/* Suggested Next Action modules */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
          Suggested Next Steps
        </Text>

        <NextStepCard
          title="Verify your business identity"
          description="Submit standard registration forms or Gov ID to earn the Verified badge."
          actionLabel="Verify Identity"
          icon="🛡️"
          onPress={() => router.push('/verification/country')}
        />

        <NextStepCard
          title="Complete remaining listing data"
          description="Add email addresses, social accounts, and additional photos to improve conversion."
          actionLabel="Edit Listing"
          icon="⚙️"
          onPress={() => router.replace('/(tabs)')}
        />

        <NextStepCard
          title="Share with your network"
          description="Promote your new listing URL to friends and communities to get helpful reviews."
          actionLabel="Share Link"
          icon="🔗"
          onPress={() => {}}
        />

        <View className="h-6" />
      </ScrollView>

      {/* Exit Buttons Action Group

          Both of these used to be `router.replace('/(tabs)')`, so "View My Live
          Listing" put the member on the Home tab — which, for an unverified
          member, is the verification gate. They had been told their business was
          live, tapped the button offered to go and look at it, and landed on a
          screen about something else. There was no listing to open.

          There is one now, and its id came back from the server. */}
      <View className="py-6 border-t border-faint bg-surface-card">
        <Button
          label={isPublished ? 'View my listing' : 'Open my draft'}
          onPress={() => {
            if (params.providerId) {
              router.replace(`/provider/${params.providerId}`);
              return;
            }

            // No id means the caller did not come through the wizard — a deep
            // link, or a stale route. Sending them to a provider page that does
            // not exist would be the old defect wearing a new coat.
            router.replace('/(tabs)');
          }}
        />
        <Button
          label="Back to Diaspora"
          variant="outline"
          className="mt-3"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}

// Next Action Step Card UI Component
function NextStepCard({
  title,
  description,
  actionLabel,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="bg-surface-card border border-subtle rounded-2xl p-4 flex-row items-start mb-3"
    >
      <Text className="text-2xl mr-3">{icon}</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-content-strong">{title}</Text>
        <Text className="text-xs text-content-muted mt-1 leading-relaxed">{description}</Text>
        <Text className="text-xs font-bold text-primary-500 mt-2.5 uppercase tracking-wider">{actionLabel} →</Text>
      </View>
    </TouchableOpacity>
  );
}
