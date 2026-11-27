/**
 * ListState: what a list says before it has rows (FARCH-007, 27 Nov 2026).
 *
 * Loading, then an error, then empty, then the rows: one of them, in that
 * order. About forty lists said "nothing here" after a read that had failed,
 * because the empty branch was the only one they had. The words are each
 * screen's own; the order and the look are this.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import { ListEmpty, ListState } from '@/components/ListState';

const themed = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const ROWS = <Text>Row one</Text>;
const EMPTY = { icon: 'briefcase-outline' as const, title: 'No jobs yet', message: 'Jobs you post appear here.' };
const ERROR = { title: 'Jobs are unavailable', message: 'The server did not answer.' };

describe('ListState', () => {
  it('draws only the spinner while the first read lasts, labelled for a screen reader', () => {
    themed(
      <ListState loading loadingLabel="Loading jobs" error={ERROR} isEmpty empty={EMPTY}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Loading jobs');
    expect(screen.queryByText('Jobs are unavailable')).toBeNull();
    expect(screen.queryByText('No jobs yet')).toBeNull();
    expect(screen.queryByText('Row one')).toBeNull();
  });

  it('draws the screen’s own skeleton in place of the spinner', () => {
    themed(
      <ListState loading skeleton={<Text>Skeleton rows</Text>}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByText('Skeleton rows')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says the read failed, never that the list is empty, when it failed', () => {
    themed(
      <ListState error={ERROR} isEmpty empty={EMPTY}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Jobs are unavailable')).toBeTruthy();
    expect(screen.getByText('The server did not answer.')).toBeTruthy();
    expect(screen.queryByText('No jobs yet')).toBeNull();
    expect(screen.queryByText('Row one')).toBeNull();
  });

  it('offers to try again when the screen can, and no retry it cannot keep', () => {
    const onRetry = jest.fn();
    const { unmount } = themed(<ListState error={ERROR} onRetry={onRetry} />);

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    themed(<ListState error={ERROR} />);
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  it('draws an area’s own error as given, where it does more than say so', () => {
    themed(
      <ListState error={<Text>Sign in to see your giving</Text>} isEmpty empty={EMPTY}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByText('Sign in to see your giving')).toBeTruthy();
    expect(screen.queryByText('No jobs yet')).toBeNull();
  });

  it('says the list is empty, in the screen’s words, with its next step', () => {
    const onPress = jest.fn();
    themed(
      <ListState isEmpty empty={{ ...EMPTY, action: { label: 'Post a job', onPress } }}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByText('No jobs yet')).toBeTruthy();
    expect(screen.getByText('Jobs you post appear here.')).toBeTruthy();
    expect(screen.queryByText('Row one')).toBeNull();
    fireEvent.press(screen.getByLabelText('Post a job'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the rows once there are some', () => {
    themed(
      <ListState isEmpty={false} empty={EMPTY}>
        {ROWS}
      </ListState>
    );

    expect(screen.getByText('Row one')).toBeTruthy();
    expect(screen.queryByText('No jobs yet')).toBeNull();
  });
});

describe('ListEmpty', () => {
  it('reads title and sentence out as one, and keeps an id a test can find', () => {
    themed(<ListEmpty {...EMPTY} testID="jobs-empty" />);

    expect(screen.getByTestId('jobs-empty')).toBeTruthy();
    expect(screen.getByLabelText('No jobs yet. Jobs you post appear here.')).toBeTruthy();
  });

  it('never reads a full stop twice when the title already ends a sentence', () => {
    themed(<ListEmpty title="Your invoices could not be loaded." message="Check your connection." />);

    expect(screen.getByLabelText('Your invoices could not be loaded. Check your connection.')).toBeTruthy();
  });
});
