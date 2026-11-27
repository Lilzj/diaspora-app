// Discover: the Jobs tab's filters.
// Lifted out of `app/(tabs)/discover.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { JOB_TYPE_CHOICES } from '@/lib/platform/discover-filters';
import type { DiscoverFilters } from '@/components/screens/discover/useDiscoverFilters';
import type { DiscoverSearch } from '@/components/screens/discover/useDiscoverSearch';

interface JobFiltersProps {
  filters: DiscoverFilters;
  search: DiscoverSearch;
}

export function JobFilters({ filters, search }: JobFiltersProps) {
  const { filterVerified, setFilterVerified } = filters;
  const { selectedJobType, setSelectedJobType } = search;

  return (
    <View>
      {/* Employment Type */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Employment Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-5">
        {JOB_TYPE_CHOICES.map((type) => {
          const isSel = selectedJobType === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => setSelectedJobType(isSel ? null : type)}
              className={`px-4 py-2.5 rounded-full mr-2.5 ${
                          isSel ? 'bg-primary-500' : 'bg-surface-background border border-subtle'
                        }`}
            >
              <Text className={`text-xs font-bold ${isSel ? 'text-white' : 'text-content-secondary'}`}>
                {type}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* No "Accommodation / Meals / Transport included" here any more.
          The job search filters on none of them, the browse row does
          not carry them, and a posting's benefits are free-text lines
          rather than three booleans — see `JobCard`, whose header
          records that the wire has no `benefitsFlags` at all. Three
          toggles that set state nobody read is a promise this screen
          could not keep. */}

      {/* Verified Employer toggle */}
      <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">Trust Level</Text>
      <TouchableOpacity
        onPress={() => setFilterVerified(!filterVerified)}
        className={`flex-row items-center justify-between p-4 rounded-2xl mb-6 ${
                    filterVerified ? 'bg-surface-muted border border-subtle' : 'bg-surface-background'
                  }`}
      >
        <Text className="text-sm font-semibold text-content-primary">
          Show only Verified Employers
        </Text>
        <Text className="text-lg">{filterVerified ? '✅' : '⬜'}</Text>
      </TouchableOpacity>
    </View>
  );
}
