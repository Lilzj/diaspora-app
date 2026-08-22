/**
 * Modal primitives — the properties the 48 hand-rolled modals disagreed on.
 *
 * Each test here corresponds to a defect found in the overlay audit, so they
 * double as the regression net for every modal migrated onto these components.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider, lightTokens } from '@/design-system';
import { NotificationProvider } from '@/providers/notification-provider';
import { Sheet, Dialog } from '../AppModal';
import { ReportModal } from '../../ReportModal';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithProviders(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        {/* ReportModal reports its outcome through the designed alert modal
            rather than the Android system dialog, so it needs the provider. */}
        <NotificationProvider>{node}</NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe.each([
  ['Sheet', Sheet],
  ['Dialog', Dialog],
] as const)('%s', (_name, Overlay) => {
  it('closes on the Android hardware back button', () => {
    // Three modals shipped without `onRequestClose`, so back did nothing and
    // the member was stuck until they found the backdrop.
    const onClose = jest.fn();
    renderWithProviders(
      <Overlay visible onClose={onClose} title="Title" testID="overlay">
        <Text>Body</Text>
      </Overlay>
    );

    fireEvent(screen.UNSAFE_getByType(require('react-native').Modal), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('extends the scrim under the status bar on Android', () => {
    renderWithProviders(
      <Overlay visible onClose={() => {}} title="Title">
        <Text>Body</Text>
      </Overlay>
    );
    const modal = screen.UNSAFE_getByType(require('react-native').Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
  });

  it('contains assistive technology inside the overlay', () => {
    // Without this a screen reader walks out of the sheet and onto the dimmed
    // screen behind it.
    renderWithProviders(
      <Overlay visible onClose={() => {}} title="Title" testID="overlay">
        <Text>Body</Text>
      </Overlay>
    );
    expect(screen.getByTestId('overlay').props.accessibilityViewIsModal).toBe(true);
  });

  it('offers a labelled close control with a 44pt target', () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Overlay visible onClose={onClose} title="Title">
        <Text>Body</Text>
      </Overlay>
    );

    const close = screen.getByTestId('overlay-close');
    expect(close.props.accessibilityRole).toBe('button');
    expect(close.props.accessibilityLabel).toBe('Close');

    const style = close.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);

    fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('dismisses when the backdrop is tapped', () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Overlay visible onClose={onClose} title="Title">
        <Text>Body</Text>
      </Overlay>
    );
    fireEvent.press(screen.getByTestId('overlay-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('announces its title as a heading', () => {
    renderWithProviders(
      <Overlay visible onClose={() => {}} title="Select location">
        <Text>Body</Text>
      </Overlay>
    );
    expect(screen.getByRole('header', { name: 'Select location' })).toBeTruthy();
  });

  it('withholds the backdrop dismiss affordance when dismissal is blocked', () => {
    const onClose = jest.fn();
    renderWithProviders(
      <Overlay visible onClose={onClose} title="Confirm" dismissOnBackdropPress={false}>
        <Text>Body</Text>
      </Overlay>
    );

    const backdrop = screen.getByTestId('overlay-backdrop', { includeHiddenElements: true });
    // Not a Pressable at all: an inert Pressable would still swallow the touch
    // and still read as interactive. And it must not claim to be a button when
    // tapping it does nothing.
    expect(backdrop.props.onPress).toBeUndefined();
    expect(backdrop.props.accessibilityRole).toBeUndefined();
    expect(backdrop.props.accessibilityLabel).toBeUndefined();

    // The header close button remains the way out.
    fireEvent.press(screen.getByTestId('overlay-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('paints the scrim from the shared token, not a per-modal opacity', () => {
    // The 41 hand-rolled modals used eight different backdrop values between
    // them; the whole point of the primitive is that there is now one.
    renderWithProviders(
      <Overlay visible onClose={() => {}} title="Title">
        <Text>Body</Text>
      </Overlay>
    );

    const style = screen.getByTestId('overlay-backdrop', { includeHiddenElements: true }).props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flat.backgroundColor).toBe(lightTokens.color.surface.overlay);
  });
});

describe('Sheet', () => {
  it('reserves the bottom safe area so its last control clears the home indicator', () => {
    renderWithProviders(
      <Sheet visible onClose={() => {}} title="Filters" testID="sheet">
        <Text>Body</Text>
      </Sheet>
    );

    const style = screen.getByTestId('sheet').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flat.paddingBottom).toBe(METRICS.insets.bottom);
  });
});

describe('ReportModal (migrated)', () => {
  const open = (onSubmit = jest.fn()) => {
    renderWithProviders(
      <ReportModal
        visible
        onClose={jest.fn()}
        contentType="Listing"
        contentId="ls-1"
        onSubmit={onSubmit}
      />
    );
    return onSubmit;
  };

  it('shows validation inline on the fields rather than in a system alert', () => {
    const onSubmit = open();
    fireEvent.press(screen.getByRole('button', { name: 'Submit report' }));

    expect(screen.getByText('Choose a category.')).toBeTruthy();
    expect(screen.getByText('Add supporting details for your report.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('exposes the categories as radios with a checked state', () => {
    open();
    const radio = screen.getByRole('radio', { name: 'Spam or advertising' });
    expect(radio.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(radio);
    expect(
      screen.getByRole('radio', { name: 'Spam or advertising' }).props.accessibilityState
    ).toMatchObject({ checked: true });
  });

  it('requires the conflicting link only for the conflicting category', () => {
    const onSubmit = open();

    fireEvent.press(screen.getByRole('radio', { name: /Conflicting information/ }));
    fireEvent.changeText(screen.getByLabelText('Supporting details'), 'Contradicts guide gd-2');
    fireEvent.press(screen.getByRole('button', { name: 'Submit report' }));

    expect(screen.getByText('Add a link to the conflicting post.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the member corrects it', () => {
    open();
    fireEvent.press(screen.getByRole('button', { name: 'Submit report' }));
    expect(screen.getByText('Choose a category.')).toBeTruthy();

    fireEvent.press(screen.getByRole('radio', { name: 'Other issues' }));
    expect(screen.queryByText('Choose a category.')).toBeNull();
  });

  // Remediation Wave B′ changed what "submits" means here, and the change is
  // the point of the wave.
  //
  // This case used to assert that a complete form called `onSubmit`
  // synchronously — which it did, and which was the whole defect: every
  // consumer's `onSubmit` was a `console.log`, and the modal announced "Report
  // submitted … our moderators will review this content" immediately afterwards
  // with no request behind it.
  //
  // The modal now posts to `POST /community/reports` itself and calls
  // `onSubmit` only once the server has answered. So the assertion is inverted:
  // a complete form must **not** report anything before the network resolves.
  it('does not report anything until the server has answered', async () => {
    const onSubmit = open();

    fireEvent.press(screen.getByRole('radio', { name: 'Spam or advertising' }));
    fireEvent.changeText(screen.getByLabelText('Supporting details'), 'Repeated advertising');
    fireEvent.press(screen.getByRole('button', { name: 'Submit report' }));

    // Nothing is confirmed on the press. The request is in flight, and the
    // outcome — success alert or "Report not sent" — belongs to its resolution.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Report received/)).toBeNull();

    // Let the rejected request settle so the failure path runs inside `act`
    // rather than after the test has finished.
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('offers the submit control for a job, which is reportable now', () => {
    // This asserted the opposite: `CommunityContentType.Job` was declared in B6's
    // enum and claimed by no content source, so a job was unreportable end to end
    // and the modal offered no button rather than a disabled one. `JobContentSource`
    // claims the type now, so the form is the honest thing to render.
    renderWithProviders(
      <ReportModal visible onClose={jest.fn()} contentType="Job" contentId="job-1" />
    );

    expect(screen.queryByText('Diaspora cannot report a job yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit report' })).toBeTruthy();
  });
});
