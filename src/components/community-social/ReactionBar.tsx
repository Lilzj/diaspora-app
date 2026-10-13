// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — The reaction row (Wave D-2b)
//
// Two things this component refuses to do:
//
// **1. It does not ship its own list of reactions.** The keys come from
// `GET /community/capabilities`, filtered by `appliesTo` for the content type
// in hand. A hardcoded list would offer a member a reaction the deployment
// refuses, or hide one it accepts, and either is invisible until somebody taps
// it. Until capabilities resolve there are no buttons — an empty row for half a
// second is better than four buttons that turn out to be wrong.
//
// **2. It does not read `reactions` or `summary` by name.** The identical tally
// hangs off a post and a comment under `reactions` and off a reaction response
// under `summary`, so `readReactionSummary` is what narrows it. A component that
// reached for the name it remembered would render an empty row for half the
// records it is handed.
//
// The capability list is **PascalCase** (`"Post"`, `"Comment"`) where the
// content type is camelCase (`"post"`) — the one PascalCase island in this
// module, because that list is persisted joined and split verbatim. Nothing
// here compares them directly; `reactionsFor` does it through
// `capabilityAppliesTo`.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { readReactionSummary } from '@/lib/community-social-api';
import { useCommunityCapabilities } from '@/hooks/community-social';
import type {
  CommentResponse,
  ContentEngagementResponse,
  CommunityContentType,
  CommunityPostResponse,
  CommunityReactionKey,
} from '@/types/community-social';

import { reactionGlyph } from './labels';

interface ReactionBarProps {
  /** A post or a comment. Either way the tally is read through the narrower. */
  content: CommunityPostResponse | CommentResponse | ContentEngagementResponse;
  contentType: CommunityContentType;
  onReact: (reactionKey: CommunityReactionKey) => void;
  onUnreact: (reactionKey: CommunityReactionKey) => void;
  isPending?: boolean;
  compact?: boolean;
}

export function ReactionBar({
  content,
  contentType,
  onReact,
  onUnreact,
  isPending = false,
  compact = false,
}: ReactionBarProps) {
  const { capabilities, reactionsFor } = useCommunityCapabilities();

  const summary = readReactionSummary(content);
  const mine = summary?.myReactionKey ?? null;

  // Empty until capabilities arrive. Deliberate — see the header.
  const keys = reactionsFor(contentType);

  const countFor = (key: CommunityReactionKey): number =>
    summary?.counts.find((entry) => entry.reactionKey === key)?.count ?? 0;

  const glyphFor = (key: CommunityReactionKey): string =>
    capabilities?.reactions.find((reaction) => reaction.key === key)?.glyph ?? reactionGlyph(key);

  const labelFor = (key: CommunityReactionKey): string =>
    capabilities?.reactions.find((reaction) => reaction.key === key)?.label ?? key;

  if (keys.length === 0) return null;

  return (
    <View className="flex-row items-center flex-wrap">
      {keys.map((key) => {
        const isMine = mine === key;
        const count = countFor(key);

        return (
          <TouchableOpacity
            key={key}
            accessible
            accessibilityRole="button"
            accessibilityState={{ selected: isMine, disabled: isPending }}
            accessibilityLabel={`${labelFor(key)}${count > 0 ? `, ${count}` : ''}. ${
              isMine ? 'Tap to remove your reaction.' : 'Tap to react.'
            }`}
            disabled={isPending}
            // Un-reacting is a 200 even when there was nothing to remove — a
            // reaction is set membership rather than a resource. That is the
            // opposite of unfollow, which 404s, and the two are deliberately
            // not written as one helper anywhere in this codebase.
            onPress={() => (isMine ? onUnreact(key) : onReact(key))}
            activeOpacity={0.75}
            className={`flex-row items-center rounded-full border mr-1.5 mb-1 ${
              compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
            } ${isMine ? 'bg-primary-50 border-primary-200' : 'bg-surface-card border-subtle'}`}
          >
            <Text className={compact ? 'text-xs' : 'text-sm'}>{glyphFor(key)}</Text>
            {count > 0 ? (
              <Text
                className={`ml-1 font-black ${compact ? 'text-[9px]' : 'text-[10px]'} ${
                  isMine ? 'text-primary-600' : 'text-content-muted'
                }`}
              >
                {count}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
