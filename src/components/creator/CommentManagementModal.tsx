// ─────────────────────────────────────────────────────────────────────────────
// Comment management — why this sheet now shows a reason instead of a thread
//
// ── What it used to do ───────────────────────────────────────────────────────
//
// Every comment it rendered came from `mockCommentsMap` in `mocks/creator-data`,
// keyed by fixture ids (`cnt-guide-1`, `cm-def-1`, …). When the map had no entry
// for an item — which was most of them — the component fell back to a **hard-
// coded comment invented inline**: "Aisha Bello", an Unsplash portrait, "Is this
// still active? Sending you a quick message regarding local details.", four
// hours ago. Every member, on every account, opened this sheet and was shown a
// named stranger asking about *their* listing.
//
// That is the worst-behaved fixture in the workspace, because a comment names a
// person. It invents a member of the community, attributes words to them, and
// puts a Reply box under those words. Somebody typing a considered answer to
// Aisha Bello was answering nobody, and the sheet used to toast back that their
// reply had been sent and published to that reader. A previous pass took the
// false claims out of those toasts; this pass takes out the thing they were
// apologising for.
//
// ── Why it is not wired to the real comments route ───────────────────────────
//
// The route exists and is already certified:
//
//   GET /community/content/{contentType}/{contentId}/comments
//     → `fetchContentComments` (lib/community-social-api.ts)
//     → `useContentComments(contentType, contentId)` (hooks/community-social.ts)
//
// `app/guide/[id].tsx` calls it for real, today, and renders a real thread.
//
// It cannot be called from here, for a reason that is upstream of this file.
// This sheet is opened from `sections/WorkspaceSection` and `QuickActionsMenu`
// with a `UnifiedContentItem` out of `store/content-management.ts` — and that
// store is now empty, because **no route lists a creator's own content**. So no
// item ever reaches this sheet, and if one did it would carry neither of the two
// things the route needs:
//
//   * a `contentId` the server can find. The route takes a Guid; the workspace
//     shape carries a display id.
//   * a `contentType` in the route's vocabulary. `CommunityContentType` is
//     'post' | 'comment' | 'guide' | 'event' | 'listing' | 'job' |
//     'organization' | 'provider'. The workspace's `ContentType` is a different
//     seven-member set, and two of its members ('Marketplace', 'Housing') both
//     plausibly mean 'listing' while 'Update' has no clear counterpart at all.
//     Guessing a segment produces a 404 or, worse, a thread from the wrong
//     content — so no mapping is invented here.
//
// Wiring this sheet is therefore downstream of building the workspace against
// real per-domain routes (`GET /guides/mine`, `/marketplace/listings/mine`,
// `/housing/listings/mine`), which is where a Guid and an unambiguous type would
// come from. Until then the sheet says which of those two things is missing
// rather than filling the gap with a person who does not exist.
//
// ── What the member sees now ─────────────────────────────────────────────────
//
// One panel, no controls. The pin, flag and reply affordances are gone rather
// than disabled: an inert control invites a second press, and a Reply box with
// nothing behind it invites somebody to write a paragraph into a void. Where a
// member can genuinely act on comments — under a guide, an event, a post — the
// community screens do it properly against the route above.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { Sheet } from '@/components/overlays/AppModal';
import { UnifiedContentItem } from '@/types/creator';

interface CommentManagementModalProps {
  item: UnifiedContentItem | null;
  visible: boolean;
  onClose: () => void;
}

export const CommentManagementModal: React.FC<CommentManagementModalProps> = ({ item, visible, onClose }) => {
  if (!item) return null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Comment Management"
      subtitle={item.title}
      height="55%"
      scrollable={false}
      testID="comment-management-sheet"
    >
      <View className="bg-surface-background border border-subtle rounded-2xl p-5">
        <Text className="text-sm font-black text-content-primary mb-2">
          Diaspora cannot load the comments on this item
        </Text>

        <Text className="text-xs text-content-secondary leading-relaxed mb-3">
          This workspace does not yet know the server identity of the things you have published, so there is
          no thread to fetch and nothing to reply to, pin or report from here. Nothing is hidden from you —
          the comments simply cannot be looked up.
        </Text>

        <Text className="text-xs text-content-secondary leading-relaxed">
          Comments on a guide, event or post are real and work normally: open the item in the community and
          the discussion under it is live, including replying and reporting.
        </Text>
      </View>
    </Sheet>
  );
};
