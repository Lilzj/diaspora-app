// ── Where this screen's data goes ────────────────────────────────────────────
//
// `GET` / `POST /api/v1/location/me/countries`.
//
// **Nothing in this app could record a move.** The Trust Centre drew a Country
// Experience timeline, and the verification flow could add a country to it, but
// no screen could close one. A member who left Mauritius for the UK stayed a
// current, verified resident of Mauritius, and their timeline went on saying
// "2019 – Present" about a country they had not lived in for a year.
//
// Closing a residence here reaches Trust on its own: Location publishes a
// departure, Trust closes the standing. What that costs the member is nothing.
// The verification stays, the badge stays, every point earned stays. The only
// thing that stops is the residence clock behind the guide programme's
// three-year requirement, which is the honest reading of somebody who no longer
// lives there.
//
// **Seeing another country does not wait on any of this.** Country audiences
// match on where a member says they live *or* where Trust has verified them, so
// declaring a new home opens that community immediately. Verifying it is what
// earns standing in it, and that is `/verification/country`.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { DatePickerInput } from '@/components/DatePickerInput';
import { useNotification } from '@/providers/notification-provider';
import { useResidenceEditor, useResidenceTimeline } from '@/hooks/residence';
import { toIsoDay, type ResidenceWire } from '@/lib/location/residence';
import { allCountries } from '@/mocks/countries';
import { clearSightings, dismissSuggestion, suggestRelocation } from '@/lib/location/relocation-hint';

type Mode = 'idle' | 'moving' | 'adding' | 'leaving';

export default function ResidenceScreen() {
  const { showAlert } = useNotification();
  const { residences, openResidences, isLoading, error, refresh } = useResidenceTimeline();
  const editor = useResidenceEditor();

  const [mode, setMode] = useState<Mode>('idle');
  const [leavingCode, setLeavingCode] = useState<string | null>(null);
  const [arrivingCode, setArrivingCode] = useState('');
  const [movedOn, setMovedOn] = useState(toIsoDay(new Date()));
  const [countryQuery, setCountryQuery] = useState('');
  const [hinted, setHinted] = useState<string | null>(null);

  const leaving = useMemo(
    () => openResidences.find((residence) => residence.countryCode === leavingCode) ?? null,
    [openResidences, leavingCode]
  );

  /**
   * Only countries the member is *currently* in are excluded, not every country
   * on their timeline. Moving back somewhere you used to live is an ordinary
   * thing to do, and the server handles it: declaring a closed residence again
   * reopens it, and re-verifying clears the departure date so the residence
   * clock resumes instead of staying frozen at the year they left.
   */
  const countryMatches = useMemo(() => {
    const needle = countryQuery.trim().toLowerCase();
    const livesThereNow = new Set(openResidences.map((residence) => residence.countryCode));

    return allCountries
      .filter((country) => !livesThereNow.has(country.code))
      .filter((country) => needle.length === 0 || country.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [countryQuery, openResidences]);

  /**
   * The quiet half of relocation.
   *
   * Off unless the build turns it on, and even then it only ever asks. Nothing
   * here writes, closes a standing or starts a verification — travel and
   * relocation look identical for the first several weeks, and the only thing
   * that can tell them apart is the member.
   */
  useEffect(() => {
    let live = true;

    void suggestRelocation(openResidences.map((residence) => residence.countryCode)).then(
      (suggestion) => {
        if (live) setHinted(suggestion);
      }
    );

    return () => {
      live = false;
    };
  }, [openResidences]);

  const reset = () => {
    setMode('idle');
    setLeavingCode(null);
    setArrivingCode('');
    setCountryQuery('');
    setMovedOn(toIsoDay(new Date()));
  };

  const handleMove = async () => {
    if (!arrivingCode) {
      showAlert({
        type: 'error',
        title: 'Choose where you moved to',
        message: 'Pick the country from the list so we open the right community.',
      });
      return;
    }

    // A move that predates the arrival it closes is not a move, and the server
    // refuses the period outright. Caught here so the member gets a sentence.
    if (leaving && movedOn < leaving.arrivedOn) {
      showAlert({
        type: 'error',
        title: 'Check the date',
        message: `You arrived in ${leaving.countryName} on ${leaving.arrivedOn}, so you cannot have left before then.`,
      });
      return;
    }

    try {
      if (leaving) {
        await editor.move({
          leaving: {
            countryCode: leaving.countryCode,
            arrivedOn: leaving.arrivedOn,
            role: leaving.role,
          },
          departedOn: movedOn,
          arriving: { countryCode: arrivingCode, arrivedOn: movedOn },
        });
      } else {
        await editor.declare({ countryCode: arrivingCode, arrivedOn: movedOn });
      }

      const name = allCountries.find((country) => country.code === arrivingCode)?.name ?? arrivingCode;

      showAlert({
        type: 'success',
        title: `Welcome to ${name}`,
        message: leaving
          ? `Your ${leaving.countryName} standing keeps every point you earned there. Verify your new residency to start building one here.`
          : 'Verify your residency to start building standing in this community.',
      });

      await clearSightings();
      setHinted(null);
      reset();
    } catch (cause) {
      showAlert({
        type: 'error',
        title: 'That did not save',
        message: (cause as { message?: string })?.message ?? 'Please try again.',
      });
    }
  };

  /**
   * Leaving without saying where you went.
   *
   * A move is two facts and a member often only has one of them on the day —
   * between countries, or not settled yet. Forcing them to name a destination to
   * record a departure would mean naming one they have not moved to.
   *
   * It asks for the date rather than assuming today, because people record their
   * lives late. Somebody who left in June and opens this in September would
   * otherwise be given three months of residence they did not have, in the one
   * number the guide programme's duration gate reads.
   */
  const handleLeave = async () => {
    if (!leaving) return;

    if (movedOn < leaving.arrivedOn) {
      showAlert({
        type: 'error',
        title: 'Check the date',
        message: `You arrived in ${leaving.countryName} on ${leaving.arrivedOn}, so you cannot have left before then.`,
      });
      return;
    }

    try {
      await editor.leave(leaving, movedOn);

      showAlert({
        type: 'success',
        title: `${leaving.countryName} closed`,
        message: 'Every point you earned there stays yours. Add your new country when you have one.',
      });

      reset();
    } catch (cause) {
      showAlert({
        type: 'error',
        title: 'That did not save',
        message: (cause as { message?: string })?.message ?? 'Please try again.',
      });
    }
  };

  /**
   * Removing is not leaving, and the copy has to say so.
   *
   * Leaving records a fact about the member's life. Removing says the country
   * should never have been listed — and on the server it does not touch a
   * verification Trust has already granted, so a member who removes a residence
   * they proved has not unproved it.
   */
  const handleRemove = (residence: ResidenceWire) => {
    showAlert({
      type: 'warning',
      title: `Remove ${residence.countryName}?`,
      message:
        'This takes the country off your timeline entirely. If you lived there and have since left, use "Mark as left" instead — that keeps the history.',
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void editor.withdraw(residence.countryCode).catch((cause: unknown) => {
              showAlert({
                type: 'error',
                title: 'That did not save',
                message: (cause as { message?: string })?.message ?? 'Please try again.',
              });
            });
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-card">
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4" accessibilityLabel="Go back">
          <Text className="text-xl text-content-tertiary">←</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-black text-content-primary tracking-tight">Where you live</Text>
      </View>

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View className="py-10 items-center" accessibilityLabel="Loading your residence history">
            <ActivityIndicator />
          </View>
        )}

        {error !== null && (
          <View className="bg-surface-sunken border border-subtle rounded-2xl p-4">
            <Text className="text-sm text-content-secondary leading-relaxed">{error}</Text>
            <TouchableOpacity onPress={refresh} className="mt-3">
              <Text className="text-sm font-extrabold text-primary-500">Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && error === null && (
          <>
            {/*
              A line, not a modal, and it appears only after a month of
              consistent readings. A member on a three-week trip home never sees
              it; a member who actually moved sees it once and can make it go
              away for six months by saying no.
            */}
            {hinted !== null && (
              <View className="bg-primary-50 border border-primary-200 rounded-3xl p-5">
                <Text className="text-sm font-extrabold text-content-primary">
                  Living in {allCountries.find((country) => country.code === hinted)?.name ?? hinted} now?
                </Text>
                <Text className="text-xs text-content-secondary leading-relaxed mt-1">
                  Your phone has been there for a while. Adding it opens that community —
                  nothing changes until you do.
                </Text>

                <View className="flex-row gap-4 mt-3">
                  <TouchableOpacity
                    onPress={() => {
                      setMode('moving');
                      setLeavingCode(openResidences[0]?.countryCode ?? null);
                      setArrivingCode(hinted);
                      setCountryQuery(
                        allCountries.find((country) => country.code === hinted)?.name ?? ''
                      );
                    }}
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-extrabold text-primary-600">Yes, I moved</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      void dismissSuggestion(hinted);
                      setHinted(null);
                    }}
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-bold text-content-muted">No, just visiting</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm">
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">
                Your countries
              </Text>

              {residences.length === 0 && (
                <Text className="text-xs text-content-muted leading-relaxed">
                  You have not added a country yet. Add where you live to see its community.
                </Text>
              )}

              <View className="gap-4">
                {residences.map((residence) => (
                  <ResidenceRow
                    key={residence.countryCode}
                    residence={residence}
                    busy={editor.isPending}
                    onLeave={() => {
                      setMode('leaving');
                      setLeavingCode(residence.countryCode);
                      setMovedOn(toIsoDay(new Date()));
                    }}
                    onRemove={() => handleRemove(residence)}
                  />
                ))}
              </View>
            </View>

            {mode === 'idle' && (
              <View className="gap-3">
                <TouchableOpacity
                  onPress={() => {
                    setMode('moving');
                    setLeavingCode(openResidences[0]?.countryCode ?? null);
                  }}
                  className="bg-primary-500 rounded-2xl py-4 items-center"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-extrabold text-white">I have moved country</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setMode('adding');
                    setLeavingCode(null);
                  }}
                  className="border border-subtle rounded-2xl py-4 items-center"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-extrabold text-content-secondary">
                    Add another country I live in
                  </Text>
                </TouchableOpacity>

                <Text className="text-[11px] text-content-muted leading-relaxed px-1">
                  Living in two places is fine — add both. Leaving a country never costs you the
                  standing you built there.
                </Text>
              </View>
            )}

            {mode !== 'idle' && (
              <View className="bg-surface-card border border-subtle rounded-3xl p-5 shadow-sm gap-4">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest">
                  {mode === 'moving'
                    ? 'Record a move'
                    : mode === 'leaving'
                      ? `Leaving ${leaving?.countryName ?? 'this country'}`
                      : 'Add a country'}
                </Text>

                {mode === 'moving' && openResidences.length > 0 && (
                  <View className="gap-2">
                    <Text className="text-xs font-bold text-content-secondary">Moving from</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {openResidences.map((residence) => (
                        <TouchableOpacity
                          key={residence.countryCode}
                          onPress={() => setLeavingCode(residence.countryCode)}
                          className={`px-3 py-2 rounded-xl border ${
                            leavingCode === residence.countryCode
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-subtle'
                          }`}
                          accessibilityRole="button"
                        >
                          <Text className="text-xs font-bold text-content-primary">
                            {residence.flag} {residence.countryName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {mode === 'moving' && openResidences.length === 0 && (
                  <Text className="text-xs text-content-muted leading-relaxed">
                    None of your countries is open, so there is nothing to move out of. Adding the
                    new one is enough.
                  </Text>
                )}

                {mode !== 'leaving' && (
                <View className="gap-2">
                  <Text className="text-xs font-bold text-content-secondary">
                    {mode === 'moving' ? 'Moving to' : 'Country'}
                  </Text>

                  <View className="flex-row flex-wrap gap-2">
                    {countryMatches.map((country) => (
                      <TouchableOpacity
                        key={country.code}
                        onPress={() => {
                          setArrivingCode(country.code);
                          setCountryQuery(country.name);
                        }}
                        className={`px-3 py-2 rounded-xl border ${
                          arrivingCode === country.code
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-subtle'
                        }`}
                        accessibilityRole="button"
                      >
                        <Text className="text-xs font-bold text-content-primary">
                          {country.flag} {country.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                )}

                <DatePickerInput
                  label={
                    mode === 'moving'
                      ? 'Date you moved'
                      : mode === 'leaving'
                        ? 'Date you left'
                        : 'Date you arrived'
                  }
                  value={movedOn}
                  onChangeDate={setMovedOn}
                />

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={reset}
                    className="flex-1 border border-subtle rounded-2xl py-4 items-center"
                    accessibilityRole="button"
                  >
                    <Text className="text-sm font-extrabold text-content-secondary">Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={mode === 'leaving' ? handleLeave : handleMove}
                    disabled={editor.isPending}
                    className={`flex-1 rounded-2xl py-4 items-center ${
                      editor.isPending ? 'bg-primary-300' : 'bg-primary-500'
                    }`}
                    accessibilityRole="button"
                  >
                    <Text className="text-sm font-extrabold text-white">
                      {editor.isPending ? 'Saving…' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/**
 * One country.
 *
 * `verificationState` rather than the bare `isVerified`, so a member waiting on
 * a reviewer is told they are waiting rather than shown an unverified row.
 */
function ResidenceRow({
  residence,
  busy,
  onLeave,
  onRemove,
}: {
  residence: ResidenceWire;
  busy: boolean;
  onLeave: () => void;
  onRemove: () => void;
}) {
  const period = residence.isCurrentResidence
    ? `${residence.startYear} – Present`
    : `${residence.startYear} – ${residence.endYear ?? '?'}`;

  const standing =
    residence.verificationState === 'Verified'
      ? 'Verified resident'
      : residence.verificationState === 'UnderReview'
        ? 'Verification under review'
        : 'Not verified yet';

  return (
    <View className="border-b border-faint pb-3 last:border-b-0 last:pb-0">
      <View className="flex-row justify-between items-start">
        <View className="flex-row items-center flex-1">
          <Text className="text-xl mr-3">{residence.flag}</Text>
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-content-primary">
              {residence.countryName}
            </Text>
            <Text className="text-[10px] text-content-muted mt-0.5">
              {period} · {standing}
            </Text>
          </View>
        </View>

        {!residence.isVerified && residence.isCurrentResidence && (
          <TouchableOpacity
            onPress={() => router.push('/verification/country')}
            accessibilityRole="button"
          >
            <Text className="text-[11px] font-extrabold text-primary-500">Verify</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row gap-4 mt-2 ml-9">
        {residence.isCurrentResidence && (
          <TouchableOpacity onPress={onLeave} disabled={busy} accessibilityRole="button">
            <Text className="text-[11px] font-bold text-content-muted">Mark as left</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onRemove} disabled={busy} accessibilityRole="button">
          <Text className="text-[11px] font-bold text-content-muted">Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
