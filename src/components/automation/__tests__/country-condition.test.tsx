// ─────────────────────────────────────────────────────────────────────────────
// A country condition keeps the code the platform compares — 11 Sep 2026
//
// On the device the builder's Country condition was a text box saying
// "e.g. Mauritius". The platform compares it with the subject's `CountryCode`,
// `MU`, case-insensitively and nothing more — so a member who typed what the box
// asked for wrote a rule that could never match, and was never told. The job
// alert template's "Which country?" was the same box.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import { ConditionEditor, CountryValueEditor } from '@/components/automation';
import { valueForOperator } from '@/components/automation/BuilderControls';
import { conditionDefinition } from '@/lib/automation/conditions';
import { describeCondition } from '@/lib/automation/dependencies';
import type { AutomationCondition } from '@/types/automation';

const country = conditionDefinition('country')!;

function editor(condition: AutomationCondition, onChange = jest.fn()) {
  render(
    <ThemeProvider>
      <ConditionEditor
        condition={condition}
        definition={country}
        onChange={onChange}
        onRemove={jest.fn()}
      />
    </ThemeProvider>
  );
  return onChange;
}

describe('choosing a country', () => {
  it('stores the code, not the name the member searched for', () => {
    const onChange = editor({ id: 'c1-country', key: 'country', operator: 'equals', value: null });

    fireEvent.changeText(screen.getByLabelText('Search for a country'), 'Mauri');
    fireEvent.press(screen.getByLabelText('Choose Mauritius'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 'MU' }));
  });

  it('shows the name of the country it keeps', () => {
    editor({ id: 'c1-country', key: 'country', operator: 'equals', value: 'MU' });

    expect(screen.getByText('Mauritius')).toBeTruthy();
    // One country under "is": nothing more to add.
    expect(screen.queryByLabelText('Search for a country')).toBeNull();
  });

  it('adds to a list under "is one of"', () => {
    const onChange = editor({ id: 'c1-country', key: 'country', operator: 'includes', value: ['NG'] });

    fireEvent.changeText(screen.getByLabelText('Add a country'), 'Ghana');
    fireEvent.press(screen.getByLabelText('Choose Ghana'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: ['NG', 'GH'] }));
  });

  it('reads a list the platform sent back as one string', () => {
    // The request carries one string per value; a list comes back comma-joined.
    editor({ id: 'c1', key: 'country', operator: 'includes', value: 'NG,GH' });

    expect(screen.getByText('Nigeria')).toBeTruthy();
    expect(screen.getByText('Ghana')).toBeTruthy();
  });

  it('never offers a free-text box for a country', () => {
    editor({ id: 'c1-country', key: 'country', operator: 'equals', value: null });

    expect(screen.queryByPlaceholderText('e.g. Mauritius')).toBeNull();
  });

  it('is the same control on a template', () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider>
        <CountryValueEditor value={null} isList={false} onChange={onChange} />
      </ThemeProvider>
    );

    fireEvent.changeText(screen.getByLabelText('Search for a country'), 'nigeria');
    fireEvent.press(screen.getByLabelText('Choose Nigeria'));

    expect(onChange).toHaveBeenCalledWith('NG');
  });
});

describe('changing how it compares', () => {
  it('keeps one value when "is one of" becomes "is"', () => {
    // A list under "is" reaches the platform as "NG,GH", compared whole.
    expect(valueForOperator(['NG', 'GH'], 'equals')).toBe('NG');
    expect(valueForOperator([], 'notEquals')).toBeNull();
  });

  it('leaves a list alone for the operators that take one', () => {
    expect(valueForOperator(['NG', 'GH'], 'includes')).toEqual(['NG', 'GH']);
    expect(valueForOperator('NG', 'excludes')).toBe('NG');
  });

  it('lets "is" pick one kind of thing, not several', () => {
    // The premise, asserted rather than assumed: a choice condition that offers
    // both. If this stops holding, the test below would pass without testing.
    const kind = conditionDefinition('eventType')!;
    expect(kind.choices?.length).toBeGreaterThan(1);
    expect(kind.operators).toEqual(expect.arrayContaining(['equals', 'includes']));

    const onChange = jest.fn();
    render(
      <ThemeProvider>
        <ConditionEditor
          condition={{ id: 'c1', key: kind.key, operator: 'equals', value: null }}
          definition={kind}
          onChange={onChange}
          onRemove={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('the wording', () => {
  it('reads a code as its country', () => {
    expect(describeCondition({ key: 'country', operator: 'equals', value: 'MU' })).toBe(
      'Country is Mauritius'
    );
  });

  it('reads every country in a list, however it arrived', () => {
    expect(describeCondition({ key: 'country', operator: 'includes', value: ['NG', 'GH'] })).toMatch(
      /Nigeria, Ghana$/
    );
    expect(describeCondition({ key: 'country', operator: 'includes', value: 'NG,GH' })).toMatch(
      /Nigeria, Ghana$/
    );
  });

  it('shows a code it does not know as it is', () => {
    expect(describeCondition({ key: 'country', operator: 'equals', value: 'XX' })).toBe('Country is XX');
  });
});
