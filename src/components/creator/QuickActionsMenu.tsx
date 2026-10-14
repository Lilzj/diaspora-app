import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification } from '@/providers/notification-provider';
import { UnifiedContentItem, ContentStatus } from '@/types/creator';
import { useContentManagementStore } from '@/store/content-management';
import { canPerform, performWorkspaceAction } from '@/lib/creator/workspace-actions';
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
  // `renewListing` is deliberately not taken from the store any more — see
  // `handleRenew` below. The store action survives because other callers may
  // still reference it; this menu no longer pretends it does anything.
  const { updateItemStatus, archiveItem, deleteItem, loadContent } =
    useContentManagementStore();

  /**
   * Status changes, and the half of them that is real.
   *
   * The first of the two reasons this used to be inert is gone: the items are no
   * longer fixtures, so `item.id` is a Guid the server resolves.
   *
   * **The second reason stands, and is the shape of the platform.** There is no
   * unified status route. Each module exposes its own one-verb transitions —
   * `POST /marketplace/listings/{id}/sold`, `POST /housing/listings/{id}/occupied`,
   * `POST /{module}/{id}/archive|restore|publish` — and between them they cover
   * none of "Reserved", "Paused", "Interviewing", "Filled" or "Open". Those five
   * exist only in this client's `ContentStatus` union; no module has ever heard
   * of them.
   *
   * So a transition the platform models is *sent*, and one it does not is named
   * as unavailable rather than mimed locally. The old behaviour — move the row,
   * then apologise — showed a member their listing changing state while nothing
   * left the device, which is the more convincing of the two lies.
   */
  const handleStatusChange = async (newStatus: ContentStatus) => {
    const kind =
      newStatus === 'Sold' ? 'markSold'
        : newStatus === 'Rented' ? 'markOccupied'
          : null;

    if (!kind || !canPerform(kind, item.contentType)) {
      showToast({
        type: 'info',
        title: 'Not available',
        message: `Diaspora does not track "${newStatus}" as a state — no module models it, so there is nothing to save. Open the listing to change what it does track.`,
      });
      onClose();
      return;
    }

    onClose();
    const result = await performWorkspaceAction(kind, item.contentType, item.id);

    if (result.outcome === 'done') {
      updateItemStatus(item.id, newStatus);
      loadContent();
      showToast({ type: 'success', title: 'Saved', message: `"${item.title}" is now ${newStatus}.` });
      return;
    }

    showToast({
      type: 'error',
      title: 'Not saved',
      message: result.reason,
    });
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

  /**
   * Duplication — BG-07, and the last inert control in this sheet.
   *
   * This handler used to read: *"Duplication has no backend at all — not a
   * route, not a command, not a handler, in any module … it needs the capability
   * built first."* That was accurate every time it was checked, and it was the
   * one item in the disclosure sweep that turned out to need a **product
   * decision** rather than a re-read: nobody had ever said whether the platform
   * copies items at all.
   *
   * The decision was taken to build it, and the routes exist per module. What a
   * copy carries and what it resets is decided server-side — see each module's
   * `Duplicate*CommandHandler` — and two of those decisions are worth knowing
   * here because a member will notice them: a duplicated **property** does not
   * inherit the original's address or photographs, and a duplicated **event**
   * moves forward to the next occurrence of its own weekday.
   *
   * The copy is always a **draft**, so nothing reaches members until the owner
   * publishes it.
   */
  const handleDuplicate = () => {
    showAlert({
      type: 'info',
      title: 'Make a copy?',
      message: `A draft copy of "${item.title}" will be added to your workspace. `
        + 'Nothing is published until you publish it.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make a copy',
          onPress: async () => {
            onClose();
            const result = await performWorkspaceAction('duplicate', item.contentType, item.id);

            if (result.outcome === 'done') {
              // Re-read rather than optimistically inserted. The server decides
              // the copy's title, its slug and — for an event — its date, so a
              // row invented here would differ from the one that exists.
              loadContent();
              showToast({
                type: 'success',
                title: 'Copy made',
                message: `A draft copy of "${item.title}" is in your workspace.`,
              });
              return;
            }

            showToast({ type: 'error', title: 'Not copied', message: result.reason });
          },
        },
      ],
    });
  };

  /**
   * Archive and delete, which are now real.
   *
   * This comment used to read: *"The routes exist per module (`POST
   * /{module}/listings/{id}/archive`, `DELETE /{module}/listings/{id}`) and are
   * the right ones to call once these items are real. Until then the dialog must
   * not ask a member to confirm an irreversible action that will not happen."*
   *
   * The items are real. Both verbs are wired to those exact routes, the
   * confirmation describes what will actually happen, and the local row is moved
   * only **after** the server agrees — so a refusal leaves the list showing the
   * truth rather than an optimistic edit that has to be walked back.
   *
   * A content type the platform cannot archive gets no dialog at all; the
   * control is withheld by `canPerform` below rather than offered and then
   * explained.
   */
  const handleArchive = () => {
    showAlert({
      type: 'warning',
      title: 'Archive this?',
      message: `"${item.title}" will stop appearing in search and in your public profile. You can restore it from the archive.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            onClose();
            const result = await performWorkspaceAction('archive', item.contentType, item.id);
            if (result.outcome === 'done') {
              archiveItem(item.id, 'User Archived');
              loadContent();
              showToast({ type: 'success', title: 'Archived', message: `"${item.title}" is in your archive.` });
              return;
            }
            showToast({ type: 'error', title: 'Not archived', message: result.reason });
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    showAlert({
      type: 'warning',
      title: 'Delete this?',
      // "Cannot be undone" is said now because it is now true. It was removed
      // when the control did nothing, and it comes back with the route.
      message: `"${item.title}" will be deleted. This cannot be undone — archive it instead if you only want it out of search.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            onClose();
            const result = await performWorkspaceAction('delete', item.contentType, item.id);
            if (result.outcome === 'done') {
              deleteItem(item.id);
              loadContent();
              showToast({ type: 'success', title: 'Deleted', message: `"${item.title}" has been deleted.` });
              return;
            }
            showToast({ type: 'error', title: 'Not deleted', message: result.reason });
          },
        },
      ],
    });
  };

  /**
   * Renew — the strongest false claim in this menu.
   *
   * It said *"Your listing has been bumped to top of searches."* A member
   * competing for views on a flat or a job could press it every morning and
   * believe they were buying back visibility. Nothing moved.
   *
   * And nothing can: **there is no bump/renew/refresh route anywhere in the
   * backend.** The only two `renew` routes are
   * `POST /financial/placements/{id}/renew` (extends a *paid* ad placement that
   * has already been bought, and takes a product code, a payment method and an
   * idempotency key) and `POST /communities/memberships/{id}/renew` — neither of
   * which is "put my free listing back on top". Search priority is something
   * this platform sells, through the Promote control a few rows below, and
   * offering it here for free as a one-tap refresh contradicted that.
   *
   * The local `renewListing` call is dropped entirely rather than kept as a
   * preview: unlike archive or duplicate, "renewed" has no visible consequence
   * a member could read as provisional, so the only honest version of this
   * control is one that explains and points at Promote.
   */
  const handleRenew = () => {
    showAlert({
      type: 'info',
      title: 'There is no free bump',
      // Narrowed during the disclosure sweep. The title used to be "Diaspora
      // cannot bump listings", which is not what the platform does: a boost is
      // a real product with a real effect. `GET /financial/catalog` serves
      // `marketplace.listing.boost.7d` with `placementKind: "Boost"` and
      // `priorityWeight: 1.5`, buying it through `POST /financial/purchases`
      // returns a live placement, and that placement can be paused, resumed,
      // renewed and set to auto-renew. All six verified against a running
      // deployment.
      //
      // What genuinely does not exist is a *free* one-tap refresh, which is what
      // this control used to claim to be — so that is what the sentence says now.
      message:
        'Listings are ranked by relevance and how recently they were edited, and nothing here puts one back on top for free. Buying a boost does raise a listing’s search priority for a set number of days — that is what "Promote this listing" opens.',
      buttons: [
        { text: 'Not now', style: 'cancel' },
        { text: 'See boost options', onPress: handleBoost },
      ],
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-surface-card rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-subtle rounded-full self-center mb-3" />
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
                // Was "Edit", and opened an EMPTY create form (a business opened the
                // marketplace one): no create screen can load an existing item, so
                // nothing could be edited from here (14 Oct 2026). It now opens the
                // item itself, where its owner controls are, and says so.
                const detail: Partial<Record<string, string>> = {
                  Guide: `/guide/${item.id}`,
                  Housing: `/housing/${item.id}`,
                  Marketplace: `/marketplace/${item.id}`,
                  Provider: `/provider/${item.id}`,
                  Job: `/job/${item.id}`,
                  Event: `/community-life/event/${item.id}`,
                  Update: `/update/${item.id}`,
                };
                const target = detail[item.contentType];
                if (target) router.push(target as never);
              }}
              className="flex-row items-center py-3 border-b border-faint"
            >
              <Text className="text-lg mr-3">👁️</Text>
              <View className="flex-1">
                <Text className="text-xs font-bold text-content-strong">Open {item.contentType}</Text>
                <Text className="text-[9px] text-content-faint">See it as members do, and manage or remove it. Editing its details is not available yet.</Text>
              </View>
            </TouchableOpacity>

            {/*
              Withheld rather than offered-and-explained, exactly like archive and
              delete above. An `Update`, a `Provider` and a `Job` have no
              duplicate route, and a control that exists only to say "not for this
              kind of thing" is the shape this sheet has been removing.
            */}
            {canPerform('duplicate', item.contentType) && (
              <TouchableOpacity
                onPress={handleDuplicate}
                accessibilityRole="button"
                accessibilityLabel={`Make a draft copy of ${item.title}`}
                className="flex-row items-center py-3 border-b border-faint"
              >
                <Text className="text-lg mr-3">📄</Text>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-strong">Duplicate Content</Text>
                  <Text className="text-[9px] text-content-faint">Create a draft copy to reuse structure</Text>
                </View>
              </TouchableOpacity>
            )}

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
                <Text className="text-xs font-bold text-content-strong">About listing freshness</Text>
                <Text className="text-[9px] text-content-faint">How ranking works, and how to buy reach</Text>
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

            {/*
              A second "Promote (Coming Soon)" row used to sit here, directly
              below the working one, whose only behaviour was a toast reading
              *"Promote campaign tools are coming soon in Phase 3!"* — a
              roadmap phase number shown to a member, promising a feature nobody
              has scheduled, one row under the control that already buys reach.

              It is removed rather than reworded. `GET /financial/catalog` serves
              four promotion products with real `placementKind`, `priorityWeight`
              and `durationDays` values, `POST /financial/purchases` buys one, and
              the row above opens exactly that flow. There is no second, larger
              kind of promotion behind this row — "sponsored diaspora community
              banners" names no product, no route and no backlog item. A menu
              entry for a thing that does not exist is not a disclosure; it is an
              advertisement for vapour.
            */}

            {/* Danger Zone */}
            <Text className="text-[10px] font-black text-error-default uppercase tracking-widest mt-4 mb-2">Lifecycle Management</Text>

            {/* Offered only where the platform has the route. A control that
                exists in order to explain that it does not work is a control
                nobody should have to press. */}
            {canPerform('archive', item.contentType) ? (
              <TouchableOpacity
                onPress={handleArchive}
                className="flex-row items-center py-2.5"
                accessibilityRole="button"
                accessibilityLabel={`Archive ${item.title}`}
              >
                <Text className="text-lg mr-3">📦</Text>
                <Text className="text-xs font-bold text-content-secondary">Archive Content</Text>
              </TouchableOpacity>
            ) : null}

            {canPerform('delete', item.contentType) ? (
              <TouchableOpacity
                onPress={handleDelete}
                className="flex-row items-center py-2.5"
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Text className="text-lg mr-3">🗑️</Text>
                {/* "Delete Permanently" came off when the control did nothing.
                    It is "Delete" now — the dialog says the rest. */}
                <Text className="text-xs font-black text-error-default">Delete</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
