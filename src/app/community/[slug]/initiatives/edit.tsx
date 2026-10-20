// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Start or change an initiative (§35)
//
//   /community/[slug]/initiatives/edit                     start one
//   /community/[slug]/initiatives/edit?initiativeId={id}   change one
//
// `POST /communities/{idOrSlug}/initiatives` needs `canManageInitiatives`; `PUT`
// is open to its organisers too, and the server says which with `canEdit`. This
// screen asks the same questions before drawing the form, and the server asks
// them again on the write.
//
// **The change is partial.** `PUT` keeps whatever is not sent, so only the
// fields that differ from what was read are sent — an edit that only moves the
// status cannot blank the description by accident.
//
// **The organisers are not chosen here.** A new initiative is organised by the
// member who starts it (the server's default); naming others needs member ids
// this screen has no picker for, so it offers nothing rather than a field that
// takes ids.
//
// Required fields are named before anybody presses anything (title and
// description, both refused blank by the server), and a write whose answer
// never arrived says it may have been saved; the list is refetched either way.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  useCommunity,
  useCommunityCapabilities,
  useCommunityInitiative,
  useCommunityInitiativeMutations,
} from '@/hooks/communities';
import { canPerform } from '@/lib/community/access';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CommunityUnavailablePanel } from '@/components/community-directory/CommunityStatePanels';
import { governanceWriteError } from '@/components/community-directory/CommunityGovernanceEditor';
import type { CommunityInitiative, CommunityInitiativeStatus } from '@/types/community-directory';
import type { UpdateCommunityInitiativeInput } from '@/lib/community-entity-api';
import { backOr } from '@/lib/navigation';

/** Where an initiative may go from where it is. Completed and Cancelled are final. */
const NEXT_STATUSES: Record<CommunityInitiativeStatus, CommunityInitiativeStatus[]> = {
  Planned: ['Active', 'Cancelled'],
  Active: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

/** Today as `YYYY-MM-DD`, in the member's own calendar. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Only what changed. An empty object means there is nothing to save. */
function changesFrom(
  original: CommunityInitiative,
  draft: { title: string; description: string; targetDate: string; status: CommunityInitiativeStatus }
): UpdateCommunityInitiativeInput {
  const changes: UpdateCommunityInitiativeInput = {};
  if (draft.title.trim() !== original.title) changes.title = draft.title.trim();
  if (draft.description.trim() !== original.description) changes.description = draft.description.trim();
  const before = original.targetDate ?? '';
  if (draft.targetDate !== before) {
    if (draft.targetDate) changes.targetDate = draft.targetDate;
    else changes.clearTargetDate = true;
  }
  if (draft.status !== original.status) changes.status = draft.status;
  return changes;
}

export default function CommunityInitiativeEditRoute() {
  const { tokens } = useTheme();
  const { slug, initiativeId } = useLocalSearchParams<{ slug: string; initiativeId?: string }>();
  const isEditing = Boolean(initiativeId);

  const community = useCommunity(slug);
  const communityId = community.data?.id;
  const capabilities = useCommunityCapabilities(communityId);
  const existing = useCommunityInitiative(communityId, initiativeId);
  const { create, update } = useCommunityInitiativeMutations(communityId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<CommunityInitiativeStatus>('Planned');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // The stored values, once, when they arrive — never over what the member typed.
  useEffect(() => {
    const original = existing.data;
    if (!original || loadedId === original.id) return;
    setTitle(original.title);
    setDescription(original.description);
    setTargetDate(original.targetDate ?? '');
    setStatus(original.status);
    setLoadedId(original.id);
  }, [existing.data, loadedId]);

  const original = existing.data;
  const allowed = isEditing
    ? Boolean(original?.canEdit)
    : canPerform('manage-initiatives', capabilities.data);

  const stillNeeded: string[] = [];
  if (!title.trim()) stillNeeded.push('a title');
  if (!description.trim()) stillNeeded.push('what the initiative sets out to do');

  const changes = original && isEditing
    ? changesFrom(original, { title, description, targetDate, status })
    : null;
  const nothingChanged = isEditing && (!changes || Object.keys(changes).length === 0);

  const pending = create.isPending || update.isPending;
  const writeError = governanceWriteError(isEditing ? update.error : create.error);

  const statusChoices: CommunityInitiativeStatus[] = isEditing
    ? original
      ? [original.status, ...NEXT_STATUSES[original.status]]
      : []
    : ['Planned', 'Active'];

  const save = async () => {
    if (stillNeeded.length > 0 || !communityId) return;
    try {
      if (isEditing && original && changes) {
        if (Object.keys(changes).length === 0) return;
        await update.mutateAsync({ initiativeId: original.id, input: changes });
        backOr(`/community/${slug}/initiatives/${original.id}`);
      } else {
        const created = await create.mutateAsync({
          title: title.trim(),
          description: description.trim(),
          targetDate: targetDate || null,
          status: status === 'Active' ? 'Active' : 'Planned',
        });
        router.replace(`/community/${slug}/initiatives/${created.id}`);
      }
    } catch {
      // Shown below: the server's own sentence, or "may have been saved" where
      // no answer arrived. What the member typed is kept.
    }
  };

  const inputStyle = {
    color: tokens.color.text.primary,
    borderColor: tokens.color.border.default,
    backgroundColor: tokens.color.surface.card,
  };

  const loading =
    community.isLoading || capabilities.isLoading || (isEditing && existing.isLoading);

  return (
    <SafeAreaView style={{ backgroundColor: tokens.color.surface.background }} className="flex-1">
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => backOr(`/community/${slug}/initiatives`)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black ml-2"
        >
          {isEditing ? 'Edit initiative' : 'Start an initiative'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <CommunityUnavailablePanel reason="loading" subject="this initiative" />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject="initiatives"
            detail={community.data?.statusReason}
          />
        ) : isEditing && existing.isError ? (
          <CommunityUnavailablePanel
            reason="error"
            subject="this initiative"
            detail={(existing.error as { message?: string } | null)?.message}
            onAction={() => void existing.refetch()}
          />
        ) : !allowed ? (
          <CommunityUnavailablePanel
            reason="forbidden"
            subject="initiatives"
            detail={
              isEditing
                ? original && (original.status === 'Completed' || original.status === 'Cancelled')
                  ? 'This initiative has been completed or cancelled and can no longer be changed.'
                  : 'Only this initiative’s organisers, or the people who run the community, can change it.'
                : 'Only the people who run this community, and its ambassadors, can start an initiative.'
            }
          />
        ) : (
          <View>
            <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold mb-1">
              Title
            </Text>
            <TextInput
              accessibilityLabel="Title"
              value={title}
              onChangeText={setTitle}
              maxLength={140}
              placeholder="What the community is doing"
              placeholderTextColor={tokens.color.text.placeholder}
              style={inputStyle}
              className="rounded-xl border px-3 py-2.5 text-xs font-bold mb-3"
            />

            <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold mb-1">
              What it sets out to do
            </Text>
            <TextInput
              accessibilityLabel="What it sets out to do"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              placeholder="Who it helps and how"
              placeholderTextColor={tokens.color.text.placeholder}
              style={[inputStyle, { minHeight: 110, textAlignVertical: 'top' }]}
              className="rounded-xl border px-3 py-2.5 text-xs font-semibold mb-3"
            />

            <DatePickerInput
              label="Aiming to finish by (optional)"
              value={targetDate}
              onChangeDate={setTargetDate}
              placeholder="No target date"
              minDate={today()}
            />
            {targetDate ? (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel="Remove the target date"
                onPress={() => setTargetDate('')}
                className="self-start mt-1 mb-3"
              >
                <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
                  Remove the target date
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="mb-3" />
            )}

            {statusChoices.length > 1 ? (
              <>
                <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold mb-1">
                  Status
                </Text>
                <View accessibilityRole="radiogroup" className="flex-row flex-wrap mb-3">
                  {statusChoices.map((choice) => {
                    const selected = choice === status;
                    return (
                      <TouchableOpacity
                        key={choice}
                        accessible
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                        accessibilityLabel={`Status ${choice}`}
                        onPress={() => setStatus(choice)}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: selected ? tokens.color.primary[500] : tokens.color.neutral[100],
                        }}
                        className="rounded-full px-3 py-1.5 mr-2 mb-2"
                      >
                        <Text
                          style={{ color: selected ? tokens.color.text.inverse : tokens.color.text.secondary }}
                          className="text-[11px] font-bold"
                        >
                          {choice}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {isEditing && (status === 'Completed' || status === 'Cancelled') && status !== original?.status ? (
                  <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mb-3">
                    {status === 'Cancelled'
                      ? 'Once cancelled it cannot be changed again, and no more updates can be posted.'
                      : 'Once completed it cannot be changed again.'}
                  </Text>
                ) : null}
              </>
            ) : null}

            {stillNeeded.length > 0 ? (
              <Text
                testID="initiative-form-missing"
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-bold mb-2"
              >
                Still needed: {stillNeeded.join(' and ')}.
              </Text>
            ) : nothingChanged ? (
              <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold mb-2">
                Nothing has changed yet.
              </Text>
            ) : null}

            {writeError ? (
              <Text
                accessibilityRole="alert"
                style={{ color: tokens.color.error.default }}
                className="text-[10px] font-bold mb-2"
              >
                {writeError}
              </Text>
            ) : null}

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={isEditing ? 'Save changes' : 'Start initiative'}
              accessibilityState={{
                disabled: stillNeeded.length > 0 || nothingChanged || pending,
                busy: pending,
              }}
              disabled={stillNeeded.length > 0 || nothingChanged || pending}
              onPress={() => void save()}
              activeOpacity={0.85}
              style={{
                backgroundColor: tokens.color.primary[500],
                opacity: stillNeeded.length > 0 || nothingChanged || pending ? 0.5 : 1,
              }}
              className="rounded-xl py-3 items-center"
            >
              {pending ? (
                <ActivityIndicator size="small" color={tokens.color.text.inverse} />
              ) : (
                <Text style={{ color: tokens.color.text.inverse }} className="text-xs font-black">
                  {isEditing ? 'Save changes' : 'Start initiative'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
