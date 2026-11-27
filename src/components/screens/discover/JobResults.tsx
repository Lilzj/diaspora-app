// Discover: the Jobs tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it. The
// screen's one virtualised list draws the rows, each a `JobCard` (FARCH-004,
// 27 Nov 2026); this file says what the list says in place of rows, and gives
// it the next page below them.

import React from 'react';
import { ListState } from '@/components/ListState';
import {
  ShowMoreButton,
  couldNotLoad,
  noMatch,
  pagingState,
} from '@/components/screens/discover/ResultStates';
import type { JobTab } from '@/components/screens/discover/useJobTab';
import type { OriginFilter } from '@/components/screens/discover/useOriginFilter';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

/** Whether the tab says it could not ask, in place of its rows. */
export function jobsFailed({ jobSearch }: JobTab): boolean {
  return jobSearch.isError;
}

/** In place of the rows. */
export function JobState({ jobs, origin, search }: { jobs: JobTab; origin: OriginFilter; search: DiscoverSearch }) {
  const { retryJobs } = jobs;
  const { filteredJobs } = origin;
  const { emptyStatePlace } = search;

  return (
    <ListState
      error={jobsFailed(jobs) ? couldNotLoad('jobs', 'We could not reach jobs just now.', false) : null}
      onRetry={retryJobs}
      isEmpty={filteredJobs.length === 0}
      empty={noMatch('jobs', emptyStatePlace)}
    />
  );
}

/** Below the rows: the next page, on request. */
export function JobMore({ jobs }: { jobs: JobTab }) {
  const { jobSearch } = jobs;
  return jobSearch.hasMore ? (
    <ShowMoreButton label="Show more jobs" state={pagingState(jobSearch)} onPress={jobSearch.loadMore} />
  ) : null;
}
