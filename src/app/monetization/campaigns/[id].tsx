// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Campaign detail and management (Frontend Phase 6)
//
// ⚠ SIMULATED. MON-GAP-001, MON-GAP-002, MON-GAP-006. ⚠
//
// The management half of §13: status, budget, performance, pause, resume and
// cancel, plus the review outcome and the appeal route when one was refused.
//
// Pause and resume are offered *here* and not on a real placement, and that
// asymmetry is the point: a campaign is a simulated entity where a paused state
// is coherent, while `PlacementStatus` on the certified wire has no `Paused`
// member and cancelling a real placement loses the paid days. Offering the same
// button in both places would imply the platform can do something it cannot.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, FinancialErrorView, StatusBanner } from '@/components/financial';
import {
  CampaignBudgetPanel,
  CampaignCreativePreview,
  MonetizationEmpty,
  MonetizationGapNotice,
  MonetizationSection,
  PerformancePanel,
  describeObjective,
  describePlacements,
} from '@/components/monetization';
import { useCampaign, useCampaignLifecycle, useCampaignPerformance } from '@/hooks/monetization-gaps';
import { presentCampaignStatus, isCampaignRunnable } from '@/lib/monetization-catalog';
import { toFinancialError, type FinancialError } from '@/lib/financial-errors';
import { useNotification } from '@/providers/notification-provider';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

export default function CampaignDetailScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useNotification();

  const { id } = useLocalSearchParams<{ id: string }>();

  const { campaign, isLoading, isError, error, refetch, isEnabled } = useCampaign(id);
  const performance = useCampaignPerformance(campaign?.status === 'Draft' ? undefined : id);
  const { pause, resume, cancel } = useCampaignLifecycle();

  const [actionError, setActionError] = useState<FinancialError | null>(null);

  const run = useCallback(
    async (action: 'pause' | 'resume') => {
      if (!campaign) return;
      setActionError(null);
      try {
        if (action === 'pause') await pause.mutateAsync(campaign.campaignId);
        else await resume.mutateAsync(campaign.campaignId);

        showToast({
          type: 'success',
          title: action === 'pause' ? 'Campaign paused' : 'Campaign running',
          message:
            action === 'pause'
              ? 'Nothing is being shown and no budget is being spent.'
              : 'It is being shown again.',
        });
      } catch (cause) {
        setActionError(toFinancialError(cause, 'mutating'));
      }
    },
    [campaign, pause, resume, showToast]
  );

  const handleCancel = useCallback(() => {
    if (!campaign) return;

    showAlert({
      type: 'warning',
      title: 'Cancel this campaign?',
      message:
        'It stops immediately and cannot be restarted. Budget you have not spent is returned to your wallet.',
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel campaign',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await cancel.mutateAsync({ campaignId: campaign.campaignId, reason: 'MemberRequested' });
              showToast({
                type: 'success',
                title: 'Campaign cancelled',
                message: 'It has stopped running.',
              });
            } catch (cause) {
              setActionError(toFinancialError(cause, 'mutating'));
            }
          },
        },
      ],
    });
  }, [campaign, cancel, showAlert, showToast]);

  // Above the early return below, and it has to stay there. A hook after a
  // conditional return runs on some renders and not others, and React aborts
  // the tree with "Rendered more hooks than during the previous render" the
  // moment the condition flips. The same shape crashed the wallet on a cold
  // start; nothing in tsc or the test suite sees it.
  const refreshControl = useRefreshControl(refetch);

  if (!isEnabled) {
    return (
      <Shell title="Campaign">
        <ScrollEndScrollView contentContainerStyle={{ padding: 20 }}>
          <MonetizationGapNotice gapKey="campaigns" />
        </ScrollEndScrollView>
      </Shell>
    );
  }

  if (isError && error) {
    return (
      <Shell title="Campaign">
        <FinancialErrorView error={error} onRetry={refetch} />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell title="Campaign">
        <View className="p-5" accessible accessibilityLabel="Loading the campaign." style={{ gap: 12 }}>
          <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-3xl h-40" />
          <View style={{ backgroundColor: tokens.color.neutral[100], opacity: 0.6 }} className="rounded-2xl h-28" />
        </View>
      </Shell>
    );
  }

  if (!campaign) {
    return (
      <Shell title="Campaign">
        <View className="p-5">
          <MonetizationEmpty
            icon="albums-outline"
            title="Campaign not found"
            message="This campaign is not on your account."
            action={{
              label: 'Your campaigns',
              onPress: () => router.replace('/monetization/campaigns'),
            }}
          />
        </View>
      </Shell>
    );
  }

  const status = presentCampaignStatus(campaign.status);
  const objective = describeObjective(campaign.objective);

  return (
    <Shell title={campaign.name}>
      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        <MonetizationGapNotice gapKey="campaigns" compact />

        <View className="mt-5">
          <StatusBanner
            status={status}
            detail={
              campaign.rejectionReason ??
              campaign.reviewNote ??
              `${objective.label} · ${describePlacements(campaign.placements)}`
            }
          />
        </View>

        {/* A rejection needs its own treatment: the reason, and what to do. */}
        {campaign.status === 'Rejected' ? (
          <View className="mt-3">
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`This campaign was not approved. ${campaign.rejectionReason ?? ''} ${
                campaign.appealableUntil
                  ? `You can ask us to look again until ${new Date(campaign.appealableUntil).toLocaleDateString()}.`
                  : ''
              }`}
              style={{ backgroundColor: tokens.color.error.surface, borderColor: `${tokens.color.error.default}44` }}
              className="rounded-2xl border p-4"
            >
              <Text
                style={{ color: tokens.color.error.default }}
                className="text-[10px] font-black uppercase tracking-widest mb-1"
              >
                Not approved
              </Text>
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-semibold leading-relaxed">
                {campaign.rejectionReason ?? 'This campaign was not approved to run.'}
              </Text>
              {campaign.appealableUntil ? (
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-medium leading-relaxed mt-2"
                >
                  You can ask us to look again until{' '}
                  {new Date(campaign.appealableUntil).toLocaleDateString()}. You have not been charged.
                </Text>
              ) : null}
            </View>

            <View className="mt-3">
              <MonetizationGapNotice gapKey="approval" compact />
            </View>
          </View>
        ) : null}

        <View className="mt-7">
          <MonetizationSection title="Budget">
            <CampaignBudgetPanel campaign={campaign} />
          </MonetizationSection>
        </View>

        <MonetizationSection title="What it says">
          <CampaignCreativePreview
            creative={campaign.creative}
            placementLabel={describePlacements(campaign.placements)}
          />
        </MonetizationSection>

        <MonetizationSection title="Details">
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4"
          >
            <Row label="Goal" value={objective.label} />
            <Row label="Judged by" value={objective.leadMetric} />
            <Row label="Shown in" value={describePlacements(campaign.placements)} />
            <Row label="Starts" value={new Date(campaign.startsAt).toLocaleDateString()} />
            <Row label="Ends" value={new Date(campaign.endsAt).toLocaleDateString()} />
            <Row label="Budget type" value={campaign.budgetKind === 'Total' ? 'Total' : 'Per day'} />
          </View>
        </MonetizationSection>

        {campaign.status !== 'Draft' ? (
          <MonetizationSection title="Performance">
            <PerformancePanel
              report={performance.report}
              isLoading={performance.isLoading}
              hideNotice
              title="Since it started"
            />
          </MonetizationSection>
        ) : null}

        <MonetizationSection title="Manage">
          <View style={{ gap: 8 }}>
            {isCampaignRunnable(campaign.status) ? (
              campaign.status === 'Paused' ? (
                <Action
                  icon="play-circle-outline"
                  label="Start it again"
                  hint="It goes back to being shown, spending from the budget that is left."
                  onPress={() => run('resume')}
                  isBusy={resume.isPending}
                />
              ) : (
                <Action
                  icon="pause-circle-outline"
                  label="Pause it"
                  hint="It stops being shown and stops spending. You can start it again later."
                  onPress={() => run('pause')}
                  isBusy={pause.isPending}
                />
              )
            ) : null}

            {!status.isTerminal ? (
              <Action
                icon="stop-circle-outline"
                label="Cancel it"
                hint="It stops for good. Budget you have not spent comes back to your wallet."
                tone="destructive"
                onPress={handleCancel}
                isBusy={cancel.isPending}
              />
            ) : null}

            {status.isTerminal ? (
              <Action
                icon="copy-outline"
                label="Start a similar campaign"
                hint="Opens the builder so you can set one up again."
                onPress={() => router.push('/monetization/campaigns/create')}
              />
            ) : null}
          </View>

          {actionError ? (
            <View className="mt-3">
              <FinancialErrorInline error={actionError} />
            </View>
          ) : null}
        </MonetizationSection>
      </ScrollEndScrollView>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title={title} showBack />
      {children}
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-start justify-between py-1.5"
    >
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold mr-3">
        {label}
      </Text>
      <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-right text-xs font-bold">
        {value}
      </Text>
    </View>
  );
}

function Action({
  icon,
  label,
  hint,
  onPress,
  tone = 'default',
  isBusy = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  tone?: 'default' | 'destructive';
  isBusy?: boolean;
}) {
  const { tokens } = useTheme();
  const colour = tone === 'destructive' ? tokens.color.error.default : tokens.color.text.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isBusy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tone === 'destructive' ? `${tokens.color.error.default}44` : tokens.color.border.default,
        opacity: isBusy ? 0.6 : 1,
      }}
      className="flex-row items-center rounded-2xl border p-4"
    >
      <Ionicons name={icon as never} size={19} color={colour} style={{ marginRight: 12 }} />
      <View className="flex-1">
        <Text style={{ color: colour }} className="text-sm font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-0.5"
        >
          {hint}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
