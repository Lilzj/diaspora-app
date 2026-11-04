// ─────────────────────────────────────────────────────────────────────────────
// Grants the platform posts — the administrators' list (since 4 Nov 2026)
//
// Members saw two grants the backend seeded at every startup and took them for
// the platform's own (UAT, 3 Nov 2026, item 7: "the platform admin did not
// post this grants"). Administrators post them here: create, edit, publish,
// unpublish and close, in the currency and countries they choose.
//
// The permission is the server's (`creator:programme:manage`). Settings links
// here only for a member who holds it, and a refusal is shown as a refusal,
// never as an empty list. Under `/moderation` for the reason
// `community-deletions.tsx` gives: it is the prefix the app restores.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useAdminGrants, useGrantAdminActions } from '@/hooks/grant-admin';
import { isGrantAdminRefusal, type AdminGrant, type GrantWindowAction } from '@/lib/creator/grant-admin-api';
import { grantCategoryLabel } from '@/lib/creator-economy';

/** "₦500,000", or "NGN 500,000" where the phone cannot format the currency. */
function formatGrantAmount(money: AdminGrant['fundingAmount']): string {
  const value = money.minorUnits / 10 ** money.exponent;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: money.currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${money.currency} ${value.toLocaleString()}`;
  }
}

function stateWords(grant: AdminGrant): string {
  if (!grant.isPublished) return 'Not published';
  switch (grant.state) {
    case 'Open':
      return 'Open';
    case 'ClosingSoon':
      return 'Closing soon';
    case 'Closed':
      return 'Closed';
    default:
      return 'Opens later';
  }
}

export default function GrantAdminScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const { grants, isLoading, error, refetch, isRefetching } = useAdminGrants();
  const { setWindow } = useGrantAdminActions();

  const act = (grant: AdminGrant, action: GrantWindowAction) => {
    const run = () =>
      setWindow.mutate(
        { grantId: grant.grantId, action },
        {
          onError: () =>
            showAlert({ type: 'error', title: 'Not changed', message: 'The grant could not be changed. Try again.' }),
        },
      );

    if (action === 'close') {
      showAlert({
        type: 'warning',
        title: 'Close this grant now?',
        message: `${grant.title} stops taking applications straight away. Applications already sent are kept.`,
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close it', style: 'destructive', onPress: run },
        ],
      });
      return;
    }
    run();
  };

  const refused = error && isGrantAdminRefusal(error);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Grants" />
      <ScrollEndScrollView
        className="flex-1 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <Text className="text-xs text-content-muted leading-relaxed mb-4">
          The grants members see under Creator Studio. Post one in the currency and countries it is for;
          close it to stop applications, or unpublish it to take it off members’ lists.
        </Text>

        {!refused ? (
          <TouchableOpacity
            onPress={() => router.push('/moderation/grants/edit' as never)}
            accessibilityRole="button"
            testID="grant-admin-new"
            className="bg-primary-600 rounded-2xl py-3.5 items-center mb-5"
          >
            <Text className="text-white text-sm font-black">New grant</Text>
          </TouchableOpacity>
        ) : null}

        {isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator />
          </View>
        ) : null}

        {refused ? (
          <View className="bg-surface-card border border-subtle rounded-2xl p-4" accessibilityRole="alert">
            <Text className="text-sm font-black text-content-primary">You can’t manage grants</Text>
            <Text className="text-xs text-content-muted mt-1 leading-relaxed">
              Posting and closing grants is for the platform’s administrators.
            </Text>
          </View>
        ) : error ? (
          <Text className="text-xs text-error-default" accessibilityRole="alert">
            The grants could not be loaded. Pull to try again.
          </Text>
        ) : null}

        {!isLoading && !error && grants.length === 0 ? (
          <Text className="text-xs text-content-muted text-center py-8">
            No grants yet. Members see none until you post one.
          </Text>
        ) : null}

        {grants.map((grant) => {
          const isOpen = grant.isPublished && (grant.state === 'Open' || grant.state === 'ClosingSoon');
          return (
            <View key={grant.grantId} className="bg-surface-card border border-subtle rounded-2xl p-4 mb-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-primary-600">
                    {grantCategoryLabel(grant.category)}
                  </Text>
                  <Text className="text-sm font-black text-content-primary mt-0.5">{grant.title}</Text>
                  <Text className="text-[11px] text-content-muted mt-0.5">
                    {stateWords(grant)} · {grant.countryCodes.length ? grant.countryCodes.join(', ') : 'Everywhere'} ·{' '}
                    {grant.applicantCount === 1 ? '1 application' : `${grant.applicantCount} applications`}
                  </Text>
                </View>
                <Text className="text-sm font-black text-content-primary">{formatGrantAmount(grant.fundingAmount)}</Text>
              </View>

              <View className="flex-row flex-wrap mt-3">
                <TouchableOpacity
                  onPress={() => router.push(`/moderation/grants/edit?id=${grant.grantId}` as never)}
                  accessibilityRole="button"
                  className="border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
                >
                  <Text className="text-[11px] font-bold text-content-secondary">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => act(grant, grant.isPublished ? 'unpublish' : 'publish')}
                  disabled={setWindow.isPending}
                  accessibilityRole="button"
                  className="border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
                >
                  <Text className="text-[11px] font-bold text-content-secondary">
                    {grant.isPublished ? 'Unpublish' : 'Publish'}
                  </Text>
                </TouchableOpacity>
                {isOpen ? (
                  <TouchableOpacity
                    onPress={() => act(grant, 'close')}
                    disabled={setWindow.isPending}
                    accessibilityRole="button"
                    className="border border-subtle rounded-full px-3 py-1.5 mr-2 mb-2"
                  >
                    <Text className="text-[11px] font-bold text-error-default">Close now</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
