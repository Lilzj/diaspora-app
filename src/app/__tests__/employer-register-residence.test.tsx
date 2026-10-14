/**
 * Registering an employer in the member's own country — 14 Oct 2026.
 *
 * The form asked for a two-letter country code, which members typed as
 * "Mauritius" or left blank. An employer is now registered where its owner
 * lives: `countryCode` is the session's `residenceCountry`, there is no country
 * input, and an account without a residence is told so by name.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { useAuthStore } from '@/store/auth';

const mockRegister = jest.fn();

jest.mock('@/hooks/jobs-hiring', () => ({
  useEmployerRegistration: () => ({ register: mockRegister, isSaving: false, error: null }),
}));

jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: jest.fn() }),
}));

// eslint-disable-next-line import/first
import RegisterEmployerScreen, { EMPLOYER_RESIDENCE_MISSING, employerRegistrationMissing } from '../employer/register';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <RegisterEmployerScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function liveIn(residenceCountry: string | null) {
  useAuthStore.setState({
    user: { userId: 'u-1', fullName: 'David Mensah', residenceCountry } as never,
  });
}

beforeEach(() => {
  mockRegister.mockReset();
  mockRegister.mockResolvedValue({ employerId: 'e-1' });
});

describe('what registering an employer still needs', () => {
  it('names the display name and a missing residence', () => {
    expect(employerRegistrationMissing({ displayName: '', countryCode: 'MU' })).toEqual(['Display name']);
    expect(employerRegistrationMissing({ displayName: 'Meridian', countryCode: null })).toEqual([
      'Country of residence',
    ]);
    expect(employerRegistrationMissing({ displayName: 'Meridian', countryCode: 'MU' })).toEqual([]);
  });
});

describe('the Register an employer screen', () => {
  it('has no country input and sends the member’s country of residence', async () => {
    liveIn('MU');
    renderScreen();

    expect(screen.queryByText('Country')).toBeNull();
    expect(screen.getByText('Still needed: Display name')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Meridian Care Group'), 'Meridian Care');
    expect(screen.queryByText(/Still needed/)).toBeNull();

    fireEvent.press(screen.getByText('Register employer'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockRegister.mock.calls[0][0]).toMatchObject({ displayName: 'Meridian Care', countryCode: 'MU' });
  });

  it('says plainly when the account has no country of residence, and does not send', () => {
    liveIn(null);
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Meridian Care Group'), 'Meridian Care');

    expect(screen.getByText(EMPLOYER_RESIDENCE_MISSING)).toBeTruthy();
    expect(screen.getByText('Still needed: Country of residence')).toBeTruthy();

    fireEvent.press(screen.getByText('Register employer'));
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
