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
// This section reads five zustand stores directly, synchronously, with no
// loading state, no error state and no access check. That is how it has always
// worked. Moving it onto `/creator` puts it inside `CreatorScreen`, which *does*
// refuse a member who may not be here — so the access gap closes for free — but
// the section still cannot tell you that its data failed to load, because
// nothing it reads can fail. Migrating these stores onto the gap architecture
// is the piece of work this merge deliberately did not do.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

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
  const timelineStore = useCreatorTimelineStore();

  // Local, as it was: the store holds filters and selection, not the view
  // toggle, and the toggle is a per-visit preference rather than app state.
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isHealthCenterOpen, setIsHealthCenterOpen] = useState(false);
  const [selectedQuickActionItem, setSelectedQuickActionItem] = useState<UnifiedContentItem | null>(null);
  const [selectedCommentItem, setSelectedCommentItem] = useState<UnifiedContentItem | null>(null);
  const [selectedInsightItem, setSelectedInsightItem] = useState<UnifiedContentItem | null>(null);

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

  const counts = {
    all: contentStore.items.length,
    guides: contentStore.items.filter((i) => i.contentType === 'Guide').length,
    updates: contentStore.items.filter((i) => i.contentType === 'Update').length,
    providers: contentStore.items.filter((i) => i.contentType === 'Provider').length,
    marketplace: contentStore.items.filter((i) => i.contentType === 'Marketplace').length,
    housing: contentStore.items.filter((i) => i.contentType === 'Housing').length,
    jobs: contentStore.items.filter((i) => i.contentType === 'Job').length,
    events: contentStore.items.filter((i) => i.contentType === 'Event').length,
    drafts: draftStore.drafts.length,
    archived: contentStore.archivedItems.length,
  };

  const openHealthCentre = () => {
    setIsHealthCenterOpen(true);
    onOpenHealthCentre?.();
  };

  return (
    <View>
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
          Showing {filteredContentItems.length} Published Items
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
              Draft Center ({draftStore.drafts.length})
            </Text>
            <TouchableOpacity
              onPress={() => draftStore.createDraft('Untitled Community Guide', 'Guide')}
              className="bg-primary-500 px-3 py-1 rounded-xl"
            >
              <Text className="text-xs font-black text-white">+ New Draft</Text>
            </TouchableOpacity>
          </View>

          {draftStore.drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}

          {draftStore.drafts.length === 0 && (
            <View className="items-center py-10 bg-surface-card border border-subtle rounded-3xl p-6">
              <Text className="text-3xl mb-2">✏️</Text>
              <Text className="text-xs font-bold text-content-strong">No active drafts</Text>
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
              <Text className="text-xs font-bold text-content-strong">No archived items</Text>
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
            timelineStore.events.map((evt) => (
              <TimelineItem
                key={evt.id}
                event={evt}
                onPressContent={(cid) => {
                  const target = contentStore.items.find((i) => i.id === cid);
                  if (target) setSelectedQuickActionItem(target);
                }}
              />
            ))
          )}

          {filteredContentItems.length === 0 && viewMode === 'grid' && (
            <View className="items-center py-12 bg-surface-card border border-subtle rounded-3xl p-6 my-4">
              <Text className="text-4xl mb-3">🎨</Text>
              <Text className="text-base font-black text-content-primary text-center mb-1">
                No items found in this view
              </Text>
              <Text className="text-xs text-content-muted text-center leading-relaxed max-w-[260px] mb-6">
                Publish evergreen guides, marketplace products, housing listings, or job openings to
                reach the diaspora community.
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
