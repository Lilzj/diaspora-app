// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization catalogue arrangement (Frontend Phase 6)
//
// Turns what B15 serves into what the UI renders. Every function here is a pure
// transformation of a certified response; none of them fetches, and none of them
// invents a figure.
//
// The one derived value is `pricePerDay`, and it is derived by integer division
// on `minorUnits` rather than on `amount`, for the reason `lib/money.ts` exists:
// `999 / 7` in major units is `1.4271428571428572`, and a comparison line that
// renders `£1.43/day` while a sibling renders `£1.42/day` from the same
// arithmetic is a comparison line nobody trusts. It is a display aid and is
// never sent anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { fromMinorUnits } from './money';
import type { StatusPresentation } from './financial-status';
import type {
  MonetizationProduct,
  MonetizationPurchase,
  Money,
  Placement,
  PlacementKind,
} from '@/types/financial';
import {
  targetForSubjectType,
  type Promotion,
  type PromotionOption,
  type PromotionPackage,
} from '@/types/monetization';
import type { CampaignStatus } from '@/types/monetization-gaps';

/**
 * How close to the end a promotion is called "expiring".
 *
 * Three days. Long enough that somebody who opens the app twice a week sees the
 * warning; short enough that it is not permanently on screen for a 30-day
 * placement. B15 has no `placement.expiring` event (MON-GAP-004), so this
 * window is the only warning a member gets, which is an argument for the longer
 * end of a reasonable range rather than the shorter.
 */
export const EXPIRY_WINDOW_DAYS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Prices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Price ÷ duration, exact in minor units.
 *
 * Truncates rather than rounds: a per-day figure that rounds up makes a 30-day
 * package look worse than it is, and the number is only ever shown as "about",
 * so understating it is the safe direction.
 */
export function derivePricePerDay(
  price: Money | null | undefined,
  durationDays: number | null | undefined
): Money | null {
  if (!price || !durationDays || durationDays <= 0) return null;
  if (price.minorUnits < 0) return null;
  return fromMinorUnits(
    Math.trunc(price.minorUnits / durationDays),
    price.currency,
    price.exponent,
    price.symbol
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Products → options → packages
// ─────────────────────────────────────────────────────────────────────────────

export function toPromotionOption(product: MonetizationProduct): PromotionOption {
  return {
    code: product.code,
    productId: product.productId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price ?? null,
    durationDays: product.durationDays ?? null,
    placementKind: product.placementKind ?? null,
    priorityWeight: product.priorityWeight,
    isRenewable: product.isRenewable,
    isAvailable: product.isAvailable,
    unavailableReasonCode: product.unavailableReasonCode ?? null,
    unavailableReason: product.unavailableReason ?? null,
    sortOrder: product.sortOrder,
    pricePerDay: derivePricePerDay(product.price, product.durationDays),
  };
}

/**
 * What a placement kind means, in the member's words.
 *
 * B15's `PlacementKind` is six values and the first four are Marketplace's own
 * vocabulary, unchanged. This is the only place the client explains them, so a
 * rename in a future phase is a one-line change here rather than a search across
 * eight screens.
 */
export function describePlacementKind(kind: PlacementKind | null | undefined): {
  label: string;
  where: string;
  icon: string;
} {
  switch (kind) {
    case 'Featured':
      return {
        label: 'Featured',
        where: 'In the featured rail at the top of the relevant list.',
        icon: 'star-outline',
      };
    case 'Bump':
      return {
        label: 'Bump',
        where: 'Moved back to the top of the list, as though just posted.',
        icon: 'arrow-up-circle-outline',
      };
    case 'Spotlight':
      return {
        label: 'Spotlight',
        where: 'In the spotlight slot shown to people browsing your area.',
        icon: 'flashlight-outline',
      };
    case 'CategoryHighlight':
      return {
        label: 'Category highlight',
        where: 'Highlighted within its own category, above standard entries.',
        icon: 'apps-outline',
      };
    case 'Boost':
      return {
        label: 'Boost',
        where: 'Higher in search results and in more nearby feeds.',
        icon: 'trending-up-outline',
      };
    case 'Premium':
      return {
        label: 'Premium',
        where: 'Top placement everywhere it appears, with a premium badge.',
        icon: 'diamond-outline',
      };
    default:
      return {
        label: 'Promotion',
        where: 'Shown more often to people in your area.',
        icon: 'megaphone-outline',
      };
  }
}

/**
 * Groups a flat product list into packages whose options differ only in duration.
 *
 * The grouping key is the placement kind, falling back to the category for a
 * product that has no kind. That matches how somebody chooses — what kind of
 * visibility first, then for how long — and it means a catalogue with a single
 * product for a subject produces one package with one option, which the selector
 * renders without a duration step.
 *
 * Ordering is the backend's: packages by the lowest `sortOrder` they contain,
 * options by duration then price. `sortOrder` is B15's own ranking and
 * second-guessing it here would put the client's opinion above the operator's.
 */
export function groupIntoPackages(products: MonetizationProduct[]): PromotionPackage[] {
  const groups = new Map<string, MonetizationProduct[]>();

  for (const product of products) {
    const key = product.placementKind ?? product.category;
    const existing = groups.get(key);
    if (existing) existing.push(product);
    else groups.set(key, [product]);
  }

  const packages: PromotionPackage[] = [];

  for (const [id, grouped] of groups) {
    const options = grouped
      .map(toPromotionOption)
      .sort(
        (left, right) =>
          (left.durationDays ?? Number.MAX_SAFE_INTEGER) -
            (right.durationDays ?? Number.MAX_SAFE_INTEGER) ||
          (left.price?.minorUnits ?? 0) - (right.price?.minorUnits ?? 0)
      );

    const available = options.filter((option) => option.isAvailable);

    // The name comes from the shortest option, with its duration stripped: a
    // package built from "Boost for 7 days" and "Boost for 30 days" is called
    // "Boost", not "Boost for 7 days".
    const kind = describePlacementKind(options[0].placementKind);

    packages.push({
      id,
      name: kind.label,
      description: options[0].description,
      placementKind: options[0].placementKind,
      category: options[0].category,
      options,
      cheapest:
        available
          .filter((option) => option.price)
          .sort((left, right) => (left.price!.minorUnits) - (right.price!.minorUnits))[0] ??
        available[0] ??
        null,
      bestPriorityWeight: Math.max(...options.map((option) => option.priorityWeight)),
      hasAvailableOption: available.length > 0,
      placementDescription: kind.where,
    });
  }

  return packages.sort(
    (left, right) =>
      Math.min(...left.options.map((option) => option.sortOrder)) -
      Math.min(...right.options.map((option) => option.sortOrder))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Placements → promotions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whole days from now until `iso`, floored. Null for an absent date.
 *
 * Negative for a date already past, which callers check rather than clamp: "−2"
 * and "0" mean different things on an expiry screen.
 */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  return Math.floor((target - now) / 86_400_000);
}

/**
 * Joins a placement to the purchase that paid for it and the product it came
 * from.
 *
 * The join is by `productCode` and subject, because B15 gives a `Placement` no
 * purchase identifier — `MonetizationPurchase` points at the placement and not
 * the other way round. Where the purchase list does not contain a match the
 * promotion still renders, with `paid` null and the price line absent, rather
 * than showing a figure taken from the catalogue that may not be what was
 * actually charged after a discount.
 */
export function toPromotion(
  placement: Placement,
  purchases: MonetizationPurchase[] = [],
  products: MonetizationProduct[] = [],
  now = Date.now()
): Promotion {
  const purchase =
    purchases.find(
      (candidate) =>
        candidate.placement?.placementId === placement.placementId ||
        (candidate.productCode === placement.productCode &&
          candidate.subjectId === placement.subjectId &&
          candidate.subjectType === placement.subjectType)
    ) ?? null;

  const product = products.find((candidate) => candidate.code === placement.productCode) ?? null;

  const remaining = daysUntil(placement.endsAt, now);

  return {
    placementId: placement.placementId,
    subjectType: placement.subjectType,
    subjectId: placement.subjectId,
    target: targetForSubjectType(placement.subjectType),
    kind: placement.kind,
    status: placement.status,
    isActive: placement.isActive,
    priorityWeight: placement.priorityWeight,
    productCode: placement.productCode,
    countryCode: placement.countryCode ?? null,
    startsAt: placement.startsAt,
    endsAt: placement.endsAt ?? null,
    purchase,
    paid: purchase?.paid ?? null,
    daysRemaining: remaining !== null && remaining >= 0 ? remaining : null,
    isExpiringSoon:
      placement.isActive && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WINDOW_DAYS,
    // Absent from the catalogue means unknown, not un-renewable: the catalogue
    // is fetched per subject and a promotions list spans many subjects. Defaulting
    // to true offers a renewal the purchase step can still refuse, which is
    // better than hiding one that would have worked.
    isRenewable: product?.isRenewable ?? true,
  };
}

/** Every placement as a promotion, newest first. */
export function toPromotions(
  placements: Placement[],
  purchases: MonetizationPurchase[] = [],
  products: MonetizationProduct[] = [],
  now = Date.now()
): Promotion[] {
  return placements
    .map((placement) => toPromotion(placement, purchases, products, now))
    .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt));
}

/** Which bucket a promotion belongs in on the management screen. */
export function promotionBucket(promotion: Promotion): 'active' | 'scheduled' | 'ended' {
  if (promotion.isActive || promotion.status === 'Active') return 'active';
  if (promotion.status === 'Scheduled') return 'scheduled';
  return 'ended';
}

export function filterPromotions(promotions: Promotion[], filter: string): Promotion[] {
  if (filter === 'all') return promotions;
  return promotions.filter((promotion) => promotionBucket(promotion) === filter);
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign status — MON-GAP-001
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a campaign status is drawn.
 *
 * The same `StatusPresentation` shape `financial-status.ts` produces, so
 * `<StatusBadge>` renders a campaign without knowing what one is. Every entry
 * carries a full-sentence `description` because §32 forbids communicating a
 * state through colour alone, and the badge's own label is two words.
 */
export function presentCampaignStatus(status: CampaignStatus): StatusPresentation {
  switch (status) {
    case 'Draft':
      return {
        label: 'Draft',
        tone: 'neutral',
        icon: 'create-outline',
        description: 'Draft. Not submitted yet — you can still change anything.',
        isTerminal: false,
        isSettled: false,
        needsReconciliation: false,
      };
    case 'PendingPayment':
      return {
        label: 'Needs payment',
        tone: 'warning',
        icon: 'card-outline',
        description: 'Needs payment. The campaign starts once the payment clears.',
        isTerminal: false,
        isSettled: false,
        needsReconciliation: true,
      };
    case 'Submitted':
      return {
        label: 'Submitted',
        tone: 'pending',
        icon: 'paper-plane-outline',
        description: 'Submitted. Waiting to be picked up for review.',
        isTerminal: false,
        isSettled: false,
        needsReconciliation: true,
      };
    case 'UnderReview':
      return {
        label: 'In review',
        tone: 'pending',
        icon: 'eye-outline',
        description: 'In review. Somebody is checking the campaign before it runs.',
        isTerminal: false,
        isSettled: false,
        needsReconciliation: true,
      };
    case 'Approved':
      return {
        label: 'Approved',
        tone: 'positive',
        icon: 'checkmark-circle-outline',
        description: 'Approved. It will start on the scheduled date.',
        isTerminal: false,
        isSettled: true,
        needsReconciliation: false,
      };
    case 'Scheduled':
      return {
        label: 'Scheduled',
        tone: 'pending',
        icon: 'calendar-outline',
        description: 'Scheduled. It has not started running yet.',
        isTerminal: false,
        isSettled: true,
        needsReconciliation: false,
      };
    case 'Active':
      return {
        label: 'Running',
        tone: 'positive',
        icon: 'play-circle-outline',
        description: 'Running. The campaign is being shown to people now.',
        isTerminal: false,
        isSettled: true,
        needsReconciliation: false,
      };
    case 'Paused':
      return {
        label: 'Paused',
        tone: 'warning',
        icon: 'pause-circle-outline',
        description: 'Paused. Nothing is being shown and no budget is being spent.',
        isTerminal: false,
        isSettled: true,
        needsReconciliation: false,
      };
    case 'Completed':
      return {
        label: 'Finished',
        tone: 'neutral',
        icon: 'flag-outline',
        description: 'Finished. The campaign ran to the end of its schedule.',
        isTerminal: true,
        isSettled: true,
        needsReconciliation: false,
      };
    case 'Rejected':
      return {
        label: 'Rejected',
        tone: 'negative',
        icon: 'close-circle-outline',
        description: 'Rejected. It was not approved to run — the reason is on the campaign.',
        isTerminal: true,
        isSettled: false,
        needsReconciliation: false,
      };
    case 'Cancelled':
      return {
        label: 'Cancelled',
        tone: 'neutral',
        icon: 'ban-outline',
        description: 'Cancelled. You stopped this campaign.',
        isTerminal: true,
        isSettled: false,
        needsReconciliation: false,
      };
    case 'Failed':
      return {
        label: 'Failed',
        tone: 'negative',
        icon: 'alert-circle-outline',
        description: 'Failed. Something went wrong and the campaign did not run.',
        isTerminal: true,
        isSettled: false,
        needsReconciliation: false,
      };
    default:
      // An unknown status is a deployment ahead of this build. Rendering it as
      // in-progress and continuing to poll is the correct degradation.
      return {
        label: 'In progress',
        tone: 'pending',
        icon: 'time-outline',
        description: 'In progress. Pull down to refresh for the latest status.',
        isTerminal: false,
        isSettled: false,
        needsReconciliation: true,
      };
  }
}

/** Whether a campaign in this state may still be edited. */
export function isCampaignEditable(status: CampaignStatus): boolean {
  return status === 'Draft' || status === 'Rejected';
}

/** Whether pause/resume applies. */
export function isCampaignRunnable(status: CampaignStatus): boolean {
  return status === 'Active' || status === 'Paused' || status === 'Scheduled';
}
