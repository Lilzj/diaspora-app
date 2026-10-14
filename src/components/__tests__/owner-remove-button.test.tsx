// The owner's "Remove this listing" (13 Oct 2026): asks first, then removes,
// says so and leaves; on failure it says nothing changed and stays.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { OwnerRemoveButton } from '@/components/OwnerRemoveButton';

const mockInvalidate = jest.fn();
function withClient(element: React.ReactElement) {
  const client = new QueryClient();
  client.invalidateQueries = mockInvalidate as never;
  return <QueryClientProvider client={client}>{element}</QueryClientProvider>;
}

const mockShowAlert = jest.fn();
const mockShowToast = jest.fn();
jest.mock('@/providers/notification-provider', () => ({
  useNotification: () => ({ showAlert: mockShowAlert, showToast: mockShowToast }),
}));

const mockBackOr = jest.fn();
jest.mock('@/lib/navigation', () => ({ backOr: (...args: unknown[]) => mockBackOr(...args) }));

type AlertButton = { text: string; onPress?: () => void };

function pressInAlert(text: string) {
  const buttons = (mockShowAlert.mock.calls.at(-1)?.[0]?.buttons ?? []) as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  mockShowAlert.mockReset();
  mockShowToast.mockReset();
  mockBackOr.mockReset();
});

describe('OwnerRemoveButton', () => {
  it('asks before removing anything', () => {
    const onRemove = jest.fn().mockResolvedValue(undefined);
    render(withClient(<OwnerRemoveButton noun="listing" onRemove={onRemove} />));

    fireEvent.press(screen.getByText('Remove this listing'));

    expect(mockShowAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove this listing?' }));
    expect(onRemove).not.toHaveBeenCalled();

    pressInAlert('Keep it');
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('removes on confirmation, says so and goes back', async () => {
    const onRemove = jest.fn().mockResolvedValue(undefined);
    render(withClient(<OwnerRemoveButton noun="event" onRemove={onRemove} />));

    fireEvent.press(screen.getByText('Remove this event'));
    pressInAlert('Remove');

    await waitFor(() => expect(mockBackOr).toHaveBeenCalled());
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    // Lists that held it refetch, so it does not linger until a manual refresh.
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('stays, and says nothing changed, when the server refuses', async () => {
    const onRemove = jest.fn().mockRejectedValue(new Error('403'));
    render(withClient(<OwnerRemoveButton noun="guide" onRemove={onRemove} />));

    fireEvent.press(screen.getByText('Remove this guide'));
    pressInAlert('Remove');

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Could not remove this guide' }),
      ),
    );
    expect(mockBackOr).not.toHaveBeenCalled();
  });
});
