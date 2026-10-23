/**
 * A quick action can carry a short fact under its label — 22 Oct 2026.
 *
 * The wallet's Rewards action shows the member's points ("1,200 pts") now
 * that it is no longer gated on whether they can be converted.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { QuickAction } from '../QuickActions';

function renderAction(props: Partial<React.ComponentProps<typeof QuickAction>> = {}) {
  const onPress = jest.fn();

  render(
    <ThemeProvider>
      <QuickAction icon="sparkles-outline" label="Rewards" onPress={onPress} {...props} />
    </ThemeProvider>
  );

  return onPress;
}

describe('QuickAction', () => {
  it('shows its detail and announces it with the label', () => {
    const onPress = renderAction({ detail: '1,200 pts' });

    expect(screen.getByText('1,200 pts')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Rewards, 1,200 pts'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced by its label alone without one', () => {
    renderAction();

    expect(screen.getByLabelText('Rewards')).toBeTruthy();
  });

  it('still says why when it is unavailable', () => {
    renderAction({ label: 'Withdraw', disabled: true, disabledReason: 'No payout rail is connected.' });

    expect(screen.getByLabelText('Withdraw. No payout rail is connected.')).toBeTruthy();
  });
});
