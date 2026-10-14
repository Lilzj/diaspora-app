// ─────────────────────────────────────────────────────────────────────────────
// Workspace — everything you have published
//
// Lifted out of `/profile/creator-dashboard` unchanged. Same chips, same
// search, same cards-versus-timeline toggle, same draft and archive centres,
// same modals, same stores. This file exists so `/creator` can render the
// section without the 619-line screen it used to live inside.
//
// ── The one thing that did change ────────────────────────────────────────────
//
// The active category chip was `bg-surface-inverse` with `text-content-inverse`
// — the app's near-black, which is for inverted surfaces rather than selection.
// It is `primary-500` now, like every other selected chip in the app, and like
// the organisation role filters and the "Publishing as" pill that carried the
// same near-black for the same reason.
//
// Nothing else was touched. The design is the one that shipped.
//
// ── What did not change, and is worth naming ─────────────────────────────────
//
// This section reads five zustand stores directly. Four of them are still local
// and synchronous; **`content-management` is not** — it now fans out over
// `GET /guides/mine`, `/marketplace/listings/mine`, `/housing/listings/mine` and
// `/community-life/events/mine`, so this section has a real loading state, a
// real error state and a real coverage note for the verticals a member has not
// enrolled in.
//
// Everything the section used to say about that data was written when there was
// none: *"Diaspora cannot list your published items, drafts, archive or activity
// yet — there is no route that serves them."* Four routes serve them. The
// sentences that turned out to be stale are replaced below; the one that did
// not — activity history, which really has no read route — is marked as
// re-checked so the next sweep does not have to re-derive it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/store/auth';

import { ArchiveCard } from '@/components/creator/ArchiveCard';
import { BulkActionToolbar } from '@/components/creator/BulkActionToolbar';
import { CommentManagementModal } from '@/components/creator/CommentManagementModal';
import { ContentCard } from '@/components/creator/ContentCard';
import { ContentHealthCenterModal } from '@/components/creator/ContentHealthCenterModal';
import { CreatorSearchBar } from '@/components/creator/CreatorSearchBar';
import { DraftCard } from '@/components/creator/DraftCard';
import { InsightCard } from '@/components/creator/InsightCard';
import { QuickActionsMenu } from '@/components/creator/QuickActionsMenu';
import { TimelineItem } from '@/components/creator/TimelineItem';
import { WorkspaceFilterBar } from '@/components/creator/WorkspaceFilterBar';
import { useContentManagementStore } from '@/store/content-management';
import { useCreatorDraftStore } from '@/store/creator-draft';
import { useDeviceDrafts } from '@/lib/device-drafts';
import { useCreatorTimelineStore } from '@/store/creator-timeline';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';
import type { UnifiedContentItem } from '@/types/creator';

interface WorkspaceSectionProps {
  /** Raised so the host screen can open the health centre from elsewhere. */
  onOpenHealthCentre?: () => void;
}

export function WorkspaceSection({ onOpenHealthCentre }: WorkspaceSectionProps) {
  const workspaceStore = useCreatorWorkspaceStore();
  const contentStore = useContentManagementStore();
  const draftStore = useCreatorDraftStore();
  // Unfinished business, home and marketplace wizards, kept on this phone (14 Oct 2026).
  const deviceDrafts = useDeviceDrafts();
  const timelineStore = useCreatorTimelineStore();

  // Local, as it was: the store holds filters and selection, not the view
  // toggle, and the toggle is a per-visit preference rather than app state.
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isHealthCenterOpen, setIsHealthCenterOpen] = useState(false);
  const [selectedQuickActionItem, setSelectedQuickActionItem] = useState<UnifiedContentItem | null>(null);
  const [selectedCommentItem, setSelectedCommentItem] = useState<UnifiedContentItem | null>(null);
  const [selectedInsightItem, setSelectedInsightItem] = useState<UnifiedContentItem | null>(null);

  // ── Loading the real lists ──────────────────────────────────────────────
  //
  // The identity is set *before* the fetch rather than mapped onto the rows
  // afterwards, so a row can never exist without an author. It is the session's
  // own member and nothing else: the store used to hard-code a name, a handle,
  // an avatar and a verification tick, and attributing somebody's content to
  // another member is a worse error than a wrong count.
  const user = useAuthStore((state) => state.user);
  const setPublishingIdentity = useContentManagementStore((state) => state.setPublishingIdentity);
  const loadContent = useContentManagementStore((state) => state.loadContent);
  const loadActivity = useCreatorTimelineStore((state) => state.load);

  useEffect(() => {
    if (!user) return;
    setPublishingIdentity({
      id: user.userId,
      name: user.fullName,
      type: 'personal',
      avatar: user.profilePhoto ?? '',
      handle: '',
      verified: false,
      followerCount: 0,
    });
    loadContent();

    // BG-06. The activity history is read alongside the content lists rather
    // than when the Timeline toggle is first pressed: the toggle is a per-visit
    // preference and a member who flips it should not then wait for a request.
    loadActivity(user.fullName);
  }, [user, setPublishingIdentity, loadContent, loadActivity]);

  // ── Filtering, exactly as it was ──────────────────────────────────────────
  const filteredContentItems = contentStore.items.filter((item) => {
    if (workspaceStore.filters.identityId !== 'all' && item.publishingIdentity.id !== workspaceStore.filters.identityId) {
      return false;
    }

    if (workspaceStore.activeCategory !== 'all') {
      const map: Record<string, string> = {
        guides: 'Guide',
        updates: 'Update',
        providers: 'Provider',
        marketplace: 'Marketplace',
        housing: 'Housing',
        jobs: 'Job',
        events: 'Event',
      };
      const wanted = map[workspaceStore.activeCategory];
      if (wanted && item.contentType !== wanted) return false;
    }

    if (workspaceStore.filters.searchQuery) {
      const needle = workspaceStore.filters.searchQuery.toLowerCase();
      if (!item.title.toLowerCase().includes(needle)) return false;
    }

    if (workspaceStore.filters.statusFilter.length > 0) {
      if (!workspaceStore.filters.statusFilter.includes(item.currentStatus)) return false;
    }

    return true;
  });

  // Drafts are not a separate fetch. `GET /guides/mine` returns every guide in
  // any state with its `status`, so the drafts tab is a view over rows already
  // in hand rather than a fifth request.
  const draftItems = contentStore.items.filter((item) => item.currentStatus === 'Draft');

  const counts = {
    all: contentStore.items.length,
    guides: contentStore.items.filter((i) => i.contentType === 'Guide').length,
    updates: contentStore.items.filter((i) => i.contentType === 'Update').length,
    providers: contentStore.items.filter((i) => i.contentType === 'Provider').length,
    marketplace: contentStore.items.filter((i) => i.contentType === 'Marketplace').length,
    housing: contentStore.items.filter((i) => i.contentType === 'Housing').length,
    jobs: contentStore.items.filter((i) => i.contentType === 'Job').length,
    events: contentStore.items.filter((i) => i.contentType === 'Event').length,
    drafts: draftItems.length + draftStore.drafts.length + deviceDrafts.drafts.length,
    archived: contentStore.archivedItems.length,
  };

  const openHealthCentre = () => {
    setIsHealthCenterOpen(true);
    onOpenHealthCentre?.();
  };

  return (
    <View>
      {/*
        ── Why this banner exists ──────────────────────────────────────────────

        It used to warn that everything below was sample content, because the
        five stores it reads opened seeded from `mocks/creator-data.ts` and
        showed every member the same fabricated body of work. Those fixtures are
        gone: `store/content-management`, `store/creator-draft` and
        `store/creator-timeline` all start empty and say why.

        So the banner's job changed. The danger is no longer that a member
        believes fabricated listings are theirs — it is that they read the empty
        lists below as "I have published nothing", which is a different false
        claim. The platform has no route that lists a creator's own content,
        drafts, archive or activity; it cannot tell you what you have, so this
        section does not know either, and it must not imply zero.

        This banner comes out when the workspace is rebuilt against the per-
        domain routes that do exist — `GET /guides/mine`, `/guides/mine/drafts`,
        `/marketplace/listings/mine`, `/housing/listings/mine`.
      */}
      {/* Two different sentences, because they are two different facts.

          `coverageNote` is about *this member*: marketplace and housing refuse
          their `/mine` routes until a seller or landlord profile exists, so a
          guide author is told plainly which lists are not theirs rather than
          shown an error. It is null when every vertical answered, and then no
          banner appears at all — which is the ordinary case and should look
          ordinary.

          The second sentence is about the *controls*, and it is still true:
          reading is wired, writing is not. There is no unified status route, no
          duplicate route and no bulk route in any module. */}
      {contentStore.coverageNote ? (
        <View className="bg-surface-muted border border-subtle rounded-2xl px-4 py-3 mb-3">
          <Text className="text-xs font-black text-content-strong">Some lists are not shown</Text>
          <Text className="text-[11px] text-content-secondary leading-relaxed mt-1">
            {contentStore.coverageNote}
          </Text>
        </View>
      ) : null}

      {/* Narrowed twice over. It began as "Preview — sample content removed …
          Diaspora cannot list your published items, drafts, archive or activity
          yet", which stopped being true when the fan-out landed; then as a flat
          "read-only", which stopped being true when archive, restore, delete and
          the two real status transitions were wired.

          What remains unavailable is specific and is named specifically. A
          member should be able to read this and predict exactly which control
          will work. */}
      <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-3">
        <Text className="text-xs font-black text-content-strong">What you can change here</Text>
        <Text className="text-[11px] text-content-secondary leading-relaxed mt-1">
          Archive, restore, delete, duplicate, and marking an item sold or occupied all take effect.
          States like Reserved, Paused, Interviewing and Filled are not tracked by any part of the
          platform — open the item itself for anything else.
        </Text>
      </View>

      {/* The section has a loading state for the first time: four HTTP reads
          rather than five synchronous stores. Shown only on the first load —
          `items.length` is the guard — so a pull-to-refresh does not replace a
          list the member is reading with a spinner. */}
      {contentStore.isLoading && contentStore.items.length === 0 ? (
        <View className="py-10 items-center" accessibilityRole="progressbar">
          <ActivityIndicator />
          <Text className="text-[11px] text-content-muted mt-2">Reading what you have published…</Text>
        </View>
      ) : null}

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
        {[
          { key: 'all', label: `All (${counts.all})` },
          { key: 'guides', label: `Guides (${counts.guides})` },
          { key: 'marketplace', label: `Marketplace (${counts.marketplace})` },
          { key: 'housing', label: `Housing (${counts.housing})` },
          { key: 'jobs', label: `Jobs (${counts.jobs})` },
          { key: 'events', label: `Events (${counts.events})` },
          { key: 'providers', label: `Providers (${counts.providers})` },
          { key: 'updates', label: `Updates (${counts.updates})` },
          { key: 'drafts', label: `Drafts (${counts.drafts})` },
          { key: 'archived', label: `Archived (${counts.archived})` },
        ].map((cat) => {
          const isActive = workspaceStore.activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => workspaceStore.setActiveCategory(cat.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`px-3 py-1.5 rounded-xl border mr-2 ${
                isActive ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-content-secondary'}`}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <CreatorSearchBar onOpenFilterModal={() => setIsFilterModalOpen(true)} />

      {/* Cards versus timeline */}
      <View className="flex-row justify-between items-center mb-3 px-1">
        <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest">
          {/* Was "Showing N Published Items", and it counted drafts. Harmless
              while the list was empty for everybody; wrong the moment it filled
              from `GET /guides/mine`, which returns every guide in any state —
              two drafts were labelled published on the first device run. */}
          Showing {filteredContentItems.length}{' '}
          {filteredContentItems.length === 1 ? 'item' : 'items'}
        </Text>

        <View className="flex-row bg-surface-card border border-subtle rounded-xl p-0.5">
          <TouchableOpacity
            onPress={() => setViewMode('grid')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'grid' }}
            className={`px-2.5 py-1 rounded-lg ${viewMode === 'grid' ? 'bg-primary-500' : 'bg-transparent'}`}
          >
            <Text
              className={`text-[9px] font-black ${
                viewMode === 'grid' ? 'text-white' : 'text-content-muted'
              }`}
            >
              Cards View
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setViewMode('timeline')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'timeline' }}
            className={`px-2.5 py-1 rounded-lg ${
              viewMode === 'timeline' ? 'bg-primary-500' : 'bg-transparent'
            }`}
          >
            <Text
              className={`text-[9px] font-black ${
                viewMode === 'timeline' ? 'text-white' : 'text-content-muted'
              }`}
            >
              Timeline Log
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Draft centre */}
      {workspaceStore.activeCategory === 'drafts' && (
        <View>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
              Draft Center ({draftItems.length + draftStore.drafts.length + deviceDrafts.drafts.length})
            </Text>
            {/*
              Was `draftStore.createDraft(...)`, which pushed a card badged
              "Autosaved" into a store with nothing behind it — a promise that
              unfinished work was safe, made by the one part of the app that
              could not keep it. There is no drafts route to create against, so
              this opens the guide editor, which does reach a server.
            */}
            <TouchableOpacity
              onPress={() => router.push('/guide/create')}
              className="bg-primary-500 px-3 py-1 rounded-xl"
            >
              <Text className="text-xs font-black text-white">+ New Guide</Text>
            </TouchableOpacity>
          </View>

          {/* Real drafts, read from the same fan-out as everything else.

              `store/creator-draft.ts` is still here and still empty, and its own
              header says why: `CreatorDraft` is a seven-domain shape with
              `progressPercent`, `estimatedCompletion` and `autoSaveStatus`
              fields no route populates, and filling those in client-side is the
              invention that store was emptied to remove. So the *unfinished
              work the server actually holds* is rendered as content — which is
              what it is — and the local store is left to whatever a future
              rebuild does with it.

              This matters more than it looks. Between the fan-out landing and
              this block, the empty state read "No drafts yet" over a list that
              was still reading the fixture store — a false claim about a
              member's own unfinished work, introduced by the fix for a
              different false claim. Found in the second sweep. */}
          {draftItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              isMultiSelectMode={workspaceStore.isMultiSelectMode}
              isSelected={workspaceStore.selectedItemIds.includes(item.id)}
              onToggleSelect={(id) => workspaceStore.toggleSelectItem(id)}
              onOpenQuickActions={(target) => setSelectedQuickActionItem(target)}
              onOpenHealthModal={openHealthCentre}
              onOpenComments={(target) => setSelectedCommentItem(target)}
              onCardPress={(target) => setSelectedInsightItem(target)}
            />
          ))}

          {draftStore.drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}

          {/* Saved with "Save & Exit", or left part-way: on this phone, not yet on Diaspora. */}
          {deviceDrafts.drafts.map((draft) => (
            <View
              key={draft.kind}
              className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3"
              accessibilityLabel={`Unfinished ${draft.label}: ${draft.title}`}
            >
              <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest">
                {draft.label} · not published · on this phone
              </Text>
              <Text className="text-base font-black text-content-primary mt-1">{draft.title}</Text>
              {draft.savedAt ? (
                <Text className="text-xs text-content-muted mt-0.5">
                  Saved {new Date(draft.savedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
              <View className="flex-row mt-3">
                <TouchableOpacity
                  onPress={() => router.push(draft.route as never)}
                  accessibilityRole="button"
                  className="bg-primary-500 px-4 py-2 rounded-xl mr-2"
                >
                  <Text className="text-xs font-black text-white">Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deviceDrafts.discard(draft.kind)}
                  accessibilityRole="button"
                  className="bg-surface-muted px-4 py-2 rounded-xl"
                >
                  <Text className="text-xs font-black text-content-secondary">Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {draftItems.length === 0 && draftStore.drafts.length === 0 && deviceDrafts.drafts.length === 0 && (
            <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
              <Text className="text-3xl mb-2">✏️</Text>
              {/* Was "Diaspora cannot list your drafts yet — there is no route
                  for them". `GET /guides/mine/drafts` is that route and answers
                  200, and `GET /guides/mine` carries the same rows with their
                  status, so an empty list here now means an empty list. */}
              <Text className="text-xs font-bold text-content-strong text-center">
                No drafts yet
              </Text>
              <Text className="text-[11px] text-content-muted text-center leading-relaxed mt-1 max-w-[280px]">
                Anything you start and do not publish will wait here.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Archive centre */}
      {workspaceStore.activeCategory === 'archived' && (
        <View>
          <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
            Archive Center ({contentStore.archivedItems.length})
          </Text>

          {contentStore.archivedItems.map((arch) => (
            <ArchiveCard key={arch.id} item={arch} />
          ))}

          {contentStore.archivedItems.length === 0 && (
            <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
              <Text className="text-3xl mb-2">📦</Text>
              {/* Was "Diaspora cannot list your archive yet — no route serves
                  archived content". The three listing routes bind
                  `status=Archived`, and `fetchWorkspaceArchive` asks all three,
                  so an empty archive here is an empty archive. */}
              <Text className="text-xs font-bold text-content-strong text-center">
                Nothing archived
              </Text>
              <Text className="text-[11px] text-content-muted text-center leading-relaxed mt-1 max-w-[280px]">
                Anything you archive keeps its history and can be restored from the item itself.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Published content */}
      {workspaceStore.activeCategory !== 'drafts' && workspaceStore.activeCategory !== 'archived' && (
        <View>
          {viewMode === 'grid' ? (
            filteredContentItems.map((item: UnifiedContentItem) => (
              <ContentCard
                key={item.id}
                item={item}
                isMultiSelectMode={workspaceStore.isMultiSelectMode}
                isSelected={workspaceStore.selectedItemIds.includes(item.id)}
                onToggleSelect={(id) => workspaceStore.toggleSelectItem(id)}
                onOpenQuickActions={(target) => setSelectedQuickActionItem(target)}
                onOpenHealthModal={openHealthCentre}
                onOpenComments={(target) => setSelectedCommentItem(target)}
                onCardPress={(target) => setSelectedInsightItem(target)}
              />
            ))
          ) : (
            <View>
              {timelineStore.events.map((evt) => (
                <TimelineItem
                  key={evt.id}
                  event={evt}
                  onPressContent={(cid) => {
                    const target = contentStore.items.find((i) => i.id === cid);
                    if (target) setSelectedQuickActionItem(target);
                  }}
                />
              ))}

              {/*
                The timeline used to be `mockTimelineEvents` — a fabricated
                history of publications, status changes and milestones on every
                account. The platform does record real activity
                (`CreatorActivityEntry`) and serves no route to read it back, so
                the log is empty and says which of those two things is the
                problem.
              */}
              {/*
                Four states, and they are four because an empty list on this
                screen is genuinely ambiguous.

                The sentence that used to stand here — "Diaspora cannot show your
                activity history yet … the platform records what you publish, but
                serves no route to read that history back" — was true when written
                and was the last true one in this file. BG-06 closed it:
                `GET /creators/me/activity` is cursor-paged, newest first, and the
                store reads it.

                `isCreator` is what separates the two empty states. "You have not
                started publishing" and "nothing you have done is recognised yet"
                are different sentences and an empty array cannot tell them apart,
                which is why the route carries the flag.
              */}
              {timelineStore.isLoading && timelineStore.events.length === 0 && (
                <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
                  <ActivityIndicator />
                  <Text className="text-[11px] text-content-muted text-center mt-3">
                    Reading your activity history…
                  </Text>
                </View>
              )}

              {!timelineStore.isLoading && timelineStore.isUnavailable && (
                <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
                  <Text className="text-3xl mb-2">⚠️</Text>
                  <Text className="text-xs font-bold text-content-strong text-center">
                    Your activity history could not be loaded
                  </Text>
                  <Text className="text-[11px] text-content-muted text-center leading-relaxed mt-1 max-w-[280px]">
                    {timelineStore.unavailableReason}
                  </Text>
                  <TouchableOpacity
                    onPress={() => timelineStore.load(user?.fullName ?? '')}
                    accessibilityRole="button"
                    accessibilityLabel="Try loading your activity history again"
                    className="mt-4 px-4 py-2 rounded-full bg-surface-elevated border border-subtle"
                  >
                    <Text className="text-[11px] font-bold text-content-strong">Try again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!timelineStore.isLoading
                && !timelineStore.isUnavailable
                && timelineStore.events.length === 0 && (
                <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
                  <Text className="text-3xl mb-2">🕓</Text>
                  <Text className="text-xs font-bold text-content-strong text-center">
                    {timelineStore.isCreator
                      ? 'Nothing recognised yet'
                      : 'Your history starts with your first publication'}
                  </Text>
                  <Text className="text-[11px] text-content-muted text-center leading-relaxed mt-1 max-w-[280px]">
                    {timelineStore.isCreator
                      ? 'Diaspora records publishing, hosting and contributing. Nothing you '
                        + 'have done has been recognised yet — it appears here as soon as it is.'
                      : 'Publish a guide, list something, post an event or write an update, and '
                        + 'it appears here.'}
                  </Text>
                </View>
              )}

              {timelineStore.hasMore && timelineStore.events.length > 0 && (
                <TouchableOpacity
                  onPress={() => timelineStore.loadMore(user?.fullName ?? '')}
                  disabled={timelineStore.isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Load more activity"
                  className="items-center py-3 mt-2 rounded-2xl bg-surface-card border border-subtle"
                >
                  <Text className="text-[11px] font-bold text-content-strong">
                    {timelineStore.isLoading ? 'Loading…' : 'Show earlier activity'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {filteredContentItems.length === 0 && viewMode === 'grid' && (
            <View className="items-center py-12 bg-surface-card border border-subtle rounded-3xl p-6 my-4">
              <Text className="text-4xl mb-3">🎨</Text>
              {/* Was "Diaspora cannot list your published content yet — no
                  route serves a creator's own items". Four routes do, and this
                  list is read from them. An empty list is now either an empty
                  filter or an empty body of work, and `isUnavailable` is the
                  only state that means the platform could not answer. */}
              <Text className="text-base font-black text-content-primary text-center mb-1">
                {contentStore.isUnavailable
                  ? 'Your content could not be loaded'
                  : workspaceStore.activeCategory === 'all'
                    ? 'Nothing published yet'
                    : 'Nothing here matches this filter'}
              </Text>
              <Text className="text-xs text-content-muted text-center leading-relaxed max-w-[260px] mb-6">
                {contentStore.isUnavailable
                  ? contentStore.unavailableReason
                  : 'Guides, marketplace items, housing listings and events you publish all appear here.'}
              </Text>

              <TouchableOpacity
                onPress={() => router.push('/guide/create')}
                className="bg-primary-500 px-5 py-3 rounded-2xl shadow-lg shadow-primary-500/10"
              >
                <Text className="text-white font-black text-xs">Publish New Content</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── The section's own overlays ────────────────────────────────────── */}
      <BulkActionToolbar />

      <WorkspaceFilterBar visible={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} />

      <QuickActionsMenu
        item={selectedQuickActionItem}
        visible={!!selectedQuickActionItem}
        onClose={() => setSelectedQuickActionItem(null)}
        onOpenInsights={(target) => setSelectedInsightItem(target)}
        onOpenComments={(target) => setSelectedCommentItem(target)}
      />

      <ContentHealthCenterModal
        visible={isHealthCenterOpen}
        onClose={() => setIsHealthCenterOpen(false)}
        onSelectAction={(target, actionType) => {
          if (actionType === 'photos' || actionType === 'edit') {
            router.push('/housing/create');
          } else {
            setSelectedQuickActionItem(target);
          }
        }}
      />

      <CommentManagementModal
        item={selectedCommentItem}
        visible={!!selectedCommentItem}
        onClose={() => setSelectedCommentItem(null)}
      />

      <InsightCard
        item={selectedInsightItem}
        visible={!!selectedInsightItem}
        onClose={() => setSelectedInsightItem(null)}
      />
    </View>
  );
}
