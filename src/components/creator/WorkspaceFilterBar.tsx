import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreatorWorkspaceStore } from '@/store/creator-workspace';
import { WorkspaceFilters } from '@/types/creator';

interface WorkspaceFilterBarProps {
  visible: boolean;
  onClose: () => void;
}

export const WorkspaceFilterBar: React.FC<WorkspaceFilterBarProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const { filters, setStatusFilter, setDateRange, setSortOption, resetFilters } = useCreatorWorkspaceStore();

  const statuses = [
    'Published',
    'Draft',
    'Archived',
    'Available',
    'Reserved',
    'Sold',
    'Rented',
    'Open',
    'Interviewing',
    'Filled',
    'Paused',
    'Expired',
    'Hidden',
  ];

  const dateRanges: { key: WorkspaceFilters['dateRange']; label: string }[] = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
  ];

  const sortOptions: { key: WorkspaceFilters['sortOption']; label: string }[] = [
    { key: 'newest', label: 'Newest First' },
    { key: 'oldest', label: 'Oldest First' },
    { key: 'most_viewed', label: 'Most Viewed' },
    { key: 'most_saved', label: 'Most Saved' },
    { key: 'most_commented', label: 'Most Commented' },
    { key: 'most_messages', label: 'Most Messages' },
    { key: 'recently_updated', label: 'Recently Updated' },
    { key: 'alphabetical', label: 'Alphabetical' },
  ];

  const toggleStatus = (st: string) => {
    if (filters.statusFilter.includes(st)) {
      setStatusFilter(filters.statusFilter.filter((s) => s !== st));
    } else {
      setStatusFilter([...filters.statusFilter, st]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <TouchableOpacity
          activeOpacity={1}
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          className="bg-white rounded-t-3xl p-6 max-h-[85%]"
        >
          {/* Drag Handle Indicator */}
          <View className="w-12 h-1.5 bg-neutral-200 rounded-full self-center mb-3" />

          {/* Header */}
          <View className="flex-row justify-between items-center pb-4 border-b border-neutral-100 mb-4">
            <View>
              <Text className="text-base font-black text-neutral-900 tracking-tight">Advanced Content Filters</Text>
              <Text className="text-xs text-neutral-500">Filter and sort your workspace items</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="bg-neutral-100 p-2 rounded-full">
              <Text className="text-xs font-black text-neutral-600">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Status Section */}
            <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-2.5">Filter by Status</Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
              {statuses.map((st) => {
                const isSelected = filters.statusFilter.includes(st);
                return (
                  <TouchableOpacity
                    key={st}
                    onPress={() => toggleStatus(st)}
                    className={`px-3 py-1.5 rounded-xl border ${
                      isSelected ? 'bg-primary-500 border-primary-500' : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{st}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date Range Section */}
            <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-2.5">Date Range</Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
              {dateRanges.map((range) => {
                const isSelected = filters.dateRange === range.key;
                return (
                  <TouchableOpacity
                    key={range.key}
                    onPress={() => setDateRange(range.key)}
                    className={`px-3 py-1.5 rounded-xl border ${
                      isSelected ? 'bg-primary-500 border-primary-500' : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{range.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sort Option Section */}
            <Text className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-2.5">Sort Order</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {sortOptions.map((sort) => {
                const isSelected = filters.sortOption === sort.key;
                return (
                  <TouchableOpacity
                    key={sort.key}
                    onPress={() => setSortOption(sort.key)}
                    className={`px-3 py-1.5 rounded-xl border ${
                      isSelected ? 'bg-neutral-900 border-neutral-900' : 'bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-700'}`}>{sort.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Fixed Actions at Bottom */}
          <View className="flex-row gap-3 pt-3 border-t border-neutral-100 mt-1">
            <TouchableOpacity onPress={resetFilters} className="flex-1 bg-neutral-100 py-3 rounded-2xl items-center">
              <Text className="text-xs font-black text-neutral-700">Reset Filters</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} className="flex-1 bg-primary-500 py-3 rounded-2xl items-center">
              <Text className="text-xs font-black text-white">Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
