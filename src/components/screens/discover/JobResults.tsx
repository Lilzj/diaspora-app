// Discover: the Jobs tab's results.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View } from 'react-native';
import { JobCard } from '@/components/JobCard';
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

interface JobResultsProps {
  jobs: JobTab;
  origin: OriginFilter;
  search: DiscoverSearch;
}

export function JobResults({ jobs, origin, search }: JobResultsProps) {
  const { jobSearch, retryJobs } = jobs;
  const { filteredJobs } = origin;
  const { emptyStatePlace } = search;

  return (
    <View>
      <ListState
        error={jobSearch.isError ? couldNotLoad('jobs', 'We could not reach jobs just now.', false) : null}
        onRetry={retryJobs}
        isEmpty={filteredJobs.length === 0}
        empty={noMatch('jobs', emptyStatePlace)}
      >
        {filteredJobs.map((item, index) => (
          /* The cast is the same one `CommunityContentSection`
             makes for this route: `useScopedContent` returns
             rows from `GET /jobs` as opaque records because the
             community projection does not need their shape, and
             `JobCard` reads them as the `JobCardResponse` that
             route sends (RMD-009, 24 Nov 2026). Narrowing the
             row itself needs a typed jobs browse client. */
          <JobCard
            key={String(item.jobId ?? item.id ?? index)}
            job={item as never}
          />
        ))}
      </ListState>
      {jobSearch.hasMore ? (
        <ShowMoreButton label="Show more jobs" state={pagingState(jobSearch)} onPress={jobSearch.loadMore} />
      ) : null}
    </View>
  );
}
