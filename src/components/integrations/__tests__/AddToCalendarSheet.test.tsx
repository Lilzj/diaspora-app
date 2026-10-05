// "Add to calendar" on a device that has never been asked for calendar access.
//
// Until 5 Oct 2026 the permission prompt was reachable only by tapping a
// calendar, and listing calendars needs the same permission, so the sheet
// showed "No calendar you can write to" with nothing to tap. Found on the
// emulator with the Women's Legacy Conference.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { integrationError } from '@/lib/integrations/errors';
import { AddToCalendarSheet } from '../AddToCalendarSheet';
import type { Event } from '@/types/community-life';

const mockRefetch = jest.fn();
let mockCalendars: { isLoading: boolean; data: unknown; refetch: jest.Mock };

jest.mock('@/hooks/integrations', () => ({
  useCalendarSettings: () => ({
    settings: {
      defaultReminderMinutes: 30,
      timeZoneBehaviour: 'event',
      conflictBehaviour: 'ask',
      defaultCalendarId: null,
    },
  }),
  useWritableCalendars: () => mockCalendars,
}));

const mockPrepare = jest.fn();
jest.mock('@/lib/integrations/calendar', () => ({
  eventToDraft: () => ({ draft: { title: 'Women’s Legacy' }, isTimeZoneExact: true }),
  exportEventToCalendar: jest.fn(),
  prepareCalendarProvider: (...args: unknown[]) => mockPrepare(...args),
}));

jest.mock('@/lib/integrations/registry', () => ({
  resolveCalendarProviders: () => [
    {
      descriptor: { id: 'calendar.device', label: 'Device calendar', mode: 'REAL_PROVIDER' },
      capabilities: ['calendar.list', 'calendar.event.create'],
      usesDevicePermission: true,
      openSettings: jest.fn(),
    },
    {
      descriptor: { id: 'calendar.google', label: 'Google Calendar', mode: 'REAL_PROVIDER' },
      capabilities: ['calendar.list', 'calendar.event.create'],
      usesDevicePermission: false,
      openSettings: jest.fn(),
    },
  ],
}));

jest.mock('@/lib/integrations/events', () => ({ trackIntegrationEvent: jest.fn() }));

const event = { id: 'e1', title: 'Women’s Legacy Conference 2026' } as Event;

function renderSheet() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <AddToCalendarSheet visible event={event} onClose={jest.fn()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function neverAsked() {
  mockCalendars = {
    isLoading: false,
    refetch: mockRefetch,
    data: {
      calendars: [],
      failures: [
        {
          provider: 'calendar.device',
          error: integrationError('PermissionDenied', { provider: 'calendar.device' }),
        },
      ],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  neverAsked();
});

describe('Google Calendar on a deployment with no adapter', () => {
  it('says so in its own section, not as a red failure', () => {
    mockCalendars = {
      isLoading: false,
      refetch: mockRefetch,
      data: {
        calendars: [],
        failures: [
          {
            provider: 'calendar.google',
            error: integrationError('ConfigurationMissing', {
              provider: 'calendar.google',
              message: 'Not available on Diaspora yet.',
            }),
          },
        ],
      },
    };

    const { getByText, queryByText } = renderSheet();

    expect(getByText(/Not available on Diaspora yet\./)).toBeTruthy();
    expect(queryByText('That request could not be completed.')).toBeNull();
  });
});

describe('a device that has never been asked for calendar access', () => {
  it('offers to ask, instead of saying there is no calendar', () => {
    const { getByText, queryByText } = renderSheet();

    expect(getByText('Allow calendar access')).toBeTruthy();
    // The permission is answered in its own section, not as a stray notice
    // telling the member to visit settings for a prompt they never saw.
    expect(queryByText('You can allow calendar access in your device settings.')).toBeNull();
  });

  it('asks the device, then lists the calendars again', async () => {
    mockPrepare.mockResolvedValue({ ok: true, provider: {} });
    const { getByText } = renderSheet();

    fireEvent.press(getByText('Allow calendar access'));

    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockPrepare).toHaveBeenCalledWith('calendar.device');
  });

  it('moves to the settings route when the answer is a permanent no', async () => {
    mockPrepare.mockResolvedValue({
      ok: false,
      reason: 'permission',
      permission: { state: 'blocked', requiresSettings: true, canAskAgain: false },
      error: integrationError('PermissionDenied', { provider: 'calendar.device' }),
    });
    const { getByText, findByText } = renderSheet();

    fireEvent.press(getByText('Allow calendar access'));

    expect(
      await findByText('Diaspora needs permission to add events to your calendar. It never reads what is already in it.')
    ).toBeTruthy();
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
