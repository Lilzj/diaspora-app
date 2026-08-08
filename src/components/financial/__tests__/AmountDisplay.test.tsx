// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Amount display component tests (Frontend Phase 5)
//
// The accessibility assertions here are the point. §28 forbids communicating a
// status through colour alone, and an amount is the single most colour-coded
// element on a financial screen: a red number and a green number that read
// identically to a screen reader are a wallet nobody can audit by ear.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { AmountDisplay, CurrencyDisplay, LabelledAmount } from '../AmountDisplay';
import { fromMinorUnits } from '@/lib/money';

const gbp = (minorUnits: number) => fromMinorUnits(minorUnits, 'GBP', 2, '£');
const jpy = (minorUnits: number) => fromMinorUnits(minorUnits, 'JPY', 0, '¥');

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

describe('AmountDisplay', () => {
  it('renders the amount with the server-supplied symbol', () => {
    renderWithTheme(<AmountDisplay value={gbp(14750)} />);
    expect(screen.getByText(/£147\.50/)).toBeTruthy();
  });

  it('respects a zero-exponent currency', () => {
    renderWithTheme(<AmountDisplay value={jpy(1500)} />);
    expect(screen.getByText(/¥1,500/)).toBeTruthy();
    expect(screen.queryByText(/¥1,500\.00/)).toBeNull();
  });

  it('gives a screen reader the currency in words, not a symbol', () => {
    renderWithTheme(<AmountDisplay value={gbp(14750)} />);

    const label = screen.getByLabelText(/pound/i);
    expect(label).toBeTruthy();
  });

  it('says "minus" for a negative amount rather than relying on colour', () => {
    renderWithTheme(<AmountDisplay value={gbp(-2500)} />);
    expect(screen.getByLabelText(/^minus /i)).toBeTruthy();
  });

  it('prefixes the accessible label when given context', () => {
    renderWithTheme(<AmountDisplay value={gbp(14750)} accessibilityPrefix="Available balance" />);
    expect(screen.getByLabelText(/available balance/i)).toBeTruthy();
  });

  it('shrinks rather than wrapping, so a large amount stays one line', () => {
    renderWithTheme(<AmountDisplay value={gbp(123456789)} size="hero" />);

    const node = screen.getByText(/1,234,567\.89/);
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.adjustsFontSizeToFit).toBe(true);
  });

  it('renders the code instead of the symbol on request', () => {
    renderWithTheme(<AmountDisplay value={gbp(1000)} showCode />);
    expect(screen.getByText(/GBP/)).toBeTruthy();
  });
});

describe('LabelledAmount', () => {
  it('speaks the label and the amount as one phrase', () => {
    renderWithTheme(<LabelledAmount label="Available" value={gbp(14750)} />);

    // A bare number in a screen reader's output is a number with no meaning.
    expect(screen.getByLabelText(/available.*pound/i)).toBeTruthy();
  });

  it('does not read the visible label a second time', () => {
    renderWithTheme(<LabelledAmount label="Available" value={gbp(14750)} />);

    // The label is hidden from assistive tech — the wrapper already speaks it
    // together with the amount, and hearing "Available. Available, £147.50" is
    // worse than not hearing the label at all. `includeHiddenElements` is what
    // makes it findable in the test at all, which is itself the assertion.
    expect(screen.queryByText('Available')).toBeNull();

    const visibleLabel = screen.getByText('Available', { includeHiddenElements: true });
    expect(visibleLabel.props.importantForAccessibility).toBe('no');
  });

  it('folds a hint into the spoken phrase', () => {
    renderWithTheme(
      <LabelledAmount label="Held" value={gbp(4500)} hint="Against a pending payment" />
    );

    expect(screen.getByLabelText(/held.*against a pending payment/i)).toBeTruthy();
  });
});

describe('CurrencyDisplay', () => {
  it('shows the code and name together', () => {
    renderWithTheme(<CurrencyDisplay code="GBP" name="Pound Sterling" />);
    expect(screen.getByText('GBP · Pound Sterling')).toBeTruthy();
  });

  it('falls back to the code alone', () => {
    renderWithTheme(<CurrencyDisplay code="XAF" />);
    expect(screen.getByText('XAF')).toBeTruthy();
  });
});
