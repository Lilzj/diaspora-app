// Community Life: the Directory tab's search.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import type { OrgCategory } from '@/types/community-life';

export function useDirectorySearch() {
  // --- Directory Tab State ---
  const [dirQuery, setDirQuery] = useState('');
  const [selectedDirCat, setSelectedDirCat] = useState<OrgCategory | 'All'>('All');

  return { dirQuery, setDirQuery, selectedDirCat, setSelectedDirCat };
}

/** What `useDirectorySearch` holds, as the screen reads it. */
export type DirectorySearch = ReturnType<typeof useDirectorySearch>;
