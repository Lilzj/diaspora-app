// ─────────────────────────────────────────────────────────────────────────────
// A document cannot be issued in the future
//
// Added 7 Oct 2026, after a passport "issued" on 31 Oct was accepted on 7 Oct
// and approved. The server now refuses it; the calendar greys those days out so
// a member is never offered a date the server will refuse.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DatePickerInput } from '@/components/DatePickerInput';

function openOn(value: string, limits: { minDate?: string; maxDate?: string }) {
  const onChangeDate = jest.fn();
  render(
    <DatePickerInput label="Issue date" value={value} onChangeDate={onChangeDate} {...limits} />,
  );
  fireEvent.press(screen.getByText(value));
  return onChangeDate;
}

/** The pressable for one day of the month on show. */
function day(n: number) {
  return screen.getAllByText(String(n)).map((text) => text.parent?.parent ?? text)[0];
}

describe('DatePickerInput limits', () => {
  it('refuses a day after maxDate and accepts maxDate itself', () => {
    const onChangeDate = openOn('2026-10-07', { maxDate: '2026-10-07' });

    fireEvent.press(day(31));
    expect(onChangeDate).not.toHaveBeenCalled();

    fireEvent.press(day(7));
    expect(onChangeDate).toHaveBeenCalledWith('2026-10-07');
  });

  it('refuses a day before minDate', () => {
    const onChangeDate = openOn('2026-10-20', { minDate: '2026-10-15' });

    fireEvent.press(day(14));
    expect(onChangeDate).not.toHaveBeenCalled();

    fireEvent.press(day(15));
    expect(onChangeDate).toHaveBeenCalledWith('2026-10-15');
  });

  it('limits nothing when no limit is given', () => {
    // Ten other forms use this picker, and none of them asked for a limit.
    const onChangeDate = openOn('2026-10-07', {});

    fireEvent.press(day(31));
    expect(onChangeDate).toHaveBeenCalledWith('2026-10-31');
  });
});

describe('what stops the tap on a phone', () => {
  it('is the disabled prop, not only the accessibility state', () => {
    // The testing library refuses a press on either, a phone only on
    // `disabled` — so the tests above cannot tell them apart.
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'DatePickerInput.tsx'),
      'utf8',
    );

    expect(source).toMatch(/disabled=\{outOfRange\}/);
  });
});
