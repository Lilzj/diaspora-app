import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';

interface CustomCollection {
  id: string;
  label: string;
  icon: string;
  count: number;
  isSystem: boolean;
}

export default function SavedCollectionsScreen() {
  const { getCountByType } = useSavedStore();

  // Local state for collections
  const [customCollections, setCustomCollections] = useState<CustomCollection[]>([
    { id: 'custom-1', label: 'London Housing Search', icon: '📁', count: 4, isSystem: false },
    { id: 'custom-2', label: 'Visa Documents', icon: '📁', count: 1, isSystem: false },
    { id: 'custom-3', label: 'African Grocers List', icon: '📁', count: 3, isSystem: false },
  ]);

  // Merge system and custom collections dynamically
  const collections = [
    { id: 'guide', label: 'Saved Guides', icon: '📖', count: getCountByType('Guide'), isSystem: true },
    { id: 'provider', label: 'Saved Listings', icon: '📍', count: getCountByType('Listing'), isSystem: true },
    { id: 'job', label: 'Saved Jobs', icon: '💼', count: getCountByType('Job'), isSystem: true },
    { id: 'housing', label: 'Saved Housing', icon: '🏠', count: getCountByType('Housing'), isSystem: true },
    { id: 'event', label: 'Saved Events', icon: '🎉', count: getCountByType('Event'), isSystem: true },
    { id: 'org', label: 'Saved Hubs', icon: '🏛', count: getCountByType('Organization'), isSystem: true },
    ...customCollections,
  ];

  // Folder creation states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');

  // Search & Sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'count'>('name');

  // Bulk Management states
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Handle folder creation
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name.');
      return;
    }
    const newFolder: CustomCollection = {
      id: `custom-${Date.now()}`,
      label: newFolderName.trim(),
      icon: newFolderIcon,
      count: 0,
      isSystem: false,
    };
    setCustomCollections((prev) => [...prev, newFolder]);
    setNewFolderName('');
    setCreateModalOpen(false);
  };

  // Toggle selection for bulk delete
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Bulk delete selected items
  const handleBulkDelete = () => {
    const idsToRemove = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (idsToRemove.length === 0) {
      Alert.alert('No Selection', 'Please select at least one custom collection to delete.');
      return;
    }

    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete ${idsToRemove.length} collection folders?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setCustomCollections((prev) => prev.filter((c) => !idsToRemove.includes(c.id)));
            setSelectedIds({});
            setIsManageMode(false);
          },
        },
      ]
    );
  };

  // Filter and Sort collections
  const filteredCollections = collections
    .filter((c) => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.label.localeCompare(b.label);
      } else {
        return b.count - a.count;
      }
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50/40">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-neutral-200 bg-white flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-xl text-neutral-600">←</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-black text-neutral-900 tracking-tight">Saved Collections</Text>
        </View>
        
        {/* Manage Mode Toggle */}
        <TouchableOpacity
          onPress={() => {
            setIsManageMode(!isManageMode);
            setSelectedIds({});
          }}
          className="bg-neutral-50 border border-neutral-200 px-3.5 py-1.5 rounded-xl"
        >
          <Text className="text-xs font-bold text-neutral-600">
            {isManageMode ? 'Cancel' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search and Sorting row */}
      <View className="bg-white px-6 py-3 border-b border-neutral-100 flex-row gap-3">
        <View className="flex-1 bg-neutral-50 rounded-xl px-3 py-2 border border-neutral-200 flex-row items-center">
          <Text className="text-sm mr-2 text-neutral-400">🔍</Text>
          <TextInput
            placeholder="Search folders..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-xs text-neutral-700 p-0"
          />
        </View>
        <TouchableOpacity
          onPress={() => setSortBy(sortBy === 'name' ? 'count' : 'name')}
          className="bg-neutral-50 border border-neutral-200 px-3.5 rounded-xl items-center justify-center flex-row"
        >
          <Text className="text-[10px] font-bold text-neutral-600">
            ⇅ {sortBy === 'name' ? 'Sort by Count' : 'Sort A-Z'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* Action button to Create Custom Collection */}
        {!isManageMode && (
          <TouchableOpacity
            onPress={() => setCreateModalOpen(true)}
            className="bg-white border-2 border-dashed border-neutral-300 rounded-3xl p-5 mb-5 items-center justify-center"
          >
            <Text className="text-sm font-bold text-primary-500">+ Create New Collection Folder</Text>
          </TouchableOpacity>
        )}

        {/* Collections Folders Grid */}
        {filteredCollections.map((col) => {
          const isSelected = selectedIds[col.id];
          return (
            <View key={col.id} className="flex-row items-center mb-3">
              {/* Checkbox selector in Manage Mode (Custom collections only) */}
              {isManageMode && (
                <TouchableOpacity
                  disabled={col.isSystem}
                  onPress={() => toggleSelection(col.id)}
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center mr-3 ${
                    col.isSystem ? 'border-neutral-200 bg-neutral-100' : isSelected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300 bg-white'
                  }`}
                >
                  {isSelected && <Text className="text-white text-[10px] font-black">✓</Text>}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (col.isSystem) {
                    const categoryParam = 
                      col.id === 'guide' ? 'Guide' : 
                      col.id === 'provider' ? 'Listing' : 
                      col.id === 'job' ? 'Job' : 
                      col.id === 'housing' ? 'Housing' : 
                      col.id === 'event' ? 'Event' : 'Organization';
                    router.push(`/saved/${categoryParam}`);
                  } else {
                    Alert.alert(col.label, `${col.count} elements bookmarked inside this folder.`);
                  }
                }}
                activeOpacity={0.8}
                className="flex-1 bg-white rounded-3xl p-5 border border-neutral-200 flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-3">{col.icon}</Text>
                  <View>
                    <Text className="text-sm font-bold text-neutral-800">{col.label}</Text>
                    <Text className="text-xs text-neutral-400 font-semibold mt-0.5">{col.count} elements bookmarked</Text>
                  </View>
                </View>
                <Text className="text-neutral-300 text-lg">›</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {filteredCollections.length === 0 && (
          <View className="items-center py-10">
            <Text className="text-xs text-neutral-400 font-bold">No collections found matching search.</Text>
          </View>
        )}

        <View className="h-20" />
      </ScrollView>

      {/* Floating Action Bar for Bulk Delete in Manage Mode */}
      {isManageMode && (
        <View className="absolute bottom-6 left-6 right-6 bg-white border border-neutral-200 rounded-3xl p-4 shadow-xl flex-row justify-between items-center z-50">
          <Text className="text-xs font-bold text-neutral-600">
            {Object.values(selectedIds).filter(Boolean).length} custom folders selected
          </Text>
          <TouchableOpacity
            onPress={handleBulkDelete}
            className="bg-error-default px-4 py-2.5 rounded-2xl"
          >
            <Text className="text-white font-extrabold text-xs">Delete Selected</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Create Collection Folder Dialog Overlay */}
      <Modal
        visible={createModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCreateModalOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCreateModalOpen(false)}
          className="flex-1 justify-center bg-black/40 px-6"
        >
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-3xl p-6 shadow-2xl w-full">
              <Text className="text-lg font-black text-neutral-900 mb-4">Create Collection Folder</Text>
              
              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Folder Name</Text>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="e.g. London Housing Search"
                className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-sm mb-4"
                maxLength={30}
              />

              <Text className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Select Folder Icon Emoji</Text>
              <View className="flex-row gap-2 mb-6">
                {['📁', '🏠', '✈️', '🛒', '🎓', '💼'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => setNewFolderIcon(emoji)}
                    className={`w-10 h-10 rounded-xl items-center justify-center border-2 ${
                      newFolderIcon === emoji ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <Text className="text-lg">{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setCreateModalOpen(false)}
                  className="flex-1 bg-neutral-100 py-3 rounded-xl items-center"
                >
                  <Text className="text-xs font-bold text-neutral-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateFolder}
                  className="flex-1 bg-primary-500 py-3 rounded-xl items-center"
                >
                  <Text className="text-white font-bold text-xs">Create Folder</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}
