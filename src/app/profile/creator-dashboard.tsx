import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import { useCreatorWorkspaceStore, CreatorSection } from '@/store/creator-workspace';
import { useContentManagementStore } from '@/store/content-management';
import { usePublishingIdentityStore } from '@/store/publishing-identity';
import { useOrganizationStore } from '@/store/organization';
import { useCreatorTimelineStore } from '@/store/creator-timeline';
import { useContentInsightsStore } from '@/store/content-insights';
import { useCreatorDraftStore } from '@/store/creator-draft';

import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { Avatar } from '@/components/Avatar';
import { ReputationBadge } from '@/components/ReputationBadge';
import Svg, { Circle, Path } from 'react-native-svg';

import { PublishingIdentitySelector } from '@/components/creator/PublishingIdentitySelector';
import { ContentCard } from '@/components/creator/ContentCard';
import { QuickActionsMenu } from '@/components/creator/QuickActionsMenu';
import { BulkActionToolbar } from '@/components/creator/BulkActionToolbar';
import { CreatorSearchBar } from '@/components/creator/CreatorSearchBar';
import { WorkspaceFilterBar } from '@/components/creator/WorkspaceFilterBar';
import { ContentHealthBadge } from '@/components/creator/ContentHealthBadge';
import { ContentHealthCenterModal } from '@/components/creator/ContentHealthCenterModal';
import { OrganizationSwitcher } from '@/components/creator/OrganizationSwitcher';
import { OrganizationDetailModal } from '@/components/creator/OrganizationDetailModal';
import { TimelineItem } from '@/components/creator/TimelineItem';
import { DraftCard } from '@/components/creator/DraftCard';
import { ArchiveCard } from '@/components/creator/ArchiveCard';
import { AIInsightCard } from '@/components/creator/AIInsightCard';
import { CommentManagementModal } from '@/components/creator/CommentManagementModal';
import { InsightCard } from '@/components/creator/InsightCard';
import { AchievementsModal, ALL_CREATOR_BADGES } from '@/components/creator/AchievementsModal';
import { UnifiedContentItem, CreatorOrganization } from '@/types/creator';

export default function CreatorDashboardScreen() {
  const { user } = useAuthStore();
  const { reputation } = useReputationStore();

  // Stores
  const workspaceStore = useCreatorWorkspaceStore();
  const contentStore = useContentManagementStore();
  const identityStore = usePublishingIdentityStore();
  const orgStore = useOrganizationStore();
  const timelineStore = useCreatorTimelineStore();
  const insightsStore = useContentInsightsStore();
  const draftStore = useCreatorDraftStore();

  // Modal Visibility States
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedQuickActionItem, setSelectedQuickActionItem] = useState<UnifiedContentItem | null>(null);
  const [isHealthCenterOpen, setIsHealthCenterOpen] = useState(false);
  const [selectedCommentItem, setSelectedCommentItem] = useState<UnifiedContentItem | null>(null);
  const [selectedInsightItem, setSelectedInsightItem] = useState<UnifiedContentItem | null>(null);
  const [selectedOrgDetail, setSelectedOrgDetail] = useState<CreatorOrganization | null>(null);
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);

  // Sub-view toggle inside Workspace section: 'grid' | 'timeline'
  const [workspaceViewMode, setWorkspaceViewMode] = useState<'grid' | 'timeline'>('grid');

  useEffect(() => {
    contentStore.loadContent();
    draftStore.loadDrafts();
  }, []);

  const healthStats = contentStore.getHealthStats();
  const currentAnalytics = insightsStore.getAnalytics();

  // Filter content items based on active workspace filters & category
  const filteredContentItems = contentStore.items.filter((item) => {
    // Identity filter
    if (workspaceStore.filters.identityId !== 'all' && item.publishingIdentity.id !== workspaceStore.filters.identityId) {
      return false;
    }

    // Category filter
    const cat = workspaceStore.activeCategory;
    if (cat === 'guides' && item.contentType !== 'Guide') return false;
    if (cat === 'updates' && item.contentType !== 'Update') return false;
    if (cat === 'providers' && item.contentType !== 'Provider') return false;
    if (cat === 'marketplace' && item.contentType !== 'Marketplace') return false;
    if (cat === 'housing' && item.contentType !== 'Housing') return false;
    if (cat === 'jobs' && item.contentType !== 'Job') return false;
    if (cat === 'events' && item.contentType !== 'Event') return false;

    // Search query
    const q = workspaceStore.filters.searchQuery.toLowerCase();
    if (q) {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCat = item.category?.toLowerCase().includes(q);
      const matchLoc = item.location?.toLowerCase().includes(q);
      const matchStatus = item.currentStatus.toLowerCase().includes(q);
      if (!matchTitle && !matchCat && !matchLoc && !matchStatus) return false;
    }

    // Status filter
    if (workspaceStore.filters.statusFilter.length > 0) {
      if (!workspaceStore.filters.statusFilter.includes(item.currentStatus)) return false;
    }

    return true;
  });

  // Calculate counts for categories
  const counts = {
    all: contentStore.items.length,
    guides: contentStore.items.filter((i) => i.contentType === 'Guide').length,
    updates: contentStore.items.filter((i) => i.contentType === 'Update').length,
    providers: contentStore.items.filter((i) => i.contentType === 'Provider').length,
    marketplace: contentStore.items.filter((i) => i.contentType === 'Marketplace').length,
    housing: contentStore.items.filter((i) => i.contentType === 'Housing').length,
    jobs: contentStore.items.filter((i) => i.contentType === 'Job').length,
    events: contentStore.items.filter((i) => i.contentType === 'Event').length,
    organizations: orgStore.organizations.length,
    drafts: draftStore.drafts.length,
    archived: contentStore.archivedItems.length,
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      {/* Top Header Navigation */}
      <View className="px-5 py-3 border-b border-neutral-100 bg-white">
        <View className="flex-row justify-between items-center mb-2.5">
          <View className="flex-row items-center flex-1 mr-2">
            <TouchableOpacity onPress={() => router.back()} className="mr-2 p-1">
              <Text className="text-xl text-neutral-600">←</Text>
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-base font-black text-neutral-900 tracking-tight" numberOfLines={1}>Creator Studio</Text>
              <Text className="text-[10px] text-neutral-400 font-semibold" numberOfLines={1}>Unified Content & Organization Hub</Text>
            </View>
          </View>

          {/* Content Health Badge Shortcut */}
          <ContentHealthBadge
            score={healthStats.overallScore}
            status={healthStats.actionRequired > 0 ? 'action_required' : healthStats.needsAttention > 0 ? 'needs_attention' : 'healthy'}
            recommendationCount={healthStats.needsAttention + healthStats.actionRequired}
            onPress={() => setIsHealthCenterOpen(true)}
            showDetails={false}
          />
        </View>

        {/* Publishing Identity Switcher Header Banner */}
        <PublishingIdentitySelector />
      </View>

      {/* Primary Section Selector (Overview | Workspace | Organizations | Analytics) */}
      <View className="flex-row bg-white border-b border-neutral-200 px-4">
        {[
          { key: 'workspace', label: '⚡ Workspace' },
          { key: 'overview', label: '📊 Overview' },
          { key: 'organizations', label: '🏛️ Organizations' },
          { key: 'analytics', label: '📈 Analytics' },
        ].map((sec) => {
          const isActive = workspaceStore.activeSection === sec.key;
          return (
            <TouchableOpacity
              key={sec.key}
              onPress={() => workspaceStore.setActiveSection(sec.key as CreatorSection)}
              className={`flex-1 items-center py-3 border-b-2 ${
                isActive ? 'border-primary-500' : 'border-transparent'
              }`}
            >
              <Text className={`text-xs font-black ${isActive ? 'text-primary-500' : 'text-neutral-500'}`}>
                {sec.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Content Area */}
      <ScrollEndScrollView
        activeTab="profile"
        showsVerticalScrollIndicator={false}
        bottomShieldColor="#FFFFFF"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
      >
        {/* ================================================================= */}
        {/* SECTION 1: OVERVIEW                                               */}
        {/* ================================================================= */}
        {workspaceStore.activeSection === 'overview' && (
          <View className="pb-24">
            {/* Welcome User Card */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 flex-row items-center mb-4 shadow-sm">
              <Avatar name={user?.fullName || 'Amara Kone'} size={50} />
              <View className="ml-3.5 flex-1">
                <Text className="text-xs text-neutral-400 font-bold">Good Evening,</Text>
                <Text className="text-base font-black text-neutral-900">{user?.fullName || 'Amara Kone'}</Text>
                <View className="flex-row items-center mt-1">
                  <Text className="text-[9px] font-black text-[#B06000] bg-[#FFF2E0] px-1.5 py-0.5 rounded mr-1.5">
                    🔥 5 DAY STREAK
                  </Text>
                  <ReputationBadge level={reputation?.level || 'VerifiedResident'} size="sm" />
                </View>
              </View>
            </View>

            {/* Achievements Badges Shelf */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-5 shadow-sm">
              <View className="flex-row justify-between items-center mb-3.5">
                <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  🎖️ Achievements Badges Shelf
                </Text>
                <TouchableOpacity onPress={() => setIsBadgesModalOpen(true)} className="flex-row items-center">
                  <Text className="text-xs font-black text-primary-500 uppercase tracking-tight">
                    View All ({ALL_CREATOR_BADGES.length}) →
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
              >
                {ALL_CREATOR_BADGES.slice(0, 5).map((badge) => (
                  <View
                    key={badge.id}
                    className="items-center justify-center bg-neutral-50 p-3 rounded-2xl border border-neutral-150 w-28 h-28 mr-3 shadow-sm"
                  >
                    <Text className="text-2xl mb-1">{badge.icon}</Text>
                    <Text className="text-[9px] font-black text-neutral-800 text-center" numberOfLines={1}>
                      {badge.title}
                    </Text>
                    <Text className="text-[8px] text-success-default font-bold mt-0.5" numberOfLines={1}>
                      {badge.statusText}
                    </Text>
                  </View>
                ))}

                {/* View All CTA Card at end of line */}
                <TouchableOpacity
                  onPress={() => setIsBadgesModalOpen(true)}
                  className="items-center justify-center bg-primary-50 border border-primary-200 p-3 rounded-2xl w-28 h-28 mr-3 shadow-sm"
                >
                  <Text className="text-xl mb-1">🎖️</Text>
                  <Text className="text-[10px] font-black text-primary-600 text-center">View All</Text>
                  <Text className="text-[8px] text-primary-500 font-bold mt-0.5">+{ALL_CREATOR_BADGES.length - 5} Badges →</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Profile Health completion */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-xs font-bold text-neutral-850">Profile Completeness: 92%</Text>
                <Text className="text-[10px] text-neutral-500 leading-relaxed mt-1">
                  Complete your identity check to receive top residency verification indicators.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/profile/trust-center')}
                  className="mt-3 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-xl self-start"
                >
                  <Text className="text-[10px] font-black text-primary-600">Fix Profile Issues →</Text>
                </TouchableOpacity>
              </View>
              
              <Svg height="55" width="55" viewBox="0 0 36 36">
                <Circle cx="18" cy="18" r="16" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                <Circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="#F59300"
                  strokeWidth="3"
                  strokeDasharray="100"
                  strokeDashoffset="8"
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </Svg>
            </View>

            {/* Community Impact Summary */}
            <View className="bg-[#FFF8F2] border border-[#FFEADA] rounded-3xl p-5 mb-5 shadow-sm">
              <Text className="text-sm font-black text-neutral-900 mb-1 flex-row items-center">
                🌍 Community Impact Summary
              </Text>
              <Text className="text-[10px] text-neutral-500 font-semibold mb-4">
                This month your contributions directly assisted diaspora citizens settling in London.
              </Text>
              
              <View className="space-y-2.5 gap-2">
                <View className="flex-row items-center">
                  <Text className="text-xs mr-2">✓</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">1,248 newcomers read your guides</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-xs mr-2">❤️</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">89 people voted your residency advice as helpful</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-xs mr-2">📢</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">Community safety alert reached 432 residents</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-xs mr-2">👥</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">17 newcomers followed your provider recommendations</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-xs mr-2">🏠</Text>
                  <Text className="text-xs text-neutral-700 font-semibold">Housing listing helped 12 families locate accommodation</Text>
                </View>
              </View>
            </View>

            {/* Milestones Feed */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-5 shadow-sm">
              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3.5">
                🏆 Recent Milestones
              </Text>
              
              <View className="border-l border-neutral-200 pl-4 py-1 space-y-4 gap-3">
                <View className="relative">
                  <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary-500" />
                  <Text className="text-[10px] font-black text-primary-500 uppercase">🎉 Today</Text>
                  <Text className="text-xs font-bold text-neutral-800 mt-0.5">Your guide helped its 1,000th reader.</Text>
                </View>

                <View className="relative">
                  <View className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-neutral-350" />
                  <Text className="text-[10px] font-black text-neutral-450 uppercase">🏅 Yesterday</Text>
                  <Text className="text-xs font-bold text-neutral-800 mt-0.5">Assigned Manager of African Students Network.</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* SECTION 2: WORKSPACE (Operational Hub)                            */}
        {/* ================================================================= */}
        {workspaceStore.activeSection === 'workspace' && (
          <View className="pb-28">
            {/* Workspace Category Selector Chips */}
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
                    className={`px-3 py-1.5 rounded-xl border mr-2 ${
                      isActive ? 'bg-neutral-900 border-neutral-900' : 'bg-white border-neutral-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-neutral-700'}`}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search & Filter Bar */}
            <CreatorSearchBar onOpenFilterModal={() => setIsFilterModalOpen(true)} />

            {/* Sub-view toggle (Content Cards vs Unified Timeline) */}
            <View className="flex-row justify-between items-center mb-3 px-1">
              <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                Showing {filteredContentItems.length} Published Items
              </Text>
              
              <View className="flex-row bg-white border border-neutral-250 rounded-xl p-0.5">
                <TouchableOpacity
                  onPress={() => setWorkspaceViewMode('grid')}
                  className={`px-2.5 py-1 rounded-lg ${workspaceViewMode === 'grid' ? 'bg-primary-500' : 'bg-transparent'}`}
                >
                  <Text className={`text-[9px] font-black ${workspaceViewMode === 'grid' ? 'text-white' : 'text-neutral-500'}`}>
                    Cards View
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setWorkspaceViewMode('timeline')}
                  className={`px-2.5 py-1 rounded-lg ${workspaceViewMode === 'timeline' ? 'bg-primary-500' : 'bg-transparent'}`}
                >
                  <Text className={`text-[9px] font-black ${workspaceViewMode === 'timeline' ? 'text-white' : 'text-neutral-500'}`}>
                    Timeline Log
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Dedicated Draft Center View */}
            {workspaceStore.activeCategory === 'drafts' && (
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
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
                  <View className="items-center py-10 bg-white border border-neutral-200 rounded-3xl p-6">
                    <Text className="text-3xl mb-2">✏️</Text>
                    <Text className="text-xs font-bold text-neutral-800">No active drafts</Text>
                  </View>
                )}
              </View>
            )}

            {/* Dedicated Archive Center View */}
            {workspaceStore.activeCategory === 'archived' && (
              <View>
                <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-3">
                  Archive Center ({contentStore.archivedItems.length})
                </Text>

                {contentStore.archivedItems.map((arch) => (
                  <ArchiveCard key={arch.id} item={arch} />
                ))}

                {contentStore.archivedItems.length === 0 && (
                  <View className="items-center py-10 bg-white border border-neutral-200 rounded-3xl p-6">
                    <Text className="text-3xl mb-2">📦</Text>
                    <Text className="text-xs font-bold text-neutral-800">No archived items</Text>
                  </View>
                )}
              </View>
            )}

            {/* Standard Unified Content View */}
            {workspaceStore.activeCategory !== 'drafts' && workspaceStore.activeCategory !== 'archived' && (
              <View>
                {workspaceViewMode === 'grid' ? (
                  filteredContentItems.map((item: UnifiedContentItem) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      isMultiSelectMode={workspaceStore.isMultiSelectMode}
                      isSelected={workspaceStore.selectedItemIds.includes(item.id)}
                      onToggleSelect={(id) => workspaceStore.toggleSelectItem(id)}
                      onOpenQuickActions={(target) => setSelectedQuickActionItem(target)}
                      onOpenHealthModal={() => setIsHealthCenterOpen(true)}
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

                {/* Empty State */}
                {filteredContentItems.length === 0 && workspaceViewMode === 'grid' && (
                  <View className="items-center py-12 bg-white border border-neutral-200 rounded-3xl p-6 my-4">
                    <Text className="text-4xl mb-3">🎨</Text>
                    <Text className="text-base font-black text-neutral-900 text-center mb-1">
                      No items found in this view
                    </Text>
                    <Text className="text-xs text-neutral-500 text-center leading-relaxed max-w-[260px] mb-6">
                      Publish evergreen guides, marketplace products, housing listings, or job openings to reach the diaspora community.
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
          </View>
        )}

        {/* ================================================================= */}
        {/* SECTION 3: ORGANIZATIONS                                          */}
        {/* ================================================================= */}
        {workspaceStore.activeSection === 'organizations' && (
          <View className="pb-24">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                Organization Operating System
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/community-life/org/create')}
                className="bg-primary-500 px-3.5 py-1.5 rounded-xl"
              >
                <Text className="text-xs font-black text-white">+ Create Org</Text>
              </TouchableOpacity>
            </View>

            <OrganizationSwitcher onOpenOrgDetail={(org) => setSelectedOrgDetail(org)} />
          </View>
        )}

        {/* ================================================================= */}
        {/* SECTION 4: ANALYTICS & PERFORMANCE                                */}
        {/* ================================================================= */}
        {workspaceStore.activeSection === 'analytics' && (
          <View className="pb-24">
            {/* Time Filter Query Tabs */}
            <View className="flex-row bg-white border border-neutral-200 rounded-2xl p-1.5 mb-4">
              {[
                { key: '7d', label: '7 Days' },
                { key: '30d', label: '30 Days' },
                { key: '90d', label: '90 Days' },
                { key: 'all', label: 'All Time' },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => insightsStore.setTimeFilter(tab.key as any)}
                  className={`flex-1 py-2 items-center rounded-xl ${
                    insightsStore.timeFilter === tab.key ? 'bg-primary-500' : 'transparent'
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${insightsStore.timeFilter === tab.key ? 'text-white' : 'text-neutral-500'}`}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Performance Overview Grid */}
            <View className="flex-row flex-wrap gap-2.5 mb-5">
              <View className="bg-white border border-neutral-200 p-4 rounded-3xl w-[48%] shadow-sm">
                <Text className="text-[10px] font-extrabold text-neutral-400 uppercase">Total Views</Text>
                <Text className="text-xl font-black text-neutral-900 mt-1">{currentAnalytics.views}</Text>
                <Text className="text-[9px] text-emerald-600 font-black mt-0.5">{currentAnalytics.growthTrend}</Text>
              </View>

              <View className="bg-white border border-neutral-200 p-4 rounded-3xl w-[48%] shadow-sm">
                <Text className="text-[10px] font-extrabold text-neutral-400 uppercase">Followers</Text>
                <Text className="text-xl font-black text-neutral-900 mt-1">{currentAnalytics.followers}</Text>
                <Text className="text-[9px] text-primary-500 font-black mt-0.5">Community Members</Text>
              </View>

              <View className="bg-white border border-neutral-200 p-4 rounded-3xl w-[48%] shadow-sm">
                <Text className="text-[10px] font-extrabold text-neutral-400 uppercase">Helpful Votes</Text>
                <Text className="text-xl font-black text-neutral-900 mt-1">{currentAnalytics.helpfulVotes}</Text>
                <Text className="text-[9px] text-neutral-400 font-bold mt-0.5">Advice Confirmations</Text>
              </View>

              <View className="bg-white border border-neutral-200 p-4 rounded-3xl w-[48%] shadow-sm">
                <Text className="text-[10px] font-extrabold text-neutral-400 uppercase">Conversion</Text>
                <Text className="text-xl font-black text-success-default mt-1">{currentAnalytics.conversion}</Text>
                <Text className="text-[9px] text-neutral-400 font-bold mt-0.5">Audience Action Rate</Text>
              </View>
            </View>

            {/* Performance Chart */}
            <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-6 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold text-neutral-700">Views & Engagement Traffic Trend</Text>
                <Text className="text-xs font-black text-success-default">{currentAnalytics.growthTrend}</Text>
              </View>

              <View className="h-28 w-full bg-neutral-50 rounded-2xl overflow-hidden justify-end">
                <Svg height="100%" width="100%" viewBox="0 0 320 100" preserveAspectRatio="none">
                  <Path d={currentAnalytics.viewsTrafficPath} fill="none" stroke="#F59300" strokeWidth="2.5" />
                  <Path d={currentAnalytics.updatesTrafficPath} fill="none" stroke="#10B981" strokeWidth="2.5" />
                  <Path d={currentAnalytics.followersTrafficPath} fill="none" stroke="#3B82F6" strokeWidth="2.5" />
                </Svg>
              </View>
            </View>

            {/* AI Creator Assistant Panel */}
            <AIInsightCard
              onActionClick={(actionType) => {
                if (actionType === 'impact') {
                  workspaceStore.setActiveSection('overview');
                } else if (actionType === 'housing_fix') {
                  setIsHealthCenterOpen(true);
                } else {
                  router.push('/guide/create');
                }
              }}
            />
          </View>
        )}
      </ScrollEndScrollView>

      {/* Floating Multi-select Toolbar */}
      <BulkActionToolbar />

      {/* Interactive Modals */}
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

      <OrganizationDetailModal
        organization={selectedOrgDetail}
        visible={!!selectedOrgDetail}
        onClose={() => setSelectedOrgDetail(null)}
      />

      <AchievementsModal
        visible={isBadgesModalOpen}
        onClose={() => setIsBadgesModalOpen(false)}
      />
    </SafeAreaView>
  );
}
