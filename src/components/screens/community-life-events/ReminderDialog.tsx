// Community Life: noting a reminder against the day picked on the calendar.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, TextInput } from 'react-native';
import { Dialog } from '@/components/overlays/AppModal';
import { Button } from '@/components/Button';
import { useThemeTokens } from '@/design-system';
import type { EventsCalendar } from '@/components/screens/community-life-events/useEventsCalendar';

interface ReminderDialogProps {
  calendar: EventsCalendar;
}

export function ReminderDialog({ calendar }: ReminderDialogProps) {
  const tokens = useThemeTokens();
  const {
    selectedDateStr, reminderModalOpen, setReminderModalOpen, reminderText, setReminderText,
    handleAddReminder,
  } = calendar;

  return (
    <Dialog
      visible={reminderModalOpen}
      onClose={() => setReminderModalOpen(false)}
      title="Add a note to this day"
      subtitle={`${selectedDateStr} · not saved — this note disappears when you leave the screen`}
      testID="reminder-dialog"
      footer={
        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            variant="neutral"
            fullWidth={false}
            className="flex-1"
            onPress={() => setReminderModalOpen(false)}
          />
          <Button
            label="Add note"
            fullWidth={false}
            className="flex-1"
            disabled={!reminderText.trim()}
            onPress={handleAddReminder}
          />
        </View>
      }
    >
      <TextInput
        placeholder="e.g. Call embassy to check visa status..."
        placeholderTextColor={tokens.color.text.placeholder}
        value={reminderText}
        onChangeText={setReminderText}
        accessibilityLabel="Reminder"
        className="bg-surface-background border border-subtle rounded-xl p-4 text-sm font-semibold"
        style={{ color: tokens.color.text.primary, minHeight: 88, textAlignVertical: 'top' }}
        multiline
      />
    </Dialog>
  );
}
