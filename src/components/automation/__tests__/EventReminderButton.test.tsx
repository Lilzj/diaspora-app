// "Remind me" on an event.
//
// On 6 Oct 2026 the screen said "Reminder saved — Diaspora cannot send reminders
// automatically yet" about a reminder the server had just scheduled. It read the
// state only from the reminder list, which is refetched after the create and
// came back without the new one. The create reply carries the state; this pins
// that it is used.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { EventReminderButton } from '../ContextualAutomation';

const mockCreate = jest.fn();
let mockReminders: { state: string; offsetMinutes: number }[] = [];

jest.mock('@/hooks/automation', () => ({
  useReminders: () => ({
    reminders: mockReminders,
    create: { mutateAsync: mockCreate, isPending: false },
    isOffline: false,
  }),
  useSavedSearchMutations: () => ({}),
}));

function renderButton() {
  return render(
    <ThemeProvider>
      <EventReminderButton
        eventId="01a10c18-0b51-75ba-a12e-d638ab1c84c4"
        eventTitle="Women's Legacy Conference 2026"
        timeZoneId="Indian/Mauritius"
        eventStartsAt="2026-12-09T04:00:00.000Z"
      />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReminders = [];
});

describe('setting a reminder', () => {
  it('says it is set when the server scheduled it, even before the list has it', async () => {
    mockCreate.mockResolvedValue({ state: 'scheduled', offsetMinutes: 1440 });
    const { getByText, findByText, queryByText } = renderButton();

    fireEvent.press(getByText('Remind me'));
    fireEvent.press(getByText('1 day before'));

    expect(await findByText('Reminder set — 1 day before')).toBeTruthy();
    expect(queryByText(/cannot send reminders automatically/)).toBeNull();
  });

  it('still says so honestly when the server only recorded it', async () => {
    mockCreate.mockResolvedValue({ state: 'configured', offsetMinutes: 1440 });
    const { getByText, findByText } = renderButton();

    fireEvent.press(getByText('Remind me'));
    fireEvent.press(getByText('1 day before'));

    expect(await findByText('Reminder saved — 1 day before')).toBeTruthy();
    await waitFor(() => expect(getByText(/cannot send reminders automatically/)).toBeTruthy());
  });
});
