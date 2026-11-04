/**
 * The first edit does not throw the member back to the top — Android UAT, 3 Nov 2026.
 *
 * On the creator profile, choosing an area made the form unsaved, which pins a
 * Save changes footer. `CreatorScreen` picked its scroll container by whether a
 * footer was present, so the footer swapped `ScrollEndScrollView` for a plain
 * `ScrollView`: a different component, so React remounted the scroll and
 * everything in it. The screen jumped to the top and the open areas list
 * closed. The container is now chosen once, and a footer only turns its end
 * navigation off.
 */
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { CreatorScreen } from '../CreatorScreen';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mounts = jest.fn();

function Content() {
  useEffect(() => {
    mounts();
  }, []);
  return <Text>The profile form</Text>;
}

function Profile({ isDirty }: { isDirty: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <CreatorScreen title="Creator profile" isEnabled footer={isDirty ? <Text>Save changes</Text> : undefined}>
          <Content />
        </CreatorScreen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => mounts.mockClear());

describe('a footer that appears after the first edit', () => {
  it('keeps the content mounted, so its scroll and state survive', () => {
    const { rerender } = render(<Profile isDirty={false} />);
    rerender(<Profile isDirty />);

    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('keeps it mounted when the footer goes again', () => {
    const { rerender } = render(<Profile isDirty />);
    rerender(<Profile isDirty={false} />);
    rerender(<Profile isDirty />);

    expect(mounts).toHaveBeenCalledTimes(1);
  });
});
