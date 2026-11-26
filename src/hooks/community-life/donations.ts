// Community Life hooks: donations. ./index.ts is the overview of the whole module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as gapApi from '@/lib/api/community-gap-api';
import { communityGapKeys } from '@/lib/api/community-gap-api';
import * as b18 from '@/lib/api/community-programme-api';
import { communityProgrammeKeys } from '@/lib/api/community-programme-api';
import * as financialApi from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { isGivingSettled, isPaymentSettled } from '@/lib/domain/community-state';
import { useAuthStore } from '@/store/auth';
import { useFinancialAccess } from '../financial';
import type {
  CampaignDonation,
  DonationTimeSeries,
  RecurringDonation,
  DonationDraft,
} from '@/types/community-advanced';
import type { CreateDonationRequest, Donation } from '@/types/financial';
import {
  LIVE_STALE_MS,
  REFERENCE_STALE_MS,
  backendRead,
  mutationOptions,
  readOptions,
} from './shared';

/**
 * The caller's own gifts to a campaign — `GET /communities/campaigns/{id}/donations/me`,
 * served since 20 Oct 2026 and read in every build. Anonymous gifts are not in
 * it (they store no donor). A failed read is reported as a failure, never as
 * "you have not given".
 */
export function useMyCampaignDonations(campaignId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.myCampaignDonations(campaignId ?? ''),
    queryFn: () => b18.fetchMyCampaignDonations(campaignId as string),
    enabled: Boolean(campaignId) && enabled,
    ...readOptions,
  });

  return backendRead<CampaignDonation[]>(query, []);
}

/**
 * A campaign's giving over time.
 *
 * Keyed on the **cause code**, because that is what the route is keyed on — and
 * a campaign has one only once it is published, so a caller passing `undefined`
 * for an unpublished campaign gets a disabled query rather than a 404.
 *
 * The response states the window it actually covers, which may be narrower than
 * the one asked for: a request wider than the deployment's maximum is clamped
 * rather than refused. A chart must label its axis from the response.
 */
export function useDonationTimeSeries(
  causeCode: string | undefined | null,
  params: { from?: string; to?: string } = {}
) {
  const query = useQuery({
    queryKey: communityProgrammeKeys.donationTimeSeries(causeCode ?? '', params.from, params.to),
    queryFn: () => b18.fetchDonationTimeSeries(causeCode as string, params),
    enabled: Boolean(causeCode),
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead<DonationTimeSeries | null>(query, null);
}

// ── Recurring donations — COMMUNITY-LIFE-GAP-008 ────────────────────────────

/**
 * The caller's standing donations.
 *
 * Every state, cancelled ones included: a donor who stopped a monthly gift is
 * entitled to see that it stopped, and hiding it would look as though the
 * cancellation had lost the record.
 *
 * This is what GAP-008 was waiting for. The donation sheet used to say the
 * interval was "recorded as an intention and not yet scheduled" and no screen
 * showed a next-charge date, because nothing would have honoured one. There is
 * now a sweep that charges through the ordinary payment path, and
 * `nextChargeAt` is a date the platform intends to keep.
 */
export function useMyRecurringDonations() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: communityProgrammeKeys.myRecurringDonations(),
    queryFn: b18.fetchMyRecurringDonations,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

/**
 * Stops a standing donation.
 *
 * **The cache is written from the server's answer, never from the tap.** The
 * response is the schedule as it now stands; a screen that assumed the
 * cancellation had worked would be reporting a financial outcome the server had
 * not confirmed.
 *
 * A schedule that does not exist and one belonging to somebody else are answered
 * identically, so a 404 here means "we could not find that standing donation"
 * and must never be rendered as "that belongs to another account".
 */
export function useCancelRecurringDonation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (recurringDonationId: string) =>
      b18.cancelRecurringDonation(recurringDonationId),
    onSuccess: (schedule) => {
      queryClient.setQueryData<RecurringDonation[]>(
        communityProgrammeKeys.myRecurringDonations(),
        (existing) =>
          existing?.map((row) =>
            row.recurringDonationId === schedule.recurringDonationId ? schedule : row
          )
      );
      void queryClient.invalidateQueries({
        queryKey: communityProgrammeKeys.myRecurringDonations(),
      });
    },
  });
}

// ── Donations. Real B15 money, simulated campaign context. ───────────────────

/**
 * The real B15 causes.
 *
 * Not a gap hook. `GET /financial/donations/causes` is certified, and it is
 * what a campaign's `causeCode` resolves against. §38: there is no second
 * giving system.
 */
export function useDonationCauses(country?: string, supportKind?: string) {
  const query = useQuery({
    queryKey: financialKeys.causes(country, supportKind),
    queryFn: () => financialApi.fetchDonationCauses({ country, supportKind }),
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });

  return {
    causes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
  };
}

/**
 * The caller's real giving history.
 *
 * `GET /financial/giving/me`. The one impact figure in this phase that is a
 * fact rather than a simulation. Anonymous donations are absent by
 * construction — B15 stores no donor identifier on one — and the screen says
 * so rather than showing a gap in a list.
 */
export function useGivingHistory(take = 50) {
  const financialAccess = useFinancialAccess();

  const query = useQuery({
    queryKey: financialKeys.giving(),
    queryFn: () => financialApi.fetchGivingHistory({ take }),
    enabled: financialAccess.canReadGiving,
    ...readOptions,
  });

  return {
    history: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    isSimulated: false,
    canRead: financialAccess.canReadGiving,
  };
}

/**
 * Donates to a campaign.
 *
 * **The money is real.** `POST /financial/donations` against the campaign's
 * real `causeCode`, with B15's idempotency contract, exactly as Phase 5's
 * giving flow does — this hook does not create a parallel donation path, it
 * calls the same certified route and then records the campaign context.
 *
 * The refusal at the top is the important line: a campaign with no `causeCode`
 * has nowhere certified to collect, and rather than simulating a donation this
 * throws. §45 and §13: a donation is never marked successful from frontend
 * state, and a *simulated* donation would be worse than that — it would be a
 * receipt for money that never moved.
 */
export function useDonateToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (draft: DonationDraft & { campaignId?: string | null }) => {
      if (!draft.causeCode) {
        throw new Error(
          'This campaign is not connected to a giving cause yet, so it cannot accept donations. ' +
            'See COMMUNITY-LIFE-GAP-006.'
        );
      }

      const scope: OperationScope = {
        operation: 'donation',
        subject: draft.causeCode,
        // Giving the same amount twice on purpose is a thing people do, so the
        // amount discriminates. Two identical amounts inside the key's window
        // still collapse — that is the double-tap case.
        discriminator: `${draft.amountMajor}${draft.currency}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);

      const request: CreateDonationRequest = {
        amount: draft.amountMajor,
        currency: draft.currency,
        causeCode: draft.causeCode,
        isAnonymous: draft.isAnonymous,
        message: draft.message,
        recurringIntervalMonths: draft.recurringIntervalMonths ?? undefined,
        idempotencyKey,
      };

      // Real B15 route. The status on the response is B15's, not ours.
      const created: Donation = await financialApi.createDonation(request);

      // **The gateway call, and the fourth place it was missing.** Creating a
      // donation opens a payment intent in `Draft` and hands it to nobody: no
      // gateway reference, no `nextAction` for the sheet to open, and no
      // provider asked for the money — while the screen says it is confirming
      // with the payment provider about a request never made.
      //
      // This is the hook the campaign's own Donate button uses.
      // `useCreateDonation` in `hooks/financial` is the wallet route's, and
      // it had the same hole; both were found on a device, one at a time,
      // because the guard that pinned the purchase path read only that one file.
      const payment =
        created.payment && !isPaymentSettled(created.payment.status)
          ? await financialApi.authorizePayment(created.payment.paymentIntentId)
          : created.payment;

      const donation: Donation = { ...created, payment: payment ?? null };

      if (isGivingSettled(donation.status)) {
        await releaseIdempotencyKey(scope);
      }

      // The campaign-side binding. Best effort: the donation is already real
      // and recorded by B15, and failing to label it must not make the member
      // think their money did not arrive.
      if (draft.campaignId && donation.status === 'Completed') {
        try {
          await gapApi.attachCampaignDonation(draft.campaignId, donation.donationId);
        } catch {
          // Swallowed deliberately. See above — the receipt is B15's and is
          // unaffected. The missing link is a reporting gap, not a money gap.
        }
      }

      return donation;
    },
    onSuccess: (donation, variables) => {
      void queryClient.invalidateQueries({ queryKey: financialKeys.giving() });
      if (donation.payment) {
        queryClient.setQueryData(
          financialKeys.payment(donation.payment.paymentIntentId),
          donation.payment
        );
      }
      if (donation.status === 'Completed') {
        void queryClient.invalidateQueries({ queryKey: financialKeys.wallets() });
        if (variables.campaignId) {
          void queryClient.invalidateQueries({ queryKey: communityGapKeys.campaign(variables.campaignId) });
        }
      }
    },
  });
}
