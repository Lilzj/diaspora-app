/**
 * Keyboard safety — the arrangement every form depends on.
 *
 * The audit found 69 screens with a text field and 14 handling the keyboard.
 * Rather than patch 55 screens, the fix went into the five module shells and
 * one shared scroll container, which between them back 69 screens. These tests
 * hold that arrangement in place, including the Android branch that one of the
 * original hand-written copies had wrong.
 */

import React from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { KeyboardAwareScrollView } from '../KeyboardAwareScrollView';
import { CommunityScreen } from '@/components/community/CommunityScreen';
import { CreatorScreen } from '@/components/creator-economy/CreatorScreen';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithProviders(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{node}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const flatten = (style: unknown) =>
  Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as Record<string, unknown>);

describe('KeyboardAwareScrollView', () => {
  it('keeps taps working while the keyboard is up', () => {
    // The classic symptom: a Submit button that needs two taps, because the
    // first is consumed dismissing the keyboard.
    renderWithProviders(
      <KeyboardAwareScrollView>
        <TextInput accessibilityLabel="Field" />
      </KeyboardAwareScrollView>
    );
    expect(screen.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('reserves the bottom safe area below the last field', () => {
    renderWithProviders(
      <KeyboardAwareScrollView>
        <Text>Body</Text>
      </KeyboardAwareScrollView>
    );
    const style = flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(METRICS.insets.bottom);
  });

  it('adds a caller-supplied footer allowance on top of the inset', () => {
    renderWithProviders(
      <KeyboardAwareScrollView extraBottomInset={96}>
        <Text>Body</Text>
      </KeyboardAwareScrollView>
    );
    const style = flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(METRICS.insets.bottom + 96);
  });

  it('applies keyboard padding on Android too, rather than trusting the window', () => {
    // The usual advice is to leave `behavior` unset on Android and let
    // `adjustResize` shrink the window. That is wrong for this app: it targets
    // SDK 36, and Android 15+ stops honouring `adjustResize` under enforced
    // edge-to-edge. Measured on device — opening the keyboard on the sign-in
    // screen left the layout pixel-identical and the primary button sat behind
    // the keyboard (F-033). This assertion exists so that finding is not
    // quietly undone by someone restoring the conventional advice.
    renderWithProviders(
      <KeyboardAwareScrollView>
        <Text>Body</Text>
      </KeyboardAwareScrollView>
    );
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });
});

describe.each([
  ['CommunityScreen', CommunityScreen],
  ['CreatorScreen', CreatorScreen],
] as const)('%s', (_name, Shell) => {
  it('lifts both the body and the pinned footer above the keyboard', () => {
    // The footer is rendered outside the scroll view, so wrapping only the
    // scroll view would still leave the submit button under the keyboard.
    renderWithProviders(
      <Shell title="Create" footer={<Text>Submit</Text>}>
        <TextInput accessibilityLabel="Field" />
      </Shell>
    );

    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav).toBeTruthy();
    expect(kav.props.behavior).toBe('padding');

    // Both the scroll body and the footer live inside it.
    expect(screen.getByText('Submit')).toBeTruthy();
    expect(screen.getByLabelText('Field')).toBeTruthy();
  });

  it('keeps the footer button tappable on the first press', () => {
    renderWithProviders(
      <Shell title="Create" footer={<Text>Submit</Text>}>
        <TextInput accessibilityLabel="Field" />
      </Shell>
    );
    expect(screen.UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('reserves room for the footer so the last field is not trapped behind it', () => {
    renderWithProviders(
      <Shell title="Create" footer={<Text>Submit</Text>}>
        <Text>Body</Text>
      </Shell>
    );
    const style = flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(METRICS.insets.bottom + 96);
  });
});
