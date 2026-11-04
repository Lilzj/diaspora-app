/**
 * "Edit profile" takes the member to the field — Android UAT, 3 Nov 2026.
 *
 * Every requirement under "Profile completeness" (write a bio, choose areas,
 * list expertise, say which languages, add a cover) had an Edit profile button
 * that scrolled to roughly the same place near the top. The anchors were
 * measured with `onLayout`, whose `y` is relative to the anchor's own parent,
 * so three of them read about 40px. Now each requirement names its field, the
 * field is measured against the scroll content when the button is pressed, and
 * the field is opened or focused.
 *
 * "Publish something" pointed at `/knowledge/create`, which is not a route;
 * the guide writer is `/guide/create`.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { profileFieldFor, requirementRoute } from '@/lib/creator/profile-fields';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TagEditor } from '@/components/forms/TagEditor';

const fs = require('fs');
const path = require('path');

describe('which field a completeness requirement opens', () => {
  it('names one field for each requirement the server sends', () => {
    expect(profileFieldFor('bio')).toBe('bio');
    expect(profileFieldFor('categories')).toBe('categories');
    expect(profileFieldFor('expertise')).toBe('expertise');
    expect(profileFieldFor('languages')).toBe('languages');
    expect(profileFieldFor('cover-image')).toBe('cover');
  });

  it('names none for a requirement met somewhere else', () => {
    expect(profileFieldFor('first-contribution')).toBeNull();
  });
});

describe('where a requirement outside this screen goes', () => {
  it('sends "Publish something" to the guide writer that exists', () => {
    expect(requirementRoute('/knowledge/create')).toBe('/guide/create');
  });

  it('leaves every other route alone', () => {
    expect(requirementRoute('/verification')).toBe('/verification');
    expect(requirementRoute('/creator/profile?field=bio')).toBe('/creator/profile?field=bio');
  });
});

describe('the fields can be opened from outside', () => {
  const options = [
    { key: 'housing', label: 'Housing & Accommodation' },
    { key: 'work', label: 'Work & Employment' },
  ];

  it('opens the areas list when asked to', () => {
    const props = { multiple: true as const, label: 'Areas', options, value: [] as string[], onChange: jest.fn() };
    const { rerender } = render(<SearchableSelect {...props} openRequest={0} />);
    expect(screen.queryByText('Housing & Accommodation')).toBeNull();

    rerender(<SearchableSelect {...props} openRequest={1} />);
    expect(screen.getByText('Housing & Accommodation')).toBeTruthy();
  });

  it('hands its text box to the caller, so it can be focused', () => {
    const ref = React.createRef<TextInput>();
    render(<TagEditor label="Expertise" values={[]} onChange={jest.fn()} placeholder="e.g. Work permits" max={12} inputRef={ref} />);

    expect(ref.current).not.toBeNull();
    fireEvent.changeText(screen.getByLabelText('Expertise'), 'Work permits');
  });
});

describe('the profile screen measures its fields against the scroll content', () => {
  const screenSource: string = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'creator', 'profile.tsx'), 'utf8');

  it('no longer scrolls to an onLayout y, which is relative to the parent', () => {
    expect(screenSource).not.toContain('sectionTops');
    expect(screenSource).toContain('measureLayout');
    expect(screenSource).toContain('getInnerViewRef');
  });
});
