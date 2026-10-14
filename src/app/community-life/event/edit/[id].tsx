// ─────────────────────────────────────────────────────────────────────────────
// Edit an event
//
// **Added 14 Oct 2026.** An organiser could remove their event (13 Oct) but not
// correct it: `updateEvent` existed, had been fixed from PUT to PATCH, and had no
// caller. This screen reads the event untranslated (`fetchEventForEdit` — the
// detail screen's `toEvent` folds the summary into the description and the
// category key into a name, the two things an edit has to send back) and saves
// through `saveEventEdits`, which sends only the fields that changed, then the
// photos. See the OWNER EDITS section of `lib/community-life-api.ts`.
//
// **Not editable here: the date, time and time zone.** `POST /events/{id}/schedule`
// exists, but the create screen builds its instants through `convertToInstant`
// and a zone picker, and this app has already stored events three hours out once.
// A second, simpler path to the same instants is how that comes back, so
// rescheduling waits until it can reuse the create screen's own timing step.
// Neither is the place or the venue (`/location`, a different request shape).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useCommunityLifeCatalogue } from '@/hooks/community-life-catalogue';
import { toLocalFile } from '@/hooks/media';
import {
  editErrorMessage,
  eventEditFormFrom,
  eventEditMissing,
  eventEditProblem,
  fetchEventForEdit,
  saveEventEdits,
  type EventEditForm,
} from '@/lib/community-life-api';
import type { EventWire } from '@/lib/event-wire';
import { uploadDirect } from '@/lib/media-api';
import { photoUriOf } from '@/lib/media-url';
import { backOr } from '@/lib/navigation';
import { useNotification } from '@/providers/notification-provider';
import { useAuthStore } from '@/store/auth';

/** States in which the server refuses every edit (`EnsureEditable`). */
const LOCKED_STATUSES: Record<string, string> = {
  Cancelled: 'A cancelled event cannot be changed.',
  Completed: 'This event has already happened, so it cannot be changed.',
  Archived: 'A removed event cannot be changed.',
};

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const viewerId = useAuthStore((state) => state.user?.userId ?? null);

  // Its own key, never shared with a list: an edit must start from what the
  // server holds now, not from a card fetched minutes ago.
  const query = useQuery({
    queryKey: ['community-life', 'edit', 'event', id],
    queryFn: () => fetchEventForEdit(id),
    enabled: Boolean(id),
    staleTime: 0,
    gcTime: 0,
  });

  if (query.isLoading) {
    return (
      <Frame>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
        </View>
      </Frame>
    );
  }

  const wire = query.data;

  if (query.isError || !wire) {
    const notFound = (query.error as { httpStatus?: number } | null)?.httpStatus === 404;
    return (
      <Frame>
        <EmptyState
          icon={notFound ? '🔍' : '📡'}
          title={notFound ? 'Event not found' : 'Could not open this event'}
          description={notFound ? 'This event is not there any more.' : editErrorMessage(query.error)}
          action={notFound ? undefined : <Button label="Try again" onPress={() => void query.refetch()} />}
        />
      </Frame>
    );
  }

  // The same comparison the event page uses for `isOrganiser`. The route checks
  // again on save, so this only decides whether to offer the form.
  const isOrganiser = viewerId != null && wire.organizerUserId != null && wire.organizerUserId === viewerId;
  if (!isOrganiser) {
    return (
      <Frame>
        <EmptyState icon="🔒" title="You can only edit your own events" description="This event is organised by someone else." />
      </Frame>
    );
  }

  const locked = wire.status ? LOCKED_STATUSES[wire.status] : undefined;
  if (locked) {
    return (
      <Frame>
        <EmptyState icon="🗓️" title="This event cannot be edited" description={locked} />
      </Frame>
    );
  }

  const eventId = wire.eventId ?? wire.id ?? id;
  // Keyed by revision, so a re-read underneath restarts the form from it.
  return <EditEventForm key={`${eventId}:${String(wire.revision ?? '')}`} eventId={eventId} wire={wire} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit event" showBack onBack={() => backOr()} />
      {children}
    </SafeAreaView>
  );
}

/** A photo added in this session: uploaded already, attached on save. */
interface AddedPhoto {
  mediaId: string;
  /** The device's copy. The platform's rendition may still be processing. */
  localUri: string;
}

function EditEventForm({ eventId, wire }: { eventId: string; wire: EventWire }) {
  const bottomInset = useBottomInset();
  const client = useQueryClient();
  const { showAlert, showToast } = useNotification();
  const { eventCategories, isUnavailable: catalogueUnavailable } = useCommunityLifeCatalogue();

  const initial = useMemo(() => eventEditFormFrom(wire), [wire]);
  const [form, setForm] = useState<EventEditForm>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<AddedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const update = <K extends keyof EventEditForm>(key: K, value: EventEditForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // One tile per asset: the cover is often in the gallery too.
  const existing = useMemo(() => {
    const seen = new Set<string>();
    return (wire.media ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((ref): ref is { mediaId: string; role?: string } => {
        if (typeof ref.mediaId !== 'string' || seen.has(ref.mediaId)) return false;
        seen.add(ref.mediaId);
        return true;
      });
  }, [wire.media]);

  const isChanged =
    JSON.stringify(form) !== JSON.stringify(initial) || removed.length > 0 || added.length > 0;
  const stillNeeded = eventEditMissing(form);
  const valueProblem = stillNeeded.length > 0 ? null : eventEditProblem(form);

  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({ type: 'error', title: 'No access to photos', message: 'Allow Diaspora to use your photos to add one.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const picked = result.assets[0];
    setIsUploading(true);
    try {
      // Uploaded now, attached on save — so a member who leaves without saving
      // has changed nothing on the event.
      const asset = await uploadDirect(toLocalFile(picked));
      setAdded((current) => [...current, { mediaId: asset.mediaId, localUri: picked.uri }]);
    } catch (cause) {
      showAlert({ type: 'error', title: 'Photo not added', message: editErrorMessage(cause) });
    } finally {
      setIsUploading(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await saveEventEdits(eventId, wire, form, {
        removed,
        added: added.map((photo) => photo.mediaId),
      });
      // The event page, Discover, the calendar and Creator Studio all show it.
      void client.invalidateQueries();
      showToast({ type: 'success', title: 'Event updated', message: 'Your changes are saved.' });
      backOr(`/community-life/event/${eventId}`);
    } catch (cause) {
      // The form stays as typed. Every step of the save is safe to repeat.
      showAlert({ type: 'error', title: 'Not saved', message: editErrorMessage(cause) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit event" showBack onBack={() => backOr(`/community-life/event/${eventId}`)} />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView className="flex-1 px-5 pt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="pb-8">
            <Input label="Title" value={form.title} onChangeText={(value) => update('title', value)} maxLength={200} />
            <Input
              label="Summary"
              placeholder="The one line shown on event cards"
              value={form.summary}
              onChangeText={(value) => update('summary', value)}
              maxLength={400}
              multiline
              className="h-20 py-3"
              textAlignVertical="top"
            />
            <Input
              label="Description (optional)"
              value={form.description}
              onChangeText={(value) => update('description', value)}
              multiline
              className="h-40 py-3"
              textAlignVertical="top"
            />

            <SectionLabel>Category</SectionLabel>
            {catalogueUnavailable ? (
              <Text className="text-xs text-content-muted mb-2">
                The list of categories could not be loaded. The current one is kept.
              </Text>
            ) : eventCategories.length === 0 ? (
              <ActivityIndicator color="#F59300" />
            ) : (
              <Chips
                options={eventCategories.map((category) => ({ value: category.key, label: category.name }))}
                selected={form.categoryKey}
                onSelect={(value) => update('categoryKey', value)}
              />
            )}

            <View className="mt-6">
              <Input
                label="Places (optional)"
                placeholder="No limit"
                value={form.capacity}
                onChangeText={(value) => update('capacity', value)}
                keyboardType="number-pad"
              />
              <Text className="text-xs text-content-muted -mt-2 mb-2 leading-relaxed">
                Leave it empty for no limit.
              </Text>
            </View>

            <Toggle
              label="Free to attend"
              hint="Untick it if people pay to come, and say how in the description."
              checked={form.isFree}
              onToggle={() => update('isFree', !form.isFree)}
            />

            <SectionLabel className="mt-6">How to reach you</SectionLabel>
            <Input label="Phone (optional)" value={form.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
            <Input label="WhatsApp (optional)" value={form.whatsApp} onChangeText={(value) => update('whatsApp', value)} keyboardType="phone-pad" />
            <Input
              label="Email (optional)"
              value={form.email}
              onChangeText={(value) => update('email', value)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Website (optional)"
              placeholder="https://"
              value={form.website}
              onChangeText={(value) => update('website', value)}
              keyboardType="url"
              autoCapitalize="none"
            />

            <SectionLabel className="mt-2">Photos</SectionLabel>
            <PhotoGrid
              existing={existing}
              removed={removed}
              added={added}
              isUploading={isUploading}
              onRemoveExisting={(mediaId) => setRemoved((current) => [...current, mediaId])}
              onRestoreExisting={(mediaId) => setRemoved((current) => current.filter((item) => item !== mediaId))}
              onRemoveAdded={(mediaId) => setAdded((current) => current.filter((photo) => photo.mediaId !== mediaId))}
              onAdd={() => void addPhoto()}
            />
          </View>
        </ScrollView>

        <View className="px-5 py-4 border-t border-faint bg-surface-card" style={{ paddingBottom: Math.max(16, bottomInset) }}>
          {stillNeeded.length > 0 ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">Still needed: {stillNeeded.join(', ')}</Text>
          ) : valueProblem ? (
            <Text className="text-xs font-semibold text-content-muted mb-3">{valueProblem}</Text>
          ) : null}
          <Button
            label="Save changes"
            isLoading={isSaving}
            disabled={!isChanged || stillNeeded.length > 0 || valueProblem !== null || isSaving || isUploading}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PhotoGrid({
  existing,
  removed,
  added,
  isUploading,
  onRemoveExisting,
  onRestoreExisting,
  onRemoveAdded,
  onAdd,
}: {
  existing: { mediaId: string; role?: string }[];
  removed: string[];
  added: AddedPhoto[];
  isUploading: boolean;
  onRemoveExisting: (mediaId: string) => void;
  onRestoreExisting: (mediaId: string) => void;
  onRemoveAdded: (mediaId: string) => void;
  onAdd: () => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {existing.map((ref) => {
        const isRemoved = removed.includes(ref.mediaId);
        return (
          <View key={ref.mediaId} className="w-24 h-24 rounded-xl overflow-hidden bg-surface-card border border-subtle">
            <Image
              source={{ uri: photoUriOf(ref.mediaId, 'small') ?? undefined }}
              style={{ width: '100%', height: '100%', opacity: isRemoved ? 0.3 : 1 }}
              contentFit="cover"
            />
            {(ref.role === 'Cover' || ref.role === 'Logo') && !isRemoved ? (
              <View className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded bg-black/60">
                <Text className="text-[10px] font-bold text-white">{ref.role}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isRemoved ? 'Keep this photo' : 'Remove this photo'}
              onPress={() => (isRemoved ? onRestoreExisting(ref.mediaId) : onRemoveExisting(ref.mediaId))}
              className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 items-center justify-center"
            >
              <Ionicons name={isRemoved ? 'arrow-undo' : 'close'} size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        );
      })}
      {added.map((photo) => (
        <View key={photo.mediaId} className="w-24 h-24 rounded-xl overflow-hidden bg-surface-card border border-subtle">
          <Image source={{ uri: photo.localUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          <View className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded bg-black/60">
            <Text className="text-[10px] font-bold text-white">New</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Remove this new photo"
            onPress={() => onRemoveAdded(photo.mediaId)}
            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 items-center justify-center"
          >
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Add a photo"
        disabled={isUploading}
        onPress={onAdd}
        className="w-24 h-24 rounded-xl border border-dashed border-subtle items-center justify-center bg-surface-background"
      >
        {isUploading ? (
          <ActivityIndicator color="#F59300" />
        ) : (
          <>
            <Ionicons name="add" size={24} color="#F59300" />
            <Text className="text-[11px] font-bold text-content-secondary mt-1">Add photo</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3 ${className}`}>
      {children}
    </Text>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={onToggle}
      className="flex-row items-center justify-between p-4 rounded-2xl border border-subtle bg-surface-card mt-2"
    >
      <View className="flex-1 mr-3">
        <Text className="text-sm font-bold text-content-primary">{label}</Text>
        {hint ? <Text className="text-xs text-content-muted mt-0.5">{hint}</Text> : null}
      </View>
      <Text className="text-lg">{checked ? '✅' : '⬜'}</Text>
    </TouchableOpacity>
  );
}

function Chips({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === option.value }}
          onPress={() => onSelect(option.value)}
          className={`px-3.5 py-2 rounded-full border ${
            selected === option.value ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
          }`}
        >
          <Text className={`text-xs font-bold ${selected === option.value ? 'text-white' : 'text-content-secondary'}`}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
