/**
 * Shared primitives — accessibility and consolidation guards
 *
 * These components are the ones with the widest blast radius: `Button` backs
 * 139 call sites once the community and map wrappers are counted, and
 * `ScreenHeader` appears on 101 screens. The properties asserted here are the
 * ones a visual review cannot see — what a screen reader is told, and whether a
 * control still reports itself when it is busy or disabled.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';
import { Input } from '../Input';
import { EmptyState } from '../EmptyState';
import { Skeleton, JobCardSkeleton } from '../Skeleton';
import { ScreenHeader } from '../ScreenHeader';
import { PrimaryButton, SecondaryButton } from '../community/CommunityPrimitives';
import {
  PrimaryButton as MapPrimaryButton,
  SecondaryButton as MapSecondaryButton,
} from '../maps/MapPrimitives';

describe('Button', () => {
  it('reports itself as a button with its label', () => {
    render(<Button label="Apply now" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'Apply now' });
    expect(button).toBeTruthy();
  });

  it('reports busy while loading and refuses the press', () => {
    const onPress = jest.fn();
    render(<Button label="Submit" isLoading onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    // Double-submission protection: a tap mid-flight must not fire again.
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports disabled and refuses the press', () => {
    const onPress = jest.fn();
    render(<Button label="Save" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a loading label in place of the spinner when one is given', () => {
    render(<Button label="Join" loadingLabel="Working…" isLoading onPress={() => {}} />);
    expect(screen.getByText('Working…')).toBeTruthy();
  });

  it('fires once per press when enabled', () => {
    const onPress = jest.fn();
    render(<Button label="Continue" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('CTA consolidation', () => {
  // The community and map surfaces used to ship their own primary buttons with
  // different heights, disabled treatments and accessibility. They now delegate,
  // so these assert the delegation rather than a second implementation.
  it('community buttons expose the shared button contract', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Join group" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Join group' });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('community primary button reports busy, which it previously could not', () => {
    render(<PrimaryButton label="Donate" busy onPress={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Donate' }).props.accessibilityState
    ).toMatchObject({ busy: true });
    expect(screen.getByText('Working…')).toBeTruthy();
  });

  it('community secondary button honours disabled', () => {
    const onPress = jest.fn();
    render(<SecondaryButton label="Cancel" disabled onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('map buttons honour disabled — the secondary one previously ignored it', () => {
    const onPress = jest.fn();
    render(<MapSecondaryButton label="Clear route" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Clear route' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('map primary button still fires when enabled', () => {
    const onPress = jest.fn();
    render(<MapPrimaryButton label="Start" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Input', () => {
  it('names the field for a screen reader using its visible label', () => {
    render(<Input label="Email address" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });

  it('announces a validation error rather than leaving it as silent text', () => {
    render(<Input label="Email" error="Enter a valid email" value="" onChangeText={() => {}} />);

    const message = screen.getByText('Enter a valid email');
    expect(message.props.accessibilityLiveRegion).toBe('polite');
    expect(message.props.accessibilityRole).toBe('alert');
  });

  it('keeps an explicit accessibilityLabel over the visible label', () => {
    render(<Input label="PIN" accessibilityLabel="Four digit PIN" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Four digit PIN')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('announces its title as a heading and hides the decorative emoji', () => {
    render(<EmptyState icon="🗂️" title="No saved jobs" description="Jobs you save appear here." />);

    expect(screen.getByRole('header', { name: 'No saved jobs' })).toBeTruthy();
    // The emoji restates the title; announcing it would repeat the message.
    expect(screen.queryByText('🗂️')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('tells a screen reader that content is loading', () => {
    render(<Skeleton />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  });

  it('announces a card placeholder once, not once per bar', () => {
    render(<JobCardSkeleton />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});

describe('ScreenHeader', () => {
  it('keeps a long title on one line so it cannot grow the header', () => {
    render(<ScreenHeader title="Nigerian Professionals Association of Greater Manchester" />);
    expect(screen.getByRole('header').props.numberOfLines).toBe(1);
  });

  it('exposes the back affordance as a labelled button', () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="Wallet" onBack={onBack} />);

    fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
