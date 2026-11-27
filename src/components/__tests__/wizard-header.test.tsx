/**
 * WizardHeader: the top of every step wizard (FARCH-007, 27 Nov 2026).
 *
 * Ten wizards drew where the member was in their own way, and only one told a
 * screen reader. The header says the wizard's name and "Step n of N", draws the
 * bar as a progressbar a screen reader can read, and heads the screen with the
 * step's own title.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import { WizardHeader, WizardProgress } from '@/components/forms/WizardHeader';

/** The screen header reads the theme, as it does in the app. */
const themed = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const STEPS = ['The role', 'Details and pay', 'Where the work is', 'Review and publish'] as const;

describe('WizardProgress', () => {
  it('says where the member is, counted from one', () => {
    render(<WizardProgress name="Post a job" step={1} total={4} />);

    expect(screen.getByText('Post a job')).toBeTruthy();
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
  });

  it('tells a screen reader, as a progressbar with a value', () => {
    render(<WizardProgress name="Post a job" step={2} total={4} />);

    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe('Step 3 of 4');
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 3 });
  });

  it('fills the bar by the step', () => {
    render(<WizardProgress name="Post a job" step={0} total={4} />);

    const fill = screen.getByRole('progressbar').props.children;
    expect(fill.props.style).toEqual({ width: '25%' });
  });

  it('never counts past either end', () => {
    const { rerender } = render(<WizardProgress name="Swap" step={-1} total={4} />);
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();

    rerender(<WizardProgress name="Swap" step={9} total={4} />);
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
  });
});

describe('WizardHeader', () => {
  it('heads the screen with the step on it, under where the member is', () => {
    themed(<WizardHeader name="Post a job" steps={STEPS} step={2} />);

    expect(screen.getByText('Where the work is')).toBeTruthy();
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    expect(screen.queryByText('Details and pay')).toBeNull();
  });

  it('hands back and the right action to the screen header', () => {
    const onBack = jest.fn();
    themed(
      <WizardHeader
        name="Register Hub"
        steps={STEPS}
        step={1}
        onBack={onBack}
        rightAction={<Text>Save draft</Text>}
      />
    );

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Save draft')).toBeTruthy();
  });
});
