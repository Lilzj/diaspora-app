// ─────────────────────────────────────────────────────────────────────────────
// Purchases and tenancies — the screen that did not exist
//
// ── What this closes ─────────────────────────────────────────────────────────
//
// `GET /marketplace/reservations` and `GET /housing/reservations` have served a
// member's own transactions since those modules shipped, and **nothing in the
// application called either.** A member could buy something or move into a
// property and then find no record of it anywhere.
//
// It also left the ratings work unreachable. `SellerReview` and `LandlordReview`
// both gate on a completed transaction, so the only honest place to offer "rate
// this" is beside the transaction itself — and there was no such place. The
// routes existed, were tested, and no member could produce a rating through the
// app, which is why every seller and landlord star was permanently absent.
//
// ── Why one screen for two modules ───────────────────────────────────────────
//
// A member does not think of "my marketplace reservations" and "my housing
// reservations" as different things; they think of what they bought and where
// they live. `reservations-api` normalises the two wire shapes — which spell the
// id, the counterparty and the settlement date three different ways apiece — so
// this screen renders one list.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { fetchMemberReservations, type MemberReservation } from '@/lib/reservations-api';

export default function MyTransactionsScreen() {
  const bottomInset = useBottomInset();
  const [rows, setRows] = useState<MemberReservation[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { reservations, failed: fell } = await fetchMemberReservations();
    setRows(reservations);
    setFailed(fell);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-background">
        <ScreenHeader title="Purchases & tenancies" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-background">
      <ScreenHeader title="Purchases & tenancies" />

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* A module that failed is not a module with nothing in it. Saying which
          * one fell over keeps "you have no purchases" from being printed over a
          * marketplace that simply could not be reached. */}
        {failed.length > 0 ? (
          <View className="bg-surface-card border border-subtle rounded-2xl p-4 mt-3">
            <Text className="text-[13px] font-black text-content-strong mb-1">
              Some of this could not be loaded
            </Text>
            <Text className="text-[11px] text-content-muted leading-relaxed">
              {failed.includes('marketplace') && failed.includes('housing')
                ? 'We could not reach your purchases or your tenancies just now.'
                : failed.includes('marketplace')
                  ? 'We could not reach your purchases just now. Any tenancies are shown below.'
                  : 'We could not reach your tenancies just now. Any purchases are shown below.'}
            </Text>
          </View>
        ) : null}

        {rows.length === 0 && failed.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-base font-black text-content-strong mb-1 text-center">
              Nothing here yet
            </Text>
            <Text className="text-xs text-content-muted text-center leading-relaxed">
              Things you buy and places you rent through Diaspora will appear here.
            </Text>
          </View>
        ) : null}

        {rows.map((row) => (
          <View
            key={`${row.subject}-${row.id}`}
            className="bg-surface-card border border-subtle rounded-2xl p-4 mt-3"
          >
            <Text className="text-[10px] font-bold text-content-muted uppercase mb-1">
              {row.subject === 'seller' ? 'Purchase' : 'Tenancy'} · {row.status}
            </Text>

            <Text className="text-[14px] font-black text-content-strong">{row.listingTitle}</Text>

            {row.counterpartyName ? (
              <Text className="text-[11px] text-content-muted mt-0.5">
                {row.subject === 'seller' ? 'from' : 'with'} {row.counterpartyName}
              </Text>
            ) : null}

            {/* The control exists only where the server would accept the review.
              * `isRateable` is the module's own rule — `Completed` for a
              * purchase, `Occupied` for a tenancy — so this cannot offer a
              * button that is then refused. A signed lease is deliberately not
              * enough: it is a promise, not a tenancy. */}
            {row.isRateable && row.counterpartyId ? (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    `/write-review?subject=${row.subject}&subjectId=${encodeURIComponent(
                      row.counterpartyId as string,
                    )}&reservationId=${encodeURIComponent(row.id)}` as never,
                  )
                }
                className="bg-primary-500 rounded-full py-2.5 mt-3 items-center"
              >
                <Text className="text-white text-[12px] font-black">
                  {row.subject === 'seller' ? 'Rate this purchase' : 'Rate this tenancy'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
