// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — /community/[slug]/initiatives/[initiativeId] (§35)
//
// One initiative, its progress updates and who is taking part, as
// CommunityProgramme serves them (backend e57082e, 20 Oct 2026).
//
// Every control here is drawn from the server's own answer about this caller —
// `canJoin`, `isParticipant`, `canEdit`, `canPostUpdate` — and the server checks
// again on every write. Nothing is inferred from a role.
//
// Two rules from the rest of the app:
//
//   * The update form names what it still needs and waits, before anybody
//     presses anything (a title and the update itself, both required).
//   * Unanswered is not no. A write whose answer never arrived may have been
//     applied, so it says so, and the initiative is refetched either way.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
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
  useCommunityInitiative,
  useCommunityInitiativeMutations,
  useCommunityInitiativeParticipants,
  useCommunityInitiativeUpdates,
} from '@/hooks/communities';
import {
  formatInitiativeDate,
  initiativeCounts,
  useInitiativeStatusTone,
} from '@/components/community-directory/CommunityPanels';
import { CommunityUnavailablePanel } from '@/components/community-directory/CommunityStatePanels';
import { governanceWriteError } from '@/components/community-directory/CommunityGovernanceEditor';
import type { CommunityInitiative, CommunityInitiativeUpdate } from '@/types/community-directory';
import { backOr } from '@/lib/navigation';

/** The update form's required fields, named for the member. */
function missingUpdateFields(title: string, body: string): string[] {
  const missing: string[] = [];
  if (!title.trim()) missing.push('a title');
  if (!body.trim()) missing.push('what has happened');
  return missing;
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: tokens.color.text.placeholder }}
      className="text-[10px] font-black uppercase tracking-widest mt-6 mb-2"
    >
      {children}
    </Text>
  );
}

function UpdateCard({ update }: { update: CommunityInitiativeUpdate }) {
  const { tokens } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-3 mb-2"
      testID={`initiative-update-${update.id}`}
    >
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {update.title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed mt-1"
      >
        {update.body}
      </Text>
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[9px] font-bold mt-2">
        {formatMoment(update.postedAt)}
        {/* Absent where the author keeps their membership out of view. */}
        {update.author ? ` · ${update.author.displayName}` : ''}
      </Text>
    </View>
  );
}

export default function CommunityInitiativeRoute() {
  const { tokens } = useTheme();
  const { slug, initiativeId } = useLocalSearchParams<{ slug: string; initiativeId: string }>();

  const community = useCommunity(slug);
  const communityId = community.data?.id;

  const initiative = useCommunityInitiative(communityId, initiativeId);
  const updates = useCommunityInitiativeUpdates(communityId, initiativeId);
  const participants = useCommunityInitiativeParticipants(communityId, initiativeId);
  const { join, leave, postUpdate } = useCommunityInitiativeMutations(communityId);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const stillNeeded = missingUpdateFields(title, body);

  const item: CommunityInitiative | undefined = initiative.data;
  const tone = useInitiativeStatusTone(item?.status ?? 'Planned');
  const readError = initiative.error as { message?: string } | null;

  const participationError = governanceWriteError(join.error ?? leave.error);
  const postError = governanceWriteError(postUpdate.error);

  const submitUpdate = async () => {
    if (!initiativeId || stillNeeded.length > 0) return;
    try {
      await postUpdate.mutateAsync({
        initiativeId,
        input: { title: title.trim(), body: body.trim() },
      });
      setTitle('');
      setBody('');
    } catch {
      // Shown below from `postUpdate.error`, in the server's words or as
      // "may have been saved" where no answer arrived. The draft is kept.
    }
  };

  const inputStyle = {
    color: tokens.color.text.primary,
    borderColor: tokens.color.border.default,
    backgroundColor: tokens.color.surface.background,
  };

  const visibleParticipants = participants.data ?? [];
  const unnamed = item ? Math.max(0, item.participantCount - visibleParticipants.length) : 0;

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
          className="text-base font-black ml-2 flex-1"
          numberOfLines={1}
        >
          {item?.title ?? 'Initiative'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {community.isLoading || initiative.isLoading ? (
          <CommunityUnavailablePanel reason="loading" subject="this initiative" />
        ) : community.unavailable ? (
          <CommunityUnavailablePanel
            reason={community.unavailable}
            subject="this initiative"
            detail={community.data?.statusReason}
          />
        ) : initiative.unavailable === 'feature-disabled' ? (
          <CommunityUnavailablePanel reason="feature-disabled" subject="initiatives" />
        ) : initiative.isError || !item ? (
          <CommunityUnavailablePanel
            reason="error"
            subject="this initiative"
            detail={readError?.message}
            onAction={() => void initiative.refetch()}
          />
        ) : (
          <View>
            <View className="flex-row items-center mb-2">
              <View style={{ backgroundColor: tone.surface }} className="px-2 py-0.5 rounded-full">
                <Text
                  style={{ color: tone.color }}
                  className="text-[9px] font-black uppercase tracking-wider"
                >
                  {item.status}
                </Text>
              </View>
              {item.isOrganiser ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold ml-2"
                >
                  You organise this
                </Text>
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed"
            >
              {item.description}
            </Text>

            <View className="mt-3">
              {item.startedAt ? (
                <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
                  Started {formatMoment(item.startedAt)}
                </Text>
              ) : null}
              {item.targetDate ? (
                <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
                  Aiming to finish by {formatInitiativeDate(item.targetDate)}
                </Text>
              ) : null}
              {item.closedAt ? (
                <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
                  {item.status === 'Cancelled' ? 'Cancelled' : 'Completed'} {formatMoment(item.closedAt)}
                </Text>
              ) : null}
              <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
                {initiativeCounts(item)}
              </Text>
              {item.organisers.length > 0 ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold mt-1"
                >
                  Organised by {item.organisers.map((organiser) => organiser.displayName).join(', ')}
                </Text>
              ) : null}
            </View>

            <View className="flex-row mt-4">
              {item.isParticipant ? (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Stop taking part"
                  accessibilityState={{ disabled: leave.isPending, busy: leave.isPending }}
                  disabled={leave.isPending}
                  onPress={() => {
                    join.reset();
                    leave.mutate(item.id);
                  }}
                  activeOpacity={0.8}
                  style={{ borderColor: tokens.color.border.default }}
                  className="flex-1 rounded-xl border py-2.5 items-center mr-2"
                >
                  <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-black">
                    {leave.isPending ? 'Leaving…' : 'Stop taking part'}
                  </Text>
                </TouchableOpacity>
              ) : item.canJoin ? (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Take part"
                  accessibilityState={{ disabled: join.isPending, busy: join.isPending }}
                  disabled={join.isPending}
                  onPress={() => {
                    leave.reset();
                    join.mutate(item.id);
                  }}
                  activeOpacity={0.85}
                  style={{ backgroundColor: tokens.color.primary[500] }}
                  className="flex-1 rounded-xl py-2.5 items-center mr-2"
                >
                  {join.isPending ? (
                    <ActivityIndicator size="small" color={tokens.color.text.inverse} />
                  ) : (
                    <Text style={{ color: tokens.color.text.inverse }} className="text-[11px] font-black">
                      Take part
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {item.canEdit ? (
                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Edit this initiative"
                  onPress={() =>
                    router.push(`/community/${slug}/initiatives/edit?initiativeId=${item.id}`)
                  }
                  activeOpacity={0.8}
                  style={{ borderColor: tokens.color.border.default }}
                  className="rounded-xl border px-4 py-2.5 items-center"
                >
                  <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
                    Edit
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {!item.isParticipant && !item.canJoin && item.status !== 'Completed' && item.status !== 'Cancelled' ? (
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-bold mt-2"
              >
                Members of this community can take part.
              </Text>
            ) : null}

            {participationError ? (
              <Text
                accessibilityRole="alert"
                style={{ color: tokens.color.error.default }}
                className="text-[10px] font-bold mt-2"
              >
                {participationError}
              </Text>
            ) : null}

            <SectionHeading>Updates</SectionHeading>

            {item.canPostUpdate ? (
              <View
                style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                className="rounded-2xl border p-3 mb-3"
                testID="initiative-update-form"
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black mb-2">
                  Post an update
                </Text>
                <TextInput
                  accessibilityLabel="Update title"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={140}
                  placeholder="Title"
                  placeholderTextColor={tokens.color.text.placeholder}
                  style={inputStyle}
                  className="rounded-xl border px-3 py-2.5 text-xs font-bold mb-2"
                />
                <TextInput
                  accessibilityLabel="What has happened"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={4000}
                  placeholder="What has happened"
                  placeholderTextColor={tokens.color.text.placeholder}
                  style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
                  className="rounded-xl border px-3 py-2.5 text-xs font-semibold mb-2"
                />

                {stillNeeded.length > 0 ? (
                  <Text
                    testID="initiative-update-missing"
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold mb-2"
                  >
                    Still needed: {stillNeeded.join(' and ')}.
                  </Text>
                ) : null}

                {postError ? (
                  <Text
                    accessibilityRole="alert"
                    style={{ color: tokens.color.error.default }}
                    className="text-[10px] font-bold mb-2"
                  >
                    {postError}
                  </Text>
                ) : null}

                <TouchableOpacity
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Post update"
                  accessibilityState={{
                    disabled: stillNeeded.length > 0 || postUpdate.isPending,
                    busy: postUpdate.isPending,
                  }}
                  disabled={stillNeeded.length > 0 || postUpdate.isPending}
                  onPress={() => void submitUpdate()}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: tokens.color.primary[500],
                    opacity: stillNeeded.length > 0 || postUpdate.isPending ? 0.5 : 1,
                  }}
                  className="rounded-xl py-2.5 items-center"
                >
                  {postUpdate.isPending ? (
                    <ActivityIndicator size="small" color={tokens.color.text.inverse} />
                  ) : (
                    <Text style={{ color: tokens.color.text.inverse }} className="text-[11px] font-black">
                      Post update
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            {updates.isLoading ? (
              <CommunityUnavailablePanel reason="loading" subject="updates" compact />
            ) : updates.isError ? (
              <CommunityUnavailablePanel
                reason="error"
                subject="updates"
                compact
                detail={(updates.error as { message?: string } | null)?.message}
                onAction={() => void updates.refetch()}
              />
            ) : (updates.data ?? []).length === 0 ? (
              <CommunityUnavailablePanel
                reason="empty"
                subject="updates"
                compact
                detail="No update has been posted yet."
              />
            ) : (
              (updates.data ?? []).map((update) => <UpdateCard key={update.id} update={update} />)
            )}

            <SectionHeading>Taking part</SectionHeading>

            {participants.isLoading ? (
              <CommunityUnavailablePanel reason="loading" subject="who is taking part" compact />
            ) : participants.isError ? (
              <CommunityUnavailablePanel
                reason="error"
                subject="who is taking part"
                compact
                detail={(participants.error as { message?: string } | null)?.message}
                onAction={() => void participants.refetch()}
              />
            ) : item.participantCount === 0 ? (
              <CommunityUnavailablePanel
                reason="empty"
                subject="who is taking part"
                compact
                detail="Nobody is taking part yet."
              />
            ) : (
              <View testID="initiative-participants">
                {visibleParticipants.map((participant) => (
                  <TouchableOpacity
                    key={participant.userId}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${participant.displayName}, taking part since ${formatMoment(participant.joinedAt)}`}
                    onPress={() => router.push(`/contributor/${participant.userId}`)}
                    activeOpacity={0.7}
                    className="flex-row items-center justify-between py-2"
                  >
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                      {participant.displayName}
                    </Text>
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold">
                      since {formatMoment(participant.joinedAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {unnamed > 0 ? (
                  // The count is everybody; the list is those who chose to be seen.
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold mt-1"
                  >
                    {unnamed === 1
                      ? '1 more person is taking part and keeps their membership private.'
                      : `${unnamed} more people are taking part and keep their membership private.`}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
