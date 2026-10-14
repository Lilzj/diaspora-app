// ─────────────────────────────────────────────────────────────────────────────
// Offer something to swap — rebuilt 15 Sep 2026
//
// This screen used to post a body the server could not bind, under a made-up
// seller ("Amara Kone", a 4.8 rating), and then say "Swap Listed!" whatever came
// back. It now lists a real swap as the signed-in member, through the same
// create-then-publish sequence as any listing, and says what actually happened:
// published, saved as a draft (with the server's reason), or not saved.
//
// What a swap is on the platform, and why a photograph and a "wants" line are
// required, is in `lib/swap-listings.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import { countryLabel } from '@/lib/job-detail-api';
import { currencyForCountry } from '@/lib/job-postings-api';
import {
  createAndPublishMarketplaceListing,
  problemDetail,
} from '@/lib/marketplace-listings-api';
import {
  buildSwapListingRequest,
  parseTopUp,
  swapStepProblem,
  swapStepRequirements,
  type SwapDraft,
  type SwapStep,
} from '@/lib/swap-listings';
import type { SwapTopUp } from '@/types/marketplace';
import { TradeSafetyNote } from '@/components/safety/TradeSafetyNote';
import { CurrencyNote } from '@/components/CurrencyNote';
import { currencyForResidence } from '@/lib/member-currency';
import { useMarketplaceCategories } from '@/hooks/marketplace-categories';
import { draftCategoryKey, marketplaceCategoryEmoji } from '@/lib/marketplace-categories';

const CONDITIONS = ['New', 'Like New', 'Very Good', 'Good', 'Fair'];

const STEPS: { key: SwapStep | 'preview'; title: string }[] = [
  { key: 'offering', title: "What you're offering" },
  { key: 'wants', title: 'What you want back' },
  { key: 'place', title: 'Where it is' },
  { key: 'preview', title: 'Check and publish' },
];

const TOP_UPS: { value: SwapTopUp; label: string }[] = [
  { value: 'None', label: 'No money' },
  { value: 'SellerAdds', label: 'I add money' },
  { value: 'BuyerAdds', label: 'They add money' },
];

export default function SwapCreateScreen() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();

  // Whether this member may list, as the Marketplace service itself says — the
  // same `marketplace.listings.create` feature the sale screen asks for.
  const access = useAuthStore((state) => state.access);
  const maySell = access ? access.grantedFeatures.includes('marketplace.listings.create') : null;
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);
  const memberName = useAuthStore((state) => state.user?.fullName);

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [draft, setDraft] = useState<SwapDraft>({
    title: '',
    description: '',
    categoryId: null,
    condition: 'Good',
    photoMediaId: null,
    wants: '',
    topUp: 'None',
    topUpAmount: '',
    currency: currencyForCountry(residenceCountry),
    countryCode: residenceCountry ?? '',
    cityName: '',
    neighbourhood: '',
  });

  // The session can restore after the first render; prefill once it does.
  useEffect(() => {
    if (!residenceCountry) return;
    setDraft((current) =>
      current.countryCode
        ? current
        : { ...current, countryCode: residenceCountry, currency: currencyForCountry(residenceCountry) }
    );
  }, [residenceCountry]);

  const update = (patch: Partial<SwapDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const current = STEPS[step];
  const problem = current.key === 'preview' ? null : swapStepProblem(current.key, draft);

  /**
   * What this step is waiting for, by name.
   *
   * <p>
   * <b>`problem` was already computed here, during render, and then ignored
   * until the member tapped.</b> The screen knew the step could not go forward
   * and drew a live Continue button anyway, so the only way to learn what was
   * missing was to tap it and read an alert — having, on the first step, four
   * fields it could have been. Both come from `swapStepRequirements`, so the
   * name in "Still needed" and the sentence in `problem` cannot disagree.
   * </p>
   */
  const requiredByStep =
    current.key === 'preview' ? [] : swapStepRequirements(current.key, draft);

  const stillNeeded = requiredByStep
    .filter((requirement) => !requirement.ok)
    .map((requirement) => requirement.label);
  // The served taxonomy (13 Oct 2026); the fixture's "Baby" was a key the server lacked.
  const categoryCatalogue = useMarketplaceCategories();
  const category = categoryCatalogue.find(draftCategoryKey(draft.categoryId));
  const topUpAmount = parseTopUp(draft.topUpAmount);

  const handleNext = () => {
    if (problem) {
      showAlert({ type: 'error', title: 'Not ready yet', message: problem });
      return;
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const handlePublish = async () => {
    // Every step again, in case a restored or edited field broke one.
    for (const key of ['offering', 'wants', 'place'] as const) {
      const refusal = swapStepProblem(key, draft);
      if (refusal) {
        showAlert({ type: 'error', title: 'Not ready yet', message: refusal });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const outcome = await createAndPublishMarketplaceListing(buildSwapListingRequest(draft), {
        displayName: (memberName ?? '').trim() || 'Diaspora member',
        countryCode: draft.countryCode.trim().toUpperCase(),
      });

      if (outcome.kind === 'published') {
        showAlert({
          type: 'success',
          title: 'Swap listed',
          message: 'Your swap is on the Marketplace. People can message you about it.',
          buttons: [
            {
              text: 'View your swap',
              onPress: () => router.replace({ pathname: '/marketplace/[id]', params: { id: outcome.listingId } }),
            },
          ],
        });
        return;
      }

      // Saved, not visible — and the server's own sentence says what is missing.
      showAlert({
        type: 'info',
        title: 'Saved as a draft',
        message:
          outcome.detail ??
          'Your swap is saved, but it is not on the Marketplace yet. Open it to finish and publish it.',
        buttons: [
          {
            text: 'Open your swap',
            onPress: () => router.replace({ pathname: '/marketplace/[id]', params: { id: outcome.listingId } }),
          },
        ],
      });
    } catch (cause) {
      showAlert({
        type: 'error',
        title: 'Swap not saved',
        message:
          problemDetail(cause) ?? 'Your swap could not be saved. Check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (maySell === false) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Offer a swap" showBack />
        <ScrollView className="flex-1 px-6 pt-6">
          <Text className="text-lg font-black text-content-primary mb-2">Listing swaps is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Listing an item needs a verified Diaspora account. Once your account is verified, you can
            list straight away.
          </Text>
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const inputClass =
    'border border-subtle rounded-2xl px-4 py-3.5 text-sm text-content-primary bg-surface-card';
  const labelClass = 'text-xs font-extrabold text-content-secondary mb-2 uppercase tracking-wider';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Offer a swap" showBack />

      <View className="px-6 pt-3 pb-1">
        <View className="flex-row gap-1.5 mb-2">
          {STEPS.map((item, index) => (
            <View
              key={item.key}
              className={`flex-1 h-1.5 rounded-full ${index <= step ? 'bg-primary-500' : 'bg-subtle'}`}
            />
          ))}
        </View>
        <Text className="text-[10px] font-bold text-content-faint uppercase tracking-widest">
          Step {step + 1} of {STEPS.length} · {current.title}
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          className="flex-1 px-6 pt-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          {current.key === 'offering' && (
            <View>
              <Text className="text-sm text-content-muted mb-5 leading-relaxed">
                Describe the item you are offering. Be accurate about its condition.
              </Text>

              <View className="mb-4">
                <Text className={labelClass}>Item title</Text>
                <TextInput
                  value={draft.title}
                  onChangeText={(title) => update({ title })}
                  placeholder="e.g. Samsung Galaxy S21 128GB"
                  placeholderTextColor={tokens.color.text.placeholder}
                  maxLength={140}
                  accessibilityLabel="Item title"
                  className={inputClass}
                />
              </View>

              <View className="mb-4">
                <Text className={labelClass}>Description</Text>
                <TextInput
                  value={draft.description}
                  onChangeText={(description) => update({ description })}
                  placeholder="Any faults, what comes with it, why you are swapping…"
                  placeholderTextColor={tokens.color.text.placeholder}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  accessibilityLabel="Description"
                  className={inputClass}
                  style={{ minHeight: 80 }}
                />
              </View>

              <View className="mb-4">
                {/* The shared dropdown with search (14 Oct 2026). Server keys. */}
                <SearchableSelect
                  label="Category"
                  placeholder="Choose a category"
                  searchPlaceholder="Search categories"
                  options={[
                    ...categoryCatalogue.topCategories.map((item) => ({
                      key: item.key,
                      label: item.name,
                      icon: marketplaceCategoryEmoji(item.key),
                    })),
                    // A restored draft may hold a subcategory; keep it showing.
                    ...(category && category.parentKey
                      ? [{ key: category.key, label: category.name, icon: marketplaceCategoryEmoji(category.parentKey) }]
                      : []),
                  ]}
                  value={category?.key ?? null}
                  onChange={(categoryId) => update({ categoryId })}
                  isLoading={categoryCatalogue.isLoading}
                  testID="swap-category"
                />
              </View>

              <View className="mb-4">
                <Text className={labelClass}>Condition</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CONDITIONS.map((condition) => (
                    <TouchableOpacity
                      key={condition}
                      onPress={() => update({ condition })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: draft.condition === condition }}
                      className={`px-3 py-1.5 rounded-xl border ${draft.condition === condition ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'}`}
                    >
                      <Text className={`text-xs font-bold ${draft.condition === condition ? 'text-white' : 'text-content-tertiary'}`}>
                        {condition}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="mb-4">
                <ImagePickerInput
                  label="Photo of your item"
                  value={draft.photoMediaId}
                  onChangeImage={(photoMediaId) => update({ photoMediaId })}
                  aspect={[4, 3]}
                  allowCamera
                />
              </View>
            </View>
          )}

          {current.key === 'wants' && (
            <View>
              <Text className="text-sm text-content-muted mb-5 leading-relaxed">
                Say what you would take in exchange. If the two things are not worth the same, say who
                adds money and how much.
              </Text>

              <View className="mb-4">
                <Text className={labelClass}>What you want in exchange</Text>
                <TextInput
                  value={draft.wants}
                  onChangeText={(wants) => update({ wants })}
                  placeholder="e.g. An iPhone 13, or a laptop in good condition"
                  placeholderTextColor={tokens.color.text.placeholder}
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                  textAlignVertical="top"
                  accessibilityLabel="What you want in exchange"
                  className={inputClass}
                  style={{ minHeight: 70 }}
                />
              </View>

              <View className="mb-4">
                <Text className={labelClass}>Money on top</Text>
                <View className="flex-row gap-2 mb-3">
                  {TOP_UPS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => update({ topUp: option.value })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: draft.topUp === option.value }}
                      className={`flex-1 py-2.5 rounded-xl border items-center ${draft.topUp === option.value ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'}`}
                    >
                      <Text className={`text-xs font-bold ${draft.topUp === option.value ? 'text-white' : 'text-content-tertiary'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {draft.topUp !== 'None' && (
                  <View>
                    <TextInput
                      value={draft.topUpAmount}
                      onChangeText={(topUpAmount) => update({ topUpAmount })}
                      placeholder="Amount"
                      placeholderTextColor={tokens.color.text.placeholder}
                      keyboardType="numeric"
                      accessibilityLabel="Top-up amount"
                      className={`${inputClass} mb-2`}
                    />
                    {/* No choice since 13 Oct 2026: the top-up is in the member's own currency. */}
                    <CurrencyNote currency={currencyForResidence(residenceCountry)} />
                  </View>
                )}
              </View>
            </View>
          )}

          {current.key === 'place' && (
            <View>
              <Text className="text-sm text-content-muted mb-5 leading-relaxed">
                Where the item is, so people nearby can find it. People reply through Diaspora
                messages, so no phone number is needed.
              </Text>

              {/* No country question (14 Oct 2026): the swap is filed in the
                  member's verified country of residence, prefilled above. The
                  town comes from the one shared search of towns in it. */}
              <TownPicker
                label="Town"
                value={draft.cityName}
                onChange={(town) => update({ cityName: town.cityName })}
                testID="swap-town"
              />

              <View className="mb-4">
                <Text className={labelClass}>Area (optional)</Text>
                <TextInput
                  value={draft.neighbourhood}
                  onChangeText={(neighbourhood) => update({ neighbourhood })}
                  placeholder="e.g. Belle Rose"
                  placeholderTextColor={tokens.color.text.placeholder}
                  accessibilityLabel="Area"
                  className={inputClass}
                />
              </View>
            </View>
          )}

          {current.key === 'preview' && (
            <View>
              <Text className="text-sm text-content-muted mb-5 leading-relaxed">
                This is how your swap will read on the Marketplace.
              </Text>

              <View className="bg-surface-card border border-subtle rounded-3xl p-5 mb-4">
                <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">Swap</Text>
                <Text className="text-base font-extrabold text-content-primary mt-0.5">{draft.title.trim()}</Text>
                {draft.description.trim() ? (
                  <Text className="text-xs text-content-tertiary mt-2 leading-relaxed">{draft.description.trim()}</Text>
                ) : null}
                <View className="flex-row gap-2 mt-3 flex-wrap">
                  <View className="bg-surface-muted px-2.5 py-1 rounded-lg">
                    <Text className="text-[10px] font-bold text-content-tertiary">{category?.name ?? 'No category'}</Text>
                  </View>
                  <View className="bg-surface-muted px-2.5 py-1 rounded-lg">
                    <Text className="text-[10px] font-bold text-content-tertiary">{draft.condition}</Text>
                  </View>
                  <View className="bg-surface-muted px-2.5 py-1 rounded-lg">
                    <Text className="text-[10px] font-bold text-content-tertiary">
                      {draft.photoMediaId ? 'Photo added' : 'No photo'}
                    </Text>
                  </View>
                </View>

                <View className="border-t border-faint pt-3 mt-3">
                  <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-1">Wants in exchange</Text>
                  <Text className="text-sm font-bold text-content-strong">{draft.wants.trim()}</Text>
                  {draft.topUp !== 'None' && topUpAmount ? (
                    <Text className="text-xs font-bold text-content-muted mt-1">
                      {draft.topUp === 'SellerAdds'
                        ? `You add ${draft.currency} ${topUpAmount} on top`
                        : `You ask for ${draft.currency} ${topUpAmount} on top`}
                    </Text>
                  ) : null}
                </View>

                <View className="border-t border-faint pt-3 mt-3">
                  <Text className="text-xs text-content-muted">
                    📍 {[draft.neighbourhood.trim(), draft.cityName.trim(), countryLabel(draft.countryCode)].filter(Boolean).join(', ')}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <TradeSafetyNote />
              </View>

              <Button
                label={isSubmitting ? 'Publishing…' : 'Publish swap'}
                onPress={handlePublish}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                className="mt-2"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {current.key !== 'preview' && (
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="bg-surface-card border-t border-faint px-6 pt-4"
        >
          {/* A missing field by name; a filled-in field that will not do, in
              the sentence that explains it. Never both — there is nothing to
              say about a title's length while the description is still
              empty. */}
          {stillNeeded.length > 0 ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">
              Still needed: {stillNeeded.join(', ')}
            </Text>
          ) : problem ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">{problem}</Text>
          ) : null}

          <View className="flex-row gap-3">
            {step > 0 && (
              <Button label="Back" variant="outline" className="flex-1" onPress={() => setStep((value) => value - 1)} />
            )}
            <Button
              label="Continue"
              className="flex-1"
              disabled={stillNeeded.length > 0 || problem !== null}
              onPress={handleNext}
            />
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}
