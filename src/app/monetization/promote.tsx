// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promote (Frontend Phase 6)
//
// §8 and §9: **one** promotion flow for all eight promotable entities. Provider,
// job, housing, marketplace, guide, update, event and organisation all arrive
// here with their subject injected as route parameters; there is no per-vertical
// promote screen, and a ninth content type would need no new screen at all.
//
//   Entity → package → duration → review → payment → processing → result
//
// Everything on the paying half is certified: `GET /catalog` for what can be
// bought, `POST /promotions/redeem` for a coupon quote, `POST /purchases` to buy
// it, and Phase 5's `PaymentSheet` for the payment itself. No second payment
// architecture — §18.
//
// Two states this screen exists to handle properly:
//
//   **Already promoted.** B15 refuses an overlapping placement with
//   `financial.placement.overlaps`, and finding that out at the payment step is
//   finding it out too late. The running promotion is shown first, with the
//   option to schedule the next one for when it ends.
//
//   **Renewal.** `POST /financial/placements/{id}/renew` exists now and extends a
//   placement in place; that flow lives on `promotions/[id].tsx` and nothing in
//   the app routes here to renew any more. The `renewFrom` handling stays because
//   it is still the correct behaviour for the one case renew cannot serve — a
//   placement that has already finished, which has no window left to extend. It
//   pre-selects the same product and sets `startsAt` to the old end date so the
//   two never overlap, and the review says exactly that rather than implying the
//   existing promotion is being extended.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  FinancialErrorInline,
  FinancialErrorView,
  PaymentSheet,
  PromotionField,
} from '@/components/financial';
import {
  MonetizationEmpty,
  MonetizationRow,
  PromotionDurationSelector,
  PromotionPackageSelector,
  PromotionPreview,
  promotionReviewDetails,
} from '@/components/monetization';
import { usePromotionPackages, useSubjectPromotion } from '@/hooks/monetization';
import { useCanTransact, usePurchaseProduct, useRedeemPromotion } from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import {
  PROMOTION_TARGETS,
  PROMOTION_TARGET_ORDER,
  targetForKey,
  targetForSubjectType,
  type PromotionOption,
  type PromotionPackage,
} from '@/types/monetization';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import type { PaymentIntent, PaymentMethodKind, PromotionQuote } from '@/types/financial';

export default function PromoteScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const params = useLocalSearchParams<{
    subjectType?: string;
    subjectId?: string;
    title?: string;
    /** Set when arriving from an expiring promotion. Pre-selects and schedules. */
    renewFrom?: string;
    productCode?: string;
  }>();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const country = useLocationStore((state) => state.currentLocation?.countryCode);

  // The route parameter may be either vocabulary: `MarketplaceListing` from the
  // creator workspace, `marketplace` from a monetization link. Both resolve.
  const target = useMemo(
    () => targetForSubjectType(params.subjectType) ?? targetForKey(params.subjectType),
    [params.subjectType]
  );

  const catalogue = usePromotionPackages(target, params.subjectId);
  const existing = useSubjectPromotion(target, params.subjectId);
  const purchase = usePurchaseProduct();
  const redeem = useRedeemPromotion();
  const { canTransact, blockedBy } = useCanTransact();

  const [selectedPackage, setSelectedPackage] = useState<PromotionPackage | null>(null);
  const [selectedOption, setSelectedOption] = useState<PromotionOption | null>(null);
  const [promoText, setPromoText] = useState('');
  const [quote, setQuote] = useState<PromotionQuote | null>(null);
  const [promoMessage, setPromoMessage] = useState<{ isApplicable: boolean; message: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<FinancialError | null>(null);

  const buyRefusal = useMemo(
    () => checkAccess(FinancialPermissions.PurchasesCreate, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const isRenewal = Boolean(params.renewFrom);

  /**
   * When the next promotion starts.
   *
   * A renewal, and any purchase made while a placement is still running, has to
   * be scheduled for after the current one ends — B15 refuses overlaps. Null
   * otherwise, which starts the placement when the payment captures.
   */
  const startsAt = useMemo(() => {
    if (!existing.active?.endsAt) return null;
    return existing.active.endsAt;
  }, [existing.active]);

  // Renewal arrives with a product code. Select it as soon as the catalogue
  // answers, so the member lands on the review rather than being asked to
  // re-choose what they already had.
  useEffect(() => {
    if (!params.productCode || selectedOption) return;

    for (const pkg of catalogue.packages) {
      const option = pkg.options.find((candidate) => candidate.code === params.productCode);
      if (option) {
        setSelectedPackage(pkg);
        setSelectedOption(option);
        return;
      }
    }
  }, [params.productCode, catalogue.packages, selectedOption]);

  const handleSelectPackage = useCallback((pkg: PromotionPackage) => {
    setSelectedPackage(pkg);
    // One option means no duration step; pick it now so the flow does not stall
    // on a list of one.
    const available = pkg.options.filter((option) => option.isAvailable);
    setSelectedOption(available.length === 1 ? available[0] : null);
    setQuote(null);
    setPromoMessage(null);
  }, []);

  /**
   * A coupon is quoted by the backend, never applied by subtraction here.
   *
   * `PromotionQuoteResponse` carries a `refusalCode` precisely so a code that
   * does nothing is refused with a reason rather than silently treated as zero.
   */
  const handleApplyPromotion = useCallback(async () => {
    if (!selectedOption || promoText.trim().length === 0) return;

    setPromoMessage(null);
    try {
      const result = await redeem.mutateAsync({
        code: promoText.trim(),
        productCode: selectedOption.code,
        countryCode: country ?? undefined,
      });

      setQuote(result);
      setPromoMessage({
        isApplicable: result.isApplicable,
        message: result.isApplicable
          ? `Code applied — ${pricing.format(result.discount)} off.`
          : 'That code does not apply to this purchase.',
      });
    } catch (cause) {
      const failure = toFinancialError(cause, 'mutating');
      setQuote(null);
      setPromoMessage({ isApplicable: false, message: failure.message });
    }
  }, [selectedOption, promoText, country, redeem, pricing]);

  const execute = useCallback(
    async (methodKind: PaymentMethodKind): Promise<PaymentIntent | null> => {
      if (!selectedOption || !target || !params.subjectId) return null;

      setError(null);
      try {
        const result = await purchase.mutateAsync({
          productCode: selectedOption.code,
          subjectType: target.subjectType,
          subjectId: params.subjectId,
          promotionCode: quote?.isApplicable ? quote.code : undefined,
          methodKind,
          countryCode: country ?? undefined,
          startsAt: startsAt ?? undefined,
        });

        return result.payment ?? null;
      } catch (cause) {
        setError(toFinancialError(cause, 'mutating'));
        throw cause;
      }
    },
    [selectedOption, target, params.subjectId, quote, country, startsAt, purchase]
  );

  // ── No subject: explain where promotion starts from ────────────────────────

  if (!target || !params.subjectId) {
    return <PromoteEntryPoints />;
  }

  if (!buyRefusal.allowed) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title={`${target.verb} your ${target.noun}`} showBack />
        <AccessGate refusal={buyRefusal} />
      </SafeAreaView>
    );
  }

  if (catalogue.isError && catalogue.error) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
        edges={['top', 'left', 'right']}
      >
        <ScreenHeader title={`${target.verb} your ${target.noun}`} showBack />
        <FinancialErrorView error={catalogue.error} onRetry={catalogue.refetch} />
      </SafeAreaView>
    );
  }

  const price = pricing.resolve({
    price: selectedOption?.price,
    quote,
    isAvailable: selectedOption?.isAvailable ?? true,
    unavailableReason: selectedOption?.unavailableReason,
  });

  const canReview = Boolean(selectedOption && price.isActionable && price.effective);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title={isRenewal ? 'Extend promotion' : `${target.verb} your ${target.noun}`} showBack />

      {/* Same shape as the wallet screens: the promotion field is in the
          scroll body and the review footer is pinned, so both lift together. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollEndScrollView
        endNavigation={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xl font-black tracking-tight"
          accessibilityRole="header"
        >
          {params.title ?? `Your ${target.noun}`}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-sm font-medium leading-relaxed mt-1 mb-6"
        >
          {target.benefit}
        </Text>

        {/* Already running — said up front, not at the payment step. */}
        {existing.active ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`A ${existing.active.kind} promotion is already running on this${
              existing.active.endsAt
                ? ` until ${new Date(existing.active.endsAt).toLocaleDateString()}`
                : ''
            }. Anything you buy now starts when that one ends.`}
            style={{ backgroundColor: tokens.color.info.surface, borderColor: `${tokens.color.info.default}33` }}
            className="rounded-2xl border p-4 mb-5"
          >
            <Text
              style={{ color: tokens.color.info.default }}
              className="text-[10px] font-black uppercase tracking-widest mb-1"
            >
              Already promoted
            </Text>
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
              A {existing.active.kind} promotion is running on this
              {existing.active.endsAt
                ? ` until ${new Date(existing.active.endsAt).toLocaleDateString()}`
                : ''}
              . Diaspora does not run two at once, so anything you buy now is scheduled to start when that
              one ends.
            </Text>

            <TouchableOpacity
              onPress={() => router.push(`/monetization/promotions/${existing.active!.placementId}`)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="See the promotion that is running"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="mt-3 self-start"
            >
              <Text style={{ color: tokens.color.info.default }} className="text-[11px] font-black uppercase tracking-wider">
                See it
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Step 1 — package. */}
        {catalogue.isEmpty ? (
          <MonetizationEmpty
            icon="pricetags-outline"
            title="Nothing to buy here yet"
            message={`There are no promotion options for a ${target.noun} in your country at the moment.`}
          />
        ) : (
          <>
            <StepLabel index={1} label="Choose how to promote it" />
            <PromotionPackageSelector
              packages={catalogue.packages}
              selectedId={selectedPackage?.id ?? null}
              onSelect={handleSelectPackage}
              isLoading={catalogue.isLoading}
            />
          </>
        )}

        {/* Step 2 — duration, where there is more than one. */}
        {selectedPackage && selectedPackage.options.length > 1 ? (
          <View className="mt-8">
            <StepLabel index={2} label="Choose how long it runs" />
            <PromotionDurationSelector
              options={selectedPackage.options}
              selectedCode={selectedOption?.code ?? null}
              onSelect={(option) => {
                setSelectedOption(option);
                setQuote(null);
                setPromoMessage(null);
              }}
            />
          </View>
        ) : null}

        {/* Step 3 — what you get. */}
        {selectedOption ? (
          <View className="mt-8">
            <StepLabel
              index={selectedPackage && selectedPackage.options.length > 1 ? 3 : 2}
              label="What you get"
            />
            <PromotionPreview
              target={target}
              option={selectedOption}
              subjectTitle={params.title}
              startsAt={startsAt}
            />
          </View>
        ) : null}

        {/* Step 4 — a code, if there is one. */}
        {selectedOption ? (
          <View className="mt-8">
            <PromotionField
              value={promoText}
              onChangeText={setPromoText}
              onApply={handleApplyPromotion}
              isApplying={redeem.isPending}
              result={promoMessage}
            />
          </View>
        ) : null}

        {error ? (
          <View className="mt-5">
            <FinancialErrorInline error={error} />
          </View>
        ) : null}
      </ScrollEndScrollView>

      {canReview ? (
        <View
          style={{
            paddingBottom: insets.bottom + 12,
            borderTopColor: tokens.color.border.default,
            backgroundColor: tokens.color.surface.card,
          }}
          className="px-5 pt-4 border-t"
        >
          <TouchableOpacity
            onPress={() => setSheetOpen(true)}
            disabled={!canTransact}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Review this promotion. ${price.spoken}`}
            accessibilityState={{ disabled: !canTransact }}
            style={{ backgroundColor: canTransact ? tokens.color.primary[500] : tokens.color.neutral[200] }}
            className="h-14 rounded-full flex-row items-center justify-center px-5"
          >
            <Text
              style={{ color: canTransact ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-sm font-black tracking-tight"
            >
              Review
            </Text>
            <Text
              style={{ color: canTransact ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-sm font-black tracking-tight ml-2 opacity-80"
            >
              · {price.formatted}
            </Text>
          </TouchableOpacity>

          {blockedBy ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold text-center mt-2.5"
            >
              {blockedBy.hint ?? blockedBy.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Payment is Phase 5's sheet, unchanged. This screen knows nothing about
          methods, reconciliation or refunds — §18. */}
      {selectedOption && price.original && price.effective ? (
        <PaymentSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={selectedOption.name}
          description={selectedOption.description}
          subjectLabel={params.title ?? `your ${target.noun}`}
          listPrice={price.original}
          discount={price.discount}
          payable={price.effective}
          details={promotionReviewDetails(target, selectedOption, startsAt)}
          execute={execute}
          confirmLabel="Confirm and pay"
          onCompleted={() => router.replace('/monetization/promotions')}
        />
      ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepLabel({ index, label }: { index: number; label: string }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center mb-3">
      <View
        style={{ backgroundColor: tokens.color.primary[500] }}
        className="w-5 h-5 rounded-full items-center justify-center mr-2"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={{ color: '#FFFFFF' }} className="text-[11px] font-black">
          {index}
        </Text>
      </View>
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-sm font-black tracking-tight"
        accessibilityRole="header"
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * What the screen shows when it is opened without a subject.
 *
 * A promotion attaches to a specific thing, so there is no useful "promote"
 * action without one. Rather than a dead end, this lists the eight promotable
 * types and sends somebody to where their own items of that type live — which is
 * the honest answer to "what can I promote?"
 */
function PromoteEntryPoints() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  /**
   * Where a member's own items of each type live.
   *
   * These are existing routes, checked against the route tree. A type whose list
   * screen does not exist points at the place it is created instead, which is
   * still somewhere useful rather than a route that throws.
   */
  const destinations: Record<string, { route: string; hint: string }> = {
    marketplace: { route: '/my-listings', hint: 'Your marketplace listings.' },
    job: { route: '/my-listings', hint: 'Jobs you have posted.' },
    housing: { route: '/my-listings', hint: 'Properties you have listed.' },
    provider: { route: '/(tabs)/profile', hint: 'Your service profile.' },
    event: { route: '/community-life', hint: 'Events you are running.' },
    guide: { route: '/creator', hint: 'Guides you have published.' },
    update: { route: '/creator', hint: 'Updates you have posted.' },
    organization: { route: '/community-life/events?tab=directory', hint: 'Organisations you manage.' },
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Promote" showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-sm font-medium leading-relaxed mb-6"
        >
          A promotion attaches to something you have posted. Open the thing you want to promote and choose
          Promote from there — or start from one of these.
        </Text>

        <View
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border overflow-hidden"
        >
          {PROMOTION_TARGET_ORDER.map((key, index) => {
            const target = PROMOTION_TARGETS[key];
            const destination = destinations[key];

            return (
              <MonetizationRow
                key={key}
                icon={target.icon}
                label={`${target.verb} a ${target.noun}`}
                hint={destination?.hint ?? target.benefit}
                onPress={() => router.push((destination?.route ?? '/(tabs)/profile') as never)}
                isLast={index === PROMOTION_TARGET_ORDER.length - 1}
              />
            );
          })}
        </View>

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-5"
        >
          What you can promote depends on your country and on what Diaspora offers there. Prices are shown
          before you pay, and nothing is charged until you confirm.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

