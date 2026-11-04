import React, { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/overlays/AppModal';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { backOr } from '@/lib/navigation';

/** The icons a member can pick for a collection folder. */
const FOLDER_ICONS = ['📁', '🏠', '✈️', '🛒', '🎓', '💼'];

interface CustomCollection {
  id: string;
  label: string;
  icon: string;
  count: number;
  isSystem: boolean;
}

export default function SavedCollectionsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
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
      showAlert({ type: 'error', title: 'Error', message: 'Please enter a folder name.' });
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
      showAlert({ type: 'warning', title: 'No Selection', message: 'Please select at least one custom collection to delete.' });
      return;
    }

    showAlert({ type: 'warning', title: 'Confirm Delete', message: `Are you sure you want to delete ${idsToRemove.length} collection folders?`, buttons: [
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
      ] });
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
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* Top Header */}
      <View className="px-6 py-4 border-b border-subtle bg-surface-card flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => backOr()} className="mr-4">
            <Text className="text-xl text-content-tertiary">←</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-black text-content-primary tracking-tight">Saved Collections</Text>
        </View>
        
        {/* Manage Mode Toggle */}
        <TouchableOpacity
          onPress={() => {
            setIsManageMode(!isManageMode);
            setSelectedIds({});
          }}
          className="bg-surface-background border border-subtle px-3.5 py-1.5 rounded-xl"
        >
          <Text className="text-xs font-bold text-content-tertiary">
            {isManageMode ? 'Cancel' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search and Sorting row */}
      <View className="bg-surface-card px-6 py-3 border-b border-faint flex-row gap-3">
        <View className="flex-1 bg-surface-background rounded-xl px-3 py-2 border border-subtle flex-row items-center">
          <Text className="text-sm mr-2 text-content-faint">🔍</Text>
          <TextInput
            placeholder="Search folders..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-xs text-content-secondary p-0"
          />
        </View>
        <TouchableOpacity
          onPress={() => setSortBy(sortBy === 'name' ? 'count' : 'name')}
          className="bg-surface-background border border-subtle px-3.5 rounded-xl items-center justify-center flex-row"
        >
          <Text className="text-[10px] font-bold text-content-tertiary">
            ⇅ {sortBy === 'name' ? 'Sort by Count' : 'Sort A-Z'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        
        {/* Action button to Create Custom Collection */}
        {!isManageMode && (
          <TouchableOpacity
            onPress={() => setCreateModalOpen(true)}
            className="bg-surface-card border-2 border-dashed border-line rounded-3xl p-5 mb-5 items-center justify-center"
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
                    col.isSystem ? 'border-subtle bg-surface-muted' : isSelected ? 'border-primary-500 bg-primary-500' : 'border-line bg-surface-card'
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
                    showAlert({ type: 'info', title: col.label, message: `${col.count} elements bookmarked inside this folder.` });
                  }
                }}
                activeOpacity={0.8}
                className="flex-1 bg-surface-card rounded-3xl p-5 border border-subtle flex-row items-center justify-between shadow-sm"
              >
                <View className="flex-row items-center">
                  <Text className="text-2xl mr-3">{col.icon}</Text>
                  <View>
                    <Text className="text-sm font-bold text-content-strong">{col.label}</Text>
                    <Text className="text-xs text-content-faint font-semibold mt-0.5">{col.count} elements bookmarked</Text>
                  </View>
                </View>
                <Text className="text-content-faint text-lg">›</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {filteredCollections.length === 0 && (
          <View className="items-center py-10">
            <Text className="text-xs text-content-faint font-bold">No collections found matching search.</Text>
          </View>
        )}

        <View className="h-20" />
      </ScrollView>

      {/* Floating Action Bar for Bulk Delete in Manage Mode */}
      {isManageMode && (
        <View className="absolute bottom-6 left-6 right-6 bg-surface-card border border-subtle rounded-3xl p-4 shadow-xl flex-row justify-between items-center z-50">
          <Text className="text-xs font-bold text-content-tertiary">
            {Object.values(selectedIds).filter(Boolean).length} custom folders selected
          </Text>
          <TouchableOpacity
            onPress={handleBulkDelete}
            className="bg-error-solid px-4 py-2.5 rounded-2xl"
          >
            <Text className="text-white font-extrabold text-xs">Delete Selected</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Create Collection Folder Dialog Overlay */}
      {/* Was a hand-rolled centred Modal with its own bg-black/40 scrim, no
          keyboard avoidance for its field, and no assistive-technology
          containment. Dialog supplies all three. */}
      <Dialog
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Collection Folder"
        testID="create-folder-dialog"
        footer={
          <View className="flex-row" style={{ gap: 12 }}>
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={() => setCreateModalOpen(false)} />
            </View>
            <View className="flex-1">
              <Button label="Create Folder" onPress={handleCreateFolder} />
            </View>
          </View>
        }
      >
        <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Folder Name</Text>
        <TextInput
          value={newFolderName}
          onChangeText={setNewFolderName}
          placeholder="e.g. London Housing Search"
          accessibilityLabel="Folder name"
          className="bg-surface-background border border-subtle rounded-xl p-3.5 text-sm mb-4"
          maxLength={30}
        />

        <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Select Folder Icon Emoji</Text>
        <View className="flex-row mb-2" style={{ gap: 8 }}>
          {FOLDER_ICONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => setNewFolderIcon(emoji)}
              // Was 40x40. These are the only way to set the icon, so they need
              // a fingertip-sized target (WCAG 2.5.5).
              style={{ minWidth: 44, minHeight: 44 }}
              accessibilityRole="radio"
              accessibilityLabel={`Folder icon ${emoji}`}
              accessibilityState={{ checked: newFolderIcon === emoji, selected: newFolderIcon === emoji }}
              className={`rounded-xl items-center justify-center border-2 ${
                newFolderIcon === emoji ? 'border-primary-500 bg-surface-muted' : 'border-subtle bg-surface-card'
              }`}
            >
              <Text className="text-lg">{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Dialog>

    </SafeAreaView>
  );
}
