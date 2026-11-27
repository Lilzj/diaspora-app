// Community Life: the events and organisations the member saved, and the Saved tab's search.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState, useMemo } from 'react';
import { useSavedStore } from '@/store/saved';
import { organizationKind } from '@/lib/domain/organization-summary';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';

export function useSavedItems(lists: CommunityLifeLists) {
  const { eventsList, orgsList } = lists;

  const { savedItems, save, unsave, isSaved } = useSavedStore();

  // --- Saved Tab State ---
  const [savedSearchQuery, setSavedSearchQuery] = useState('');

  // Toggle Saved Item
  const handleSaveToggle = (id: string, type: 'Event' | 'Organization') => {
    if (isSaved(id)) {
      unsave(id);
    } else {
      save(id, type);
    }
  };

  // Filtered Saved Content with search query support
  const savedEvents = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Event') bookmarkedIds.push(id);
    });
    const matches = eventsList.filter(e => bookmarkedIds.includes(e.id));
    if (!savedSearchQuery) return matches;
    return matches.filter(e => 
      e.title.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      e.category.toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [eventsList, savedItems, savedSearchQuery]);

  const followedOrgs = useMemo(() => {
    const bookmarkedIds: string[] = [];
    savedItems.forEach((type, id) => {
      if (type === 'Organization') bookmarkedIds.push(id);
    });
    const matches = orgsList.filter(o => bookmarkedIds.includes(o.organizationId));
    if (!savedSearchQuery) return matches;
    return matches.filter(o => 
      o.name.toLowerCase().includes(savedSearchQuery.toLowerCase()) || 
      organizationKind(o).toLowerCase().includes(savedSearchQuery.toLowerCase())
    );
  }, [orgsList, savedItems, savedSearchQuery]);

  return {
    isSaved, savedSearchQuery, setSavedSearchQuery, handleSaveToggle, savedEvents, followedOrgs,
  };
}

/** What `useSavedItems` holds, as the screen reads it. */
export type SavedItems = ReturnType<typeof useSavedItems>;
