// ─────────────────────────────────────────────────────────────────────────────
// Viewings — 15 Sep 2026
//
// **A landlord could not answer a viewing request.** Members could ask to see a
// home, and nothing in the app ever showed the request to the landlord or let
// them agree a time, so every request waited until the sweep expired it. This
// screen is both halves of the diary the server already kept:
//
//   Requests for your homes   GET /housing/viewings?side=landlord
//   Your requests             GET /housing/viewings?side=member
//
// and every move a side may make, through POST /housing/viewings/{id}. Who may
// do what is the server's; the buttons offered are `viewingMoves`, and a refusal
// is shown in the server's terms and never as a move that happened.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { DatePickerInput } from '@/components/DatePickerInput';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useThemeTokens } from '@/design-system';
import { useUpdateViewing, useViewings } from '@/hooks/housing-viewings';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import {
  formatViewingTime,
  toDateAndTime,
  toScheduledFor,
  viewingCounterparty,
  viewingMoveLabel,
  viewingMoves,
  viewingStatusLabel,
  viewingUpdateRefusal,
  type HousingViewing,
  type UpdateViewingRequest,
  type ViewingMove,
  type ViewingSide,
} from '@/lib/housing-viewings-api';
import { useNotification } from '@/providers/notification-provider';

const OPEN_STATUSES = new Set(['Requested', 'Scheduled']);

/** What a member is told once a move has been recorded. */
const DONE: Record<ViewingMove, string> = {
  schedule: 'Time agreed. They can see it in their viewings now.',
  decline: 'Request declined.',
  cancel: 'Viewing called off.',
  complete: 'Marked as viewed.',
  'no-show': 'Recorded that nobody came.',
};

export default function ViewingsScreen() {
  const params = useLocalSearchParams<{ side?: string }>();
  const [side, setSide] = useState<ViewingSide>(params.side === 'member' ? 'member' : 'landlord');

  const viewings = useViewings(side);
  const update = useUpdateViewing();
  const { showAlert } = useNotification();
  const refreshControl = useRefreshControl(() => viewings.refetch());

  const [scheduling, setScheduling] = useState<string | null>(null);

  const send = async (viewing: HousingViewing, move: ViewingMove, request: UpdateViewingRequest) => {
    try {
      await update.mutateAsync({ viewingId: viewing.id, request });
      setScheduling(null);
      showAlert({ type: 'success', title: 'Done', message: DONE[move] });
    } catch (cause) {
      showAlert({ type: 'error', title: 'Nothing was changed', message: viewingUpdateRefusal(cause) });
    }
  };

  const confirmThen = (title: string, message: string, action: string, run: () => void) => {
    showAlert({
      type: 'question',
      title,
      message,
      buttons: [
        { text: 'Keep it', style: 'cancel' },
        { text: action, style: 'destructive', onPress: run },
      ],
    });
  };

  const onMove = (viewing: HousingViewing, move: ViewingMove) => {
    switch (move) {
      case 'schedule':
        setScheduling((current) => (current === viewing.id ? null : viewing.id));
        return;
      case 'decline':
        confirmThen(
          'Decline this request?',
          `${viewingCounterparty(viewing, side)} will see that you declined.`,
          'Decline',
          () => void send(viewing, move, { action: 'Cancel', reason: 'The host declined the request.' })
        );
        return;
      case 'cancel':
        confirmThen(
          'Call off this viewing?',
          `${viewingCounterparty(viewing, side)} will see that it is off.`,
          side === 'landlord' ? 'Call it off' : 'Cancel request',
          () => void send(viewing, move, { action: 'Cancel' })
        );
        return;
      case 'complete':
        void send(viewing, move, { action: 'Complete' });
        return;
      case 'no-show':
        confirmThen(
          side === 'landlord' ? 'The visitor did not come?' : 'The host did not come?',
          'This is recorded on the viewing and cannot be undone.',
          'Record it',
          () =>
            void send(viewing, move, {
              action: 'NoShow',
              landlordFailedToAttend: side === 'member',
            })
        );
        return;
      default:
        return;
    }
  };

  const items = viewings.data ?? [];
  const open = items.filter((viewing) => OPEN_STATUSES.has(String(viewing.status)));
  const past = items.filter((viewing) => !OPEN_STATUSES.has(String(viewing.status)));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Viewings" showBack />

      <View className="flex-row mx-5 mt-3 mb-2 bg-surface-muted rounded-2xl p-1" accessibilityRole="tablist">
        {(
          [
            { value: 'landlord', label: 'Requests for your homes' },
            { value: 'member', label: 'Your requests' },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.value}
            onPress={() => {
              setSide(tab.value);
              setScheduling(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: side === tab.value }}
            className={`flex-1 py-2.5 rounded-xl items-center ${side === tab.value ? 'bg-surface-card' : ''}`}
          >
            <Text className={`text-xs font-bold ${side === tab.value ? 'text-content-primary' : 'text-content-muted'}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewings.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
        </View>
      ) : viewings.isError ? (
        <EmptyState
          icon="📡"
          title="Could not load viewings"
          description={viewingUpdateRefusal(viewings.error).replace('nothing was changed', 'nothing was loaded')}
          action={<Button label="Try again" onPress={() => void viewings.refetch()} />}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🏠"
          title={side === 'landlord' ? 'No viewing requests yet' : 'You have not asked to see a home yet'}
          description={
            side === 'landlord'
              ? 'When someone asks to see one of your homes, the request appears here for you to answer.'
              : 'Ask to see a home from its page, and you can follow your request here.'
          }
        />
      ) : (
        <ScrollView className="flex-1 px-5" refreshControl={refreshControl} contentContainerStyle={{ paddingBottom: 48 }}>
          {open.length > 0 && (
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-3 mb-2">
              Open
            </Text>
          )}
          {open.map((viewing) => (
            <ViewingCard
              key={viewing.id}
              viewing={viewing}
              side={side}
              isScheduling={scheduling === viewing.id}
              isBusy={update.isPending}
              onMove={(move) => onMove(viewing, move)}
              onSchedule={(request) => void send(viewing, 'schedule', request)}
              onInvalidTime={(message) => showAlert({ type: 'error', title: 'Pick a time', message })}
            />
          ))}

          {past.length > 0 && (
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-5 mb-2">
              Past
            </Text>
          )}
          {past.map((viewing) => (
            <ViewingCard
              key={viewing.id}
              viewing={viewing}
              side={side}
              isScheduling={false}
              isBusy={update.isPending}
              onMove={(move) => onMove(viewing, move)}
              onSchedule={() => undefined}
              onInvalidTime={() => undefined}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

interface ViewingCardProps {
  viewing: HousingViewing;
  side: ViewingSide;
  isScheduling: boolean;
  isBusy: boolean;
  onMove: (move: ViewingMove) => void;
  onSchedule: (request: UpdateViewingRequest) => void;
  onInvalidTime: (message: string) => void;
}

function ViewingCard({ viewing, side, isScheduling, isBusy, onMove, onSchedule, onInvalidTime }: ViewingCardProps) {
  const tokens = useThemeTokens();
  const moves = viewingMoves(viewing, side);
  const counterparty = viewingCounterparty(viewing, side);

  const suggested = toDateAndTime(viewing.preferredAt);
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState(suggested.time);
  const [place, setPlace] = useState('');

  const agree = () => {
    const scheduledFor = toScheduledFor(date, time);
    if (!scheduledFor) {
      onInvalidTime('Choose a day, and a time such as 14:30.');
      return;
    }
    if (new Date(scheduledFor).getTime() <= Date.now()) {
      onInvalidTime('That time has already passed. Pick a time in the future.');
      return;
    }
    onSchedule({ action: 'Schedule', scheduledFor, place: place.trim() || undefined });
  };

  return (
    <View className="bg-surface-card border border-subtle rounded-3xl p-4 mb-3">
      <View className="flex-row items-start justify-between gap-2">
        <TouchableOpacity
          className="flex-1"
          onPress={() => router.push({ pathname: '/housing/[id]', params: { id: viewing.listingSlug || viewing.listingId } })}
          accessibilityRole="link"
        >
          <Text className="text-base font-extrabold text-content-primary" numberOfLines={2}>
            {viewing.listingTitle}
          </Text>
        </TouchableOpacity>
        <View className="bg-surface-muted px-2.5 py-1 rounded-lg">
          <Text className="text-[10px] font-bold text-content-secondary">{viewingStatusLabel(viewing, side)}</Text>
        </View>
      </View>

      <Text className="text-sm text-content-secondary mt-1">
        {side === 'landlord' ? counterparty : `Host: ${counterparty}`}
        {side === 'landlord' && viewing.seekerIsVerified ? ' · ✓ Verified' : ''}
      </Text>

      {viewing.status === 'Scheduled' && viewing.confirmedAt ? (
        <Text className="text-sm font-bold text-content-primary mt-2">
          Agreed for {formatViewingTime(viewing.confirmedAt)}
        </Text>
      ) : viewing.status === 'Requested' ? (
        <Text className="text-sm text-content-muted mt-2">
          {viewing.preferredAt ? `Asked for ${formatViewingTime(viewing.preferredAt)}` : 'No time suggested'}
        </Text>
      ) : null}

      {viewing.isVirtual ? <Text className="text-xs text-content-muted mt-1">Video viewing</Text> : null}
      {viewing.place ? <Text className="text-xs text-content-muted mt-1">Meeting: {viewing.place}</Text> : null}
      {viewing.message ? (
        <Text className="text-xs text-content-secondary mt-2 italic">“{viewing.message}”</Text>
      ) : null}
      {viewing.closureReason && !OPEN_STATUSES.has(String(viewing.status)) ? (
        <Text className="text-xs text-content-muted mt-2">{viewing.closureReason}</Text>
      ) : null}

      {moves.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {moves.map((move) => (
            <TouchableOpacity
              key={move}
              onPress={() => onMove(move)}
              disabled={isBusy}
              accessibilityRole="button"
              className={`px-3.5 py-2 rounded-xl border ${
                move === 'schedule' ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
              }`}
            >
              <Text className={`text-xs font-bold ${move === 'schedule' ? 'text-white' : 'text-content-secondary'}`}>
                {viewingMoveLabel(move, side)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isScheduling && (
        <View className="border-t border-faint mt-4 pt-4">
          <DatePickerInput label="Day" value={date} onChangeDate={setDate} placeholder="Choose a day" />
          <Text className="text-xs font-extrabold text-content-secondary mb-2 mt-3 uppercase tracking-wider">Time</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="e.g. 14:30"
            placeholderTextColor={tokens.color.text.placeholder}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Time"
            className="border border-subtle rounded-2xl px-4 py-3 text-sm text-content-primary bg-surface-background"
          />
          <Text className="text-xs font-extrabold text-content-secondary mb-2 mt-3 uppercase tracking-wider">
            Where to meet (optional)
          </Text>
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="e.g. At the front gate"
            placeholderTextColor={tokens.color.text.placeholder}
            accessibilityLabel="Where to meet"
            className="border border-subtle rounded-2xl px-4 py-3 text-sm text-content-primary bg-surface-background"
          />
          <Text className="text-xs text-content-muted mt-2 leading-relaxed">
            Once you agree a time, {counterparty} can see the address of the home.
          </Text>
          <View className="flex-row gap-2 mt-3">
            <Button label="Agree this time" onPress={agree} isLoading={isBusy} disabled={isBusy} className="flex-1" />
          </View>
        </View>
      )}
    </View>
  );
}
