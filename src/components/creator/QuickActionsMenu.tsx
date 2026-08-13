import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { UnifiedContentItem, ContentStatus } from '@/types/creator';
import { useContentManagementStore } from '@/store/content-management';
import { router } from 'expo-router';

/**
 * Creator Studio's `contentType` → B15's `MonetizationSubjectType`.
 *
 * The two vocabularies agree on eight members because B15 took its list from
 * this client; only `'Marketplace'` and `'Housing'` are spelled differently,
 * the backend having appended `Listing` to both.
 */
const CONTENT_TYPE_TO_SUBJECT: Record<string, string | undefined> = {
  Guide: 'Guide',
  Update: 'Update',
  Provider: 'Provider',
  Marketplace: 'MarketplaceListing',
  Housing: 'HousingListing',
  Job: 'Job',
  Event: 'Event',
  Organization: 'Organization',
};

interface QuickActionsMenuProps {
  item: UnifiedContentItem | null;
  visible: boolean;
  onClose: () => void;
  onOpenInsights?: (item: UnifiedContentItem) => void;
  onOpenComments?: (item: UnifiedContentItem) => void;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  item,
  visible,
  onClose,
  onOpenInsights,
  onOpenComments,
}) => {
  if (!item) return null;

  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useNotification();
  const { updateItemStatus, archiveItem, deleteItem, duplicateItem, renewListing } = useContentManagementStore();

  const handleStatusChange = (newStatus: ContentStatus) => {
    updateItemStatus(item.id, newStatus);
    showToast({ type: 'success', title: 'Status Updated', message: `Item status changed to ${newStatus}` });
    onClose();
  };

  /**
   * Opens the promotion flow for this item.
   *
   * Creator Studio's `contentType` and B15's `MonetizationSubjectType` are the
   * same eight verticals under two spellings — the backend borrowed the list
   * from `types/creator.ts` — so the mapping is a rename rather than a
   * translation. An unmapped type falls through to no navigation instead of
   * sending the catalogue a subject it will refuse.
   */
  const handleBoost = () => {
    const subjectType = CONTENT_TYPE_TO_SUBJECT[item.contentType];

    if (!subjectType) {
      showToast({
        type: 'info',
        title: 'Not available',
        message: 'This kind of content cannot be promoted yet.',
      });
      return;
    }

    onClose();
    router.push({
      pathname: '/monetization/promote',
      params: { subjectType, subjectId: item.id, title: item.title },
    });
  };

  const handleDuplicate = () => {
    duplicateItem(item.id);
    showToast({ type: 'success', title: 'Duplicated', message: `Created a copy of "${item.title}"` });
    onClose();
  };

  const handleArchive = () => {
    showAlert({
      type: 'warning',
      title: 'Archive Item',
      message: `Are you sure you want to archive "${item.title}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            archiveItem(item.id, 'User Archived');
            onClose();
            showToast({ type: 'info', title: 'Archived', message: `"${item.title}" moved to archive.` });
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    showAlert({
      type: 'error',
      title: 'Delete Item',
      message: `Permanently delete "${item.title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            deleteItem(item.id);
            onClose();
            showToast({ type: 'error', title: 'Deleted', message: `"${item.title}" deleted.` });
          },
        },
      ],
    });
  };

  const handleRenew = () => {
    renewListing(item.id);
    showToast({ type: 'success', title: 'Listing Renewed', message: 'Your listing has been bumped to top of searches.' });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-neutral-200 rounded-full self-center mb-3" />
          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-faint mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-black text-primary-500 uppercase tracking-wider">{item.contentType} Actions</Text>
              <Text className="text-sm font-bold text-content-primary leading-snug" numberOfLines={1}>{item.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-surface-muted px-3 py-1.5 rounded-full">
              <Text className="text-xs font-black text-content-tertiary">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Primary Actions Group */}
            <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-2">Primary Operations</Text>
            
            <TouchableOpacity
              onPress={() => {
                onClose();
                if (item.contentType === 'Guide') router.push('/guide/create');
                else if (item.contentType === 'Housing') router.push('/housing/create');
                else if (item.contentType === 'Job') router.push('/job/create' as any);
                else router.push('/marketplace/create' as any);
              }}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-lg mr-3">✏️</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Edit {item.contentType}</Text>
                <Text className="text-[9px] text-content-faint">Update title, photos, price or description</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDuplicate} className="flex-row items-center py-3 border-b border-faint">
              <Text className="text-lg mr-3">📄</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Duplicate Content</Text>
                <Text className="text-[9px] text-content-faint">Create a draft copy to reuse structure</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                onClose();
                onOpenInsights?.(item);
              }}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-lg mr-3">📊</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">View Detailed Insights</Text>
                <Text className="text-[9px] text-content-faint">Inspect view counts, reading times, conversion rates</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                onClose();
                onOpenComments?.(item);
              }}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-lg mr-3">💬</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Manage Comments & Feedback</Text>
                <Text className="text-[9px] text-content-faint">Reply, pin top responses, or report inappropriate flags</Text>
              </View>
            </TouchableOpacity>

            {/* Contextual Status Management */}
            <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mt-4 mb-2">Contextual Status</Text>
            
            {item.contentType === 'Marketplace' && (
              <>
                <TouchableOpacity onPress={() => handleStatusChange('Available')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-emerald-700">🟢 Mark as Available</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Reserved')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-amber-700">🟡 Mark as Reserved</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Sold')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-blue-700">🔵 Mark as Sold</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Paused')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-purple-700">⏸️ Pause Listing</Text>
                </TouchableOpacity>
              </>
            )}

            {item.contentType === 'Housing' && (
              <>
                <TouchableOpacity onPress={() => handleStatusChange('Available')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-emerald-700">🟢 Mark as Available</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Rented')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-blue-700">🏠 Mark as Rented</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Paused')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-purple-700">⏸️ Pause Listing</Text>
                </TouchableOpacity>
              </>
            )}

            {item.contentType === 'Job' && (
              <>
                <TouchableOpacity onPress={() => handleStatusChange('Open')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-emerald-700">🟢 Open Job Applications</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Interviewing')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-amber-700">🟡 Set to Interviewing</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStatusChange('Filled')} className="py-2.5 flex-row items-center">
                  <Text className="text-xs font-bold text-blue-700">💼 Mark as Filled</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={handleRenew} className="flex-row items-center py-3 border-t border-faint mt-2">
              <Text className="text-lg mr-3">🔄</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Renew / Refresh Listing</Text>
                <Text className="text-[9px] text-content-faint">Bump listing to fresh status</Text>
              </View>
            </TouchableOpacity>

            {/*
              B15's alignment report named this toast as the thing the wallet
              phase replaces: "Boost sheet — replaces the toast at
              QuickActionsMenu.tsx:222. GET /catalog?subjectType=… then POST
              /placements."

              The description was already a specification — a boost buys search
              priority and local reach — and B15 built `PlacementKind.Boost`,
              `priorityWeight` and `PlacementActivatedIntegrationEvent` to make
              it true. The subject type is mapped from the item's own
              `contentType`, which the client had already decided is one action
              across eight verticals rather than eight per-vertical features.
            */}
            <TouchableOpacity
              onPress={handleBoost}
              className="flex-row items-center py-3 border-b border-faint"
              accessibilityRole="button"
              accessibilityLabel="Promote this item to increase its search priority and local reach"
            >
              <Text className="text-lg mr-3">⚡</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Promote this listing</Text>
                <Text className="text-[9px] text-content-faint">Increase search priority and local reach</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => showToast({ type: 'info', title: 'Promote Feature', message: 'Promote campaign tools are coming soon in Phase 3!' })}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-lg mr-3">📣</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Promote (Coming Soon)</Text>
                <Text className="text-[9px] text-content-faint">Run sponsored diaspora community banners</Text>
              </View>
            </TouchableOpacity>

            {/* Danger Zone */}
            <Text className="text-[10px] font-black text-error-default uppercase tracking-widest mt-4 mb-2">Lifecycle Management</Text>

            <TouchableOpacity onPress={handleArchive} className="flex-row items-center py-2.5">
              <Text className="text-lg mr-3">📦</Text>
              <Text className="text-xs font-bold text-content-secondary">Archive Content</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDelete} className="flex-row items-center py-2.5">
              <Text className="text-lg mr-3">🗑️</Text>
              <Text className="text-xs font-black text-error-default">Delete Permanently</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
