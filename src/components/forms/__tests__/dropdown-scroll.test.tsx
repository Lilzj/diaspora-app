/**
 * A long dropdown scrolls by itself, not the page (owner, 5 Nov 2026). The
 * category list in buy and sell, Post a job and the other forms opened as a
 * plain list inside the page, so a long one ran down the screen and dragging it
 * scrolled the whole form away. The list now keeps to a fixed height inside
 * the field and scrolls on its own; on Android that needs `nestedScrollEnabled`,
 * because the form around it is a scroll view too.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { DROPDOWN_LIST_MAX_HEIGHT } from '@/components/forms/DropdownList';
import { SearchableSelect } from '@/components/forms/SearchableSelect';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

const MANY = Array.from({ length: 30 }, (_, index) => ({ key: `kind-${index}`, label: `Kind ${index}` }));

function flatStyle(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

describe('a long dropdown', () => {
  it('keeps to a fixed height and scrolls its own list inside the page', () => {
    render(<SearchableSelect options={MANY} value={null} onChange={jest.fn()} testID="category" />);

    fireEvent.press(screen.getByRole('button', { name: /Category/ }));

    const list = screen.getByTestId('category-list');
    expect(list.props.nestedScrollEnabled).toBe(true);
    expect(flatStyle(list.props.style).maxHeight).toBe(DROPDOWN_LIST_MAX_HEIGHT);
    expect(within(list).getByText('Kind 0')).toBeTruthy();
    expect(within(list).getByText('Kind 29')).toBeTruthy();
  });

  it('keeps a tap on an option while the keyboard is up', () => {
    const onChange = jest.fn();
    render(<SearchableSelect options={MANY} value={null} onChange={onChange} testID="category" />);

    fireEvent.press(screen.getByRole('button', { name: /Category/ }));

    expect(screen.getByTestId('category-list').props.keyboardShouldPersistTaps).toBe('handled');
    fireEvent.press(screen.getByText('Kind 12'));
    expect(onChange).toHaveBeenCalledWith('kind-12');
  });

  it('is how the town picker lists its towns too', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'forms', 'TownPicker.tsx'), 'utf8');
    expect(source).toMatch(/<DropdownList[\s\S]*results\.map\([\s\S]*<\/DropdownList>/);
  });
});
