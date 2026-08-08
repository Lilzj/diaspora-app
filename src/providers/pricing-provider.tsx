// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Pricing provider (Frontend Phase 6)
//
// §7: prices are provider-driven, never written into a screen. This is the
// provider. It holds the three deployment facts that every price depends on —
// the currency catalogue, whether the deployment converts, and which currency
// the member actually holds — and hands screens a `resolve()` that turns a
// backend price into something renderable in all six of its states.
//
// Why a provider rather than a hook each screen calls directly: the currency
// catalogue and the capabilities response are deployment reference data with an
// hour-long stale time, and eleven screens each calling `useCurrencies()` would
// each subscribe to the same query. That works, and it also means eleven
// components re-render when a refetch lands. Reading them once here and passing
// a memoised context down is the cheaper arrangement and the one that keeps the
// "no price in a screen" rule enforceable — a screen that wants a price has to
// go through `usePricing()`.
//
// The provider deliberately holds no prices of its own. There is no fallback
// catalogue, no default currency and no "£4.99" anywhere in this file. When the
// backend has not answered, `resolve()` returns a loading or an error state and
// the screen renders that honestly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';

import {
  describeBillingCycle,
  describeTrial,
  foreignCurrencyNote,
  isForeignCurrency,
  resolvePrice,
  type PriceView,
  type PricingContextValue,
  type ResolvePriceInput,
} from '@/lib/pricing';
import { formatMoney, describeMoney } from '@/lib/money';
import { useFinancialCapabilities, usePrimaryWallet } from '@/hooks/financial';
import type { BillingInterval, Money, SubscriptionPlan } from '@/types/financial';
import type { BillingCycleView } from '@/types/monetization';

export interface PricingApi extends PricingContextValue {
  /** The one entry point. Every price on the monetization surface goes through it. */
  resolve: (input: ResolvePriceInput) => PriceView;
  /** A bare amount, formatted in the member's locale. */
  format: (value: Money, options?: { showCode?: boolean; compact?: boolean }) => string;
  /** The same amount as a screen reader should say it. */
  describe: (value: Money) => string;
  /** A billing interval in words. */
  cycle: (interval: BillingInterval) => BillingCycleView;
  /** A plan's trial offer, both halves of it. Null when there is none. */
  trial: (plan: SubscriptionPlan) => { headline: string; afterwards: string } | null;
  /** Whether a price is in a currency the member's wallet cannot pay. */
  isForeign: (price: Money | null | undefined) => boolean;
  /** The sentence that goes with a foreign-currency price. Null when there is none. */
  foreignNote: (price: Money | null | undefined) => string | null;
  /** True while the deployment facts are still being read. */
  isLoading: boolean;
}

const PricingContext = createContext<PricingApi | null>(null);

/**
 * The device's language tag, for `Intl`.
 *
 * React Native has no `navigator.language`. The native settings modules are read
 * defensively because they are absent under Jest and on web, and a formatter
 * that throws during a snapshot test is a formatter nobody keeps. Returning
 * `undefined` is correct rather than defaulting to `en-GB`: `Intl` falls back to
 * the runtime's own locale, which is a better guess than this file's.
 */
function deviceLocale(): string | undefined {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules?.SettingsManager?.settings;
      const tag = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      return typeof tag === 'string' ? tag.replace(/_/g, '-') : undefined;
    }
    if (Platform.OS === 'android') {
      const tag = NativeModules?.I18nManager?.localeIdentifier;
      return typeof tag === 'string' ? tag.replace(/_/g, '-') : undefined;
    }
  } catch {
    // A device that will not say what locale it is in gets the runtime default.
  }
  return undefined;
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const capabilities = useFinancialCapabilities();
  const { wallet, isLoading: walletLoading } = usePrimaryWallet();

  const locale = useMemo(deviceLocale, []);

  const context = useMemo<PricingContextValue>(
    () => ({
      locale,
      // False on every deployment today. Read rather than assumed, so the day a
      // deployment enables conversion the copy changes without a client release.
      conversionEnabled: capabilities.data?.currencyConversionEnabled ?? false,
      // The wallet's currency, not the device's region: somebody in Spain with a
      // GBP wallet pays in GBP, and telling them a price in EUR they cannot pay
      // would be worse than telling them nothing.
      preferredCurrency: wallet?.currency ?? null,
    }),
    [locale, capabilities.data?.currencyConversionEnabled, wallet?.currency]
  );

  const api = useMemo<PricingApi>(
    () => ({
      ...context,
      resolve: (input) => resolvePrice(input, context),
      format: (value, options) => formatMoney(value, { ...options, locale: context.locale }),
      describe: (value) => describeMoney(value, { locale: context.locale }),
      cycle: describeBillingCycle,
      trial: (plan) => describeTrial(plan, context),
      isForeign: (price) => isForeignCurrency(price, context),
      foreignNote: (price) => foreignCurrencyNote(price, context),
      isLoading: capabilities.isLoading || walletLoading,
    }),
    [context, capabilities.isLoading, walletLoading]
  );

  return <PricingContext.Provider value={api}>{children}</PricingContext.Provider>;
}

/**
 * The pricing API.
 *
 * Throws outside the provider rather than returning a default. A silent default
 * would mean a screen rendering prices with no currency catalogue behind them —
 * every symbol missing, every exponent assumed — and that is a bug that ships,
 * because it looks nearly right.
 */
export function usePricing(): PricingApi {
  const value = useContext(PricingContext);
  if (!value) {
    throw new Error('usePricing must be used inside <PricingProvider>.');
  }
  return value;
}
