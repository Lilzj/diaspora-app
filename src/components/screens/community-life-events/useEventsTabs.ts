// Community Life: which of the four tabs is open, including the one a link asked for.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';

export function useEventsTabs() {
  // `?tab=` so a link can land on the right tab. §22 asks for one canonical
  // destination per concept; without this, "the directory" was only reachable by
  // opening the events tab and tapping across, so callers that wanted it either
  // could not say so or invented a second route to say it with.
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'events' | 'directory' | 'calendar' | 'saved'>('events');

  useEffect(() => {
    if (params.tab && ['events', 'directory', 'calendar', 'saved'].includes(params.tab)) {
      setActiveTab(params.tab as typeof activeTab);
    }
  }, [params.tab]);

  return { activeTab, setActiveTab };
}

/** What `useEventsTabs` holds, as the screen reads it. */
export type EventsTabs = ReturnType<typeof useEventsTabs>;
