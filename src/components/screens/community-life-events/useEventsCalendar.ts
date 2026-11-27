// Community Life: the Calendar tab's view, the day picked, and the reminders noted on this screen.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { toDateString } from '@/utils/calendar-date';

export function useEventsCalendar() {
  const { showAlert } = useNotification();

  // --- Calendar Tab State ---
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'agenda'>('month');
  // Today, computed. See DEFECT-013 below: this was the literal '2026-07-13'.
  const [selectedDateStr, setSelectedDateStr] = useState(() => toDateString(new Date()));
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [customReminders, setCustomReminders] = useState<{ id: string; title: string; date: string; time: string; type: 'Reminder' }[]>([]);

  /**
   * Add a note to a calendar day.
   *
   * It used to say *"Reminder Saved — Personal reminder has been added to your
   * calendar."* Two false claims in one sentence: nothing was saved (the note
   * lives in `customReminders`, a `useState` array discarded when the screen
   * unmounts) and nothing was added to any calendar. A member noting the date
   * of their visa appointment would find it gone the next time they opened the
   * tab, having been told it was in their calendar and therefore having no
   * reason to write it down anywhere else. No notification was scheduled
   * either, so the word "reminder" promised a third thing that never happened.
   *
   * **There is no route for this.** `GET /community-life/calendar` is read-only
   * and the CommunityLife module has no reminder concept at all. The Automation
   * module does have `POST /automations/reminders`, but its `SubjectKind` is
   * `event | occurrence | series` — it anchors a reminder to something on the
   * platform and offsets from that moment. It cannot carry a free-text note on
   * an arbitrary date, which is what this control collects. So the capability
   * to build here is "remind me about *this event*", not "save my note", and
   * inventing a client-side calendar is not it.
   *
   * The control keeps working as a scratch note for the current session,
   * because seeing it appear on the grid is genuinely useful while planning —
   * and now says exactly that.
   */
  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    const newRem = {
      id: `rem-${Date.now()}`,
      title: reminderText,
      date: selectedDateStr,
      time: '09:00',
      type: 'Reminder' as const
    };
    setCustomReminders(prev => [...prev, newRem]);
    setReminderText('');
    setReminderModalOpen(false);
    showAlert({
      type: 'info',
      title: 'Note added for now',
      message: 'This note is only on this screen and will be gone when you leave — write it down somewhere you will see it. Diaspora can remind you about an event you are going to; what it cannot do yet is keep a note of your own against a date you pick.',
    });
  };

  return {
    calendarView, setCalendarView, selectedDateStr, setSelectedDateStr, reminderModalOpen,
    setReminderModalOpen, reminderText, setReminderText, customReminders, handleAddReminder,
  };
}

/** What `useEventsCalendar` holds, as the screen reads it. */
export type EventsCalendar = ReturnType<typeof useEventsCalendar>;
