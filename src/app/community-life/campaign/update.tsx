// ─────────────────────────────────────────────────────────────────────────────
// Post a campaign update (§17, §30)
//
// §15's terms ask a campaign organizer to say how the money was spent. This is
// where they do it. Role-gated: refused server-side when the caller does not
// manage the campaign.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { useCampaign, usePublishCampaignUpdate } from '@/hooks/community-life';
import type { FinancialError } from '@/lib/financial-errors';
import { backOr } from '@/lib/navigation';

export default function CampaignUpdateScreen() {
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>();
  const { tokens } = useTheme();

  const { campaign, isLoading, isError, error, refetch } = useCampaign(campaignId);
  const publish = usePublishCampaignUpdate();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <CommunityScreen
      title="Post an update"
      subtitle={campaign?.title}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      footer={
        campaign?.canManage ? (
          <View>
            {publish.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={publish.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label="Publish update"
              icon="megaphone-outline"
              busy={publish.isPending}
              disabled={publish.isPending || !title.trim() || !body.trim()}
              onPress={() =>
                publish.mutate(
                  {
                    campaignId: campaignId as string,
                    request: { title: title.trim(), body: body.trim() },
                  },
                  { onSuccess: () => backOr() }
                )
              }
            />
            <View className="mt-2.5">
              <SecondaryButton label="Cancel" onPress={() => backOr()} />
            </View>
          </View>
        ) : null
      }
    >
      {!campaign?.canManage ? (
        <View className="px-5 pt-5">
          <EmptyState
            icon="lock-closed-outline"
            title="Not your campaign"
            body="Only the people running this campaign can post an update on it."
          />
        </View>
      ) : (
        <View className="px-5 pt-4">
          <InlineRefusal
            icon="notifications-outline"
            reason="Everyone who has supported this campaign is told when you post an update, through their normal Diaspora notifications."
          />

          <View className="mt-5">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold mb-1"
              nativeID="update-title"
            >
              Title *
            </Text>
            <TextInput
              accessibilityLabel="Update title, required"
              value={title}
              onChangeText={setTitle}
              maxLength={90}
              placeholder="Paperwork lodged with the High Commission"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
                color: tokens.color.text.primary,
                minHeight: 48,
              }}
              className="rounded-xl border px-4 text-sm font-semibold"
            />
          </View>

          <View className="mt-4">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-bold mb-1"
              nativeID="update-body"
            >
              What has happened? *
            </Text>
            <TextInput
              accessibilityLabel="Update body, required"
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={8}
              placeholder="Where the money has gone, what has been done, and what happens next."
              placeholderTextColor={tokens.color.text.placeholder}
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
                color: tokens.color.text.primary,
                minHeight: 180,
                textAlignVertical: 'top',
              }}
              className="rounded-xl border px-4 py-3 text-sm font-semibold"
            />
          </View>

          <View className="mt-5">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-xs font-black tracking-tight mb-2"
            >
              Preview
            </Text>
            <Card>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-sm font-black tracking-tight"
              >
                {title.trim() || 'Your title'}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold mt-1.5 leading-relaxed"
              >
                {body.trim() || 'What you write will appear here.'}
              </Text>
            </Card>
          </View>
        </View>
      )}
    </CommunityScreen>
  );
}
