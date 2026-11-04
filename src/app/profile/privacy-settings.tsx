// ─────────────────────────────────────────────────────────────────────────────
// Privacy — six controls that protected nothing
//
// This screen offered profile visibility (Public / Members / Private), GPS
// precision (Exact / Neighbourhood), and four switches: phone number
// visibility, online status, whether members may follow you, and whether your
// verification badges show. "Save Changes" wrote all six into
// `store/trust.ts`'s `privacySettings` and called `backOr()`.
//
// **Nothing read them.** `privacySettings` had exactly one reader in the whole
// app — this screen, loading its own initial state. No request was made, no
// preference reached the server, and no behaviour anywhere in Diaspora changed.
// A member who set their profile to Private and their phone number to hidden
// had done nothing at all, and had been shown a confirmation and returned to
// the previous screen as though they had.
//
// That makes this the most dangerous inert control in the sweep after the rent
// estimator, because the others waste effort and this one misdirects a safety
// decision. Somebody avoiding an ex-partner, an employer, or an immigration
// enforcement risk could set every switch here and believe they were harder to
// find. They were exactly as findable as before.
//
// ── Why there is nothing to wire it to ───────────────────────────────────────
//
// The capability does not exist anywhere in the platform. Not partially — at
// all. `ProfileVisibility`, `PhoneVisibility`, `LocationPrecision`,
// `ActivityVisibility`, `AllowFollowers` and `VerificationVisibility` return
// **zero hits across every `.cs` file in the backend**. The Trust module maps
// 27 routes and contains no `MapPut` or `MapPatch` whatsoever. Identity's
// `PUT /auth/profile` binds seven fields — name, nationality, country of
// residence, language, time zone, email, avatar — and no privacy field among
// them. The backend's own documentation says it plainly: *"`locationPrecision`
// is the frontend's, and no backend module owns it yet."*
//
// Two routes were considered and rejected as destinations:
//
//   * `PUT /location/me/preferences` carries a `CoordinatePrecision` of
//     `Exact` | `Approximate`, which looks like an exact match for the GPS
//     control. It is not: it governs how this member's coordinates are used for
//     *search* — radius, distance units, preferred area — and the backend
//     explicitly disclaims owning the privacy setting of the same name. Wiring
//     a privacy toggle to a search preference would mean telling a member their
//     location was coarsened when only their own search results had changed.
//     That is a worse lie than the one being removed, because it would be
//     backed by a real 200 response.
//   * `PUT /recommendations/preferences` has `shareActivitySignals`, which is
//     personalization consent — whether the recommender learns from you — not
//     whether other members can see your activity.
//
// Neither is this screen's subject, and neither has a client in this app yet.
//
// ── What the screen is now ───────────────────────────────────────────────────
//
// A disclosure rather than a form. It states what Diaspora does and does not
// currently protect, so that a member can make their decisions with the real
// facts — including the decision not to put a phone number on the platform in
// the first place, which is the only control that actually works today.
//
// The controls were removed rather than relabelled "not saved". A privacy
// switch that visibly moves invites the belief that it did something, however
// it is captioned, and this is not a subject where a caption should have to
// carry that weight.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { backOr } from '@/lib/navigation';

/** One plain statement of fact about what is visible today. */
function Fact({ title, detail }: { title: string; detail: string }) {
  return (
    <View className="py-3 border-b border-faint">
      <Text className="text-xs font-extrabold text-content-strong">{title}</Text>
      <Text className="text-[11px] text-content-muted mt-1 leading-relaxed">{detail}</Text>
    </View>
  );
}

export default function PrivacySettingsScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Privacy" />

      <ScrollEndScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>

        <View className="bg-surface-muted border border-subtle rounded-3xl p-5 mb-5">
          <Text className="text-sm font-black text-content-strong mb-2">
            Diaspora has no visibility controls yet
          </Text>
          <Text className="text-[11px] text-content-secondary leading-relaxed">
            This screen used to offer settings for who can see your profile, your phone number, your location and your activity. None of them were ever sent anywhere or changed anything, so they have been removed rather than left to give false reassurance. What you can control is below, and it is real.
          </Text>
        </View>

        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-5">
          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">
            What other members can see today
          </Text>

          <Fact
            title="Your profile"
            detail="Visible to anyone using Diaspora — your display name, avatar, country verifications, badges and the content you have published. It cannot currently be limited or hidden."
          />
          <Fact
            title="Contact details you enter on a listing"
            detail="The phone number and email you type into a housing, job or marketplace listing are part of that listing and are shown with it. Leave a field blank if you do not want it seen — that is the only way to withhold it."
          />
          <Fact
            title="Your location"
            detail="Listings you post carry the city and area you enter, and appear in distance-based search. Diaspora cannot currently show a coarser location than the one you type in."
          />
          <Fact
            title="Followers"
            detail="Members can follow you, and following cannot currently be switched off."
          />
        </View>

        <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm mb-5">
          <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">
            What you can control
          </Text>
          <Text className="text-[11px] text-content-muted leading-relaxed mb-4">
            These three are real and reach the server. Everything above is a description of current behaviour, not a setting.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/settings/notifications')}
            className="bg-primary-500 py-3 rounded-2xl items-center justify-center"
          >
            <Text className="text-white font-black text-xs uppercase tracking-wider">
              Notification settings
            </Text>
          </TouchableOpacity>

          {/*
            The two subject rights, on the screen a member reaches by looking for "privacy".
            They are also in Settings under "Your data" — deliberately in both places, because
            somebody looking for how to leave will look under Privacy, and somebody looking for
            their data will look under Settings, and neither should have to guess.
          */}
          <TouchableOpacity
            onPress={() => router.push('/settings/data-export')}
            accessibilityRole="button"
            accessibilityLabel="Download my data"
            className="bg-surface-muted py-3 rounded-2xl items-center justify-center mt-3"
          >
            <Text className="text-content-primary font-black text-xs uppercase tracking-wider">
              Download my data
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/settings/delete-account')}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            className="border border-error-default py-3 rounded-2xl items-center justify-center mt-3"
          >
            <Text className="text-error-default font-black text-xs uppercase tracking-wider">
              Delete my account
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-[11px] text-content-faint leading-relaxed mb-10 px-1">
          If you need something hidden that you cannot hide here, contact support before posting it. Diaspora would rather tell you what it cannot do than let you find out afterwards.
        </Text>

      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
