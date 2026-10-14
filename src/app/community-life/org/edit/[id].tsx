// ─────────────────────────────────────────────────────────────────────────────
// Edit an organisation
//
// **Added 14 Oct 2026.** A manager could remove their organisation (13 Oct) but
// not correct it: `PATCH /community-life/organizations/{id}` and both media
// routes were served and had no caller. This screen reads the organisation as
// the server sends it and saves through `saveOrganizationEdits`, which sends only
// the fields that changed, then the photos. See the OWNER EDITS section of
// `lib/community-life-api.ts` — in particular, the contact details and social
// links are replaced whole on the server, so a change to one channel sends all.
//
// Not editable here: the place (re-filing a town needs the create flow's
// picker), opening hours (edited on the page itself), leaders, services and the
// membership policy, which have their own controls or routes.
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
  fetchOrganizationForEdit,
  organizationEditFormFrom,
  organizationEditMissing,
  organizationEditProblem,
  saveOrganizationEdits,
  type OrganizationEditForm,
} from '@/lib/community-life-api';
import { uploadDirect } from '@/lib/media-api';
import { photoUriOf } from '@/lib/media-url';
import { backOr } from '@/lib/navigation';
import { useNotification } from '@/providers/notification-provider';
import type { OrganizationWire } from '@/types/community-life';

export default function EditOrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Its own key, never shared with a list: an edit must start from what the
  // server holds now.
  const query = useQuery({
    queryKey: ['community-life', 'edit', 'organization', id],
    queryFn: () => fetchOrganizationForEdit(id),
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
          title={notFound ? 'Organisation not found' : 'Could not open this organisation'}
          description={notFound ? 'This organisation is not there any more.' : editErrorMessage(query.error)}
          action={notFound ? undefined : <Button label="Try again" onPress={() => void query.refetch()} />}
        />
      </Frame>
    );
  }

  // The page's own `canManage`: the server's word for the viewer's role, not an
  // id comparison. The route checks again on save.
  const canManage = wire.viewerMembershipRole === 'Owner' || wire.viewerMembershipRole === 'Administrator';
  if (!canManage) {
    return (
      <Frame>
        <EmptyState
          icon="🔒"
          title="You can only edit your own organisations"
          description="Only this organisation's owner or administrators can change its page."
        />
      </Frame>
    );
  }

  if (wire.status === 'Archived') {
    return (
      <Frame>
        <EmptyState icon="🗄️" title="This organisation has been removed" description="A removed organisation cannot be changed." />
      </Frame>
    );
  }

  // Keyed by revision, so a re-read underneath restarts the form from it.
  return <EditOrganizationForm key={`${wire.organizationId}:${String(wire.revision ?? '')}`} wire={wire} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit organisation" showBack onBack={() => backOr()} />
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

const SOCIAL_FIELDS: { key: keyof OrganizationEditForm; label: string }[] = [
  { key: 'facebook', label: 'Facebook (optional)' },
  { key: 'instagram', label: 'Instagram (optional)' },
  { key: 'twitter', label: 'X / Twitter (optional)' },
  { key: 'youTube', label: 'YouTube (optional)' },
  { key: 'linkedIn', label: 'LinkedIn (optional)' },
  { key: 'tikTok', label: 'TikTok (optional)' },
];

function EditOrganizationForm({ wire }: { wire: OrganizationWire }) {
  const organizationId = wire.organizationId;
  const bottomInset = useBottomInset();
  const client = useQueryClient();
  const { showAlert, showToast } = useNotification();
  const { organizationTypes, isUnavailable: catalogueUnavailable } = useCommunityLifeCatalogue();

  const initial = useMemo(() => organizationEditFormFrom(wire), [wire]);
  const [form, setForm] = useState<OrganizationEditForm>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<AddedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const update = <K extends keyof OrganizationEditForm>(key: K, value: OrganizationEditForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // One tile per asset: the logo or cover can be in the gallery too.
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
  const stillNeeded = organizationEditMissing(form);
  const valueProblem = stillNeeded.length > 0 ? null : organizationEditProblem(form);

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
      // Uploaded now, attached on save, so leaving without saving changes nothing.
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
      await saveOrganizationEdits(organizationId, wire, form, {
        removed,
        added: added.map((photo) => photo.mediaId),
      });
      // The page, the directory and Creator Studio all show it.
      void client.invalidateQueries();
      showToast({ type: 'success', title: 'Organisation updated', message: 'Your changes are saved.' });
      backOr(`/community-life/org/${organizationId}`);
    } catch (cause) {
      // The form stays as typed. Every step of the save is safe to repeat.
      showAlert({ type: 'error', title: 'Not saved', message: editErrorMessage(cause) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Edit organisation" showBack onBack={() => backOr(`/community-life/org/${organizationId}`)} />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView className="flex-1 px-5 pt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="pb-8">
            <Input label="Name" value={form.name} onChangeText={(value) => update('name', value)} maxLength={200} />
            <Input
              label="Summary"
              placeholder="The one line shown in the directory"
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
            <Input
              label="Mission (optional)"
              value={form.mission}
              onChangeText={(value) => update('mission', value)}
              maxLength={4000}
              multiline
              className="h-24 py-3"
              textAlignVertical="top"
            />

            <SectionLabel>Type of organisation</SectionLabel>
            {catalogueUnavailable ? (
              <Text className="text-xs text-content-muted mb-2">
                The list of types could not be loaded. The current one is kept.
              </Text>
            ) : organizationTypes.length === 0 ? (
              <ActivityIndicator color="#F59300" />
            ) : (
              <Chips
                options={organizationTypes.map((type) => ({ value: type.key, label: type.name }))}
                selected={form.organizationTypeKey}
                onSelect={(value) => update('organizationTypeKey', value)}
              />
            )}

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

            <SectionLabel className="mt-2">Social media</SectionLabel>
            {SOCIAL_FIELDS.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                placeholder="https://"
                value={form[field.key]}
                onChangeText={(value) => update(field.key, value)}
                keyboardType="url"
                autoCapitalize="none"
              />
            ))}

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
