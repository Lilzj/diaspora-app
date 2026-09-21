// ─────────────────────────────────────────────────────────────────────────────
// Asking for a photograph looks the same every time — 21 Sep 2026
//
// The housing wizard's photo step had three controls that all open the same
// kind of picker, drawn three different ways: a 160px dashed panel for the
// cover, an 85px dashed square reading "+ ADD PHOTO" for the gallery, and a
// thin bordered row reading "Select cover image from gallery" for the fallback.
// Nothing about the task differs between them.
//
// Two halves to this file. The first is what the control does, which is the
// part worth keeping right. The second is a source rule, because "these three
// look the same" is not something a render test can see: jsdom has no pixels,
// and three panels built from the same component are identical by construction
// while three hand-rolled ones are identical only until somebody edits one.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import { PhotoDropZone } from '../PhotoDropZone';

// `require`, not `import`: this project's tsconfig carries no node types, and
// the other source-reading tests here do the same.
const fs = require('fs');
const path = require('path');

function renderZone(props: Partial<React.ComponentProps<typeof PhotoDropZone>> = {}) {
  const onPress = jest.fn();

  render(
    <ThemeProvider>
      <PhotoDropZone
        label="Cover Image *"
        prompt="Tap to upload cover image"
        onPress={onPress}
        {...props}
      />
    </ThemeProvider>
  );

  return { onPress };
}

describe('the control that asks for a photograph', () => {
  it('says what it is asking for, and where the photograph can come from', () => {
    renderZone();

    expect(screen.getByText('Cover Image *')).toBeTruthy();
    expect(screen.getByText('Tap to upload cover image')).toBeTruthy();
    expect(screen.getByText('Camera or Photo Gallery')).toBeTruthy();
  });

  it('opens the picker when tapped', () => {
    const { onPress } = renderZone();

    fireEvent.press(screen.getByRole('button', { name: /Cover Image/ }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * A second tap during an upload would start a second one and leave the member
   * with whichever finished last. The wait is also named rather than shown as a
   * bare spinner: a bar at 100% that keeps spinning reads as stuck.
   */
  it('refuses a second photograph while one is still going up, and says why', () => {
    const { onPress } = renderZone({ busy: true, busyLabel: 'Uploading 40%' });

    expect(screen.getByText('Uploading 40%')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /Cover Image/ }));

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * The platform's own refusal, not a shrug. It knows whether the file was too
   * large, the wrong type or refused by a scanner, and each needs a different
   * next step from the member.
   */
  it('shows what the platform said when it refused', () => {
    renderZone({ error: 'That photo is too large to upload. Please choose a smaller one.' });

    expect(screen.getByText(/too large to upload/)).toBeTruthy();
  });

  it('shows the photograph once there is one, and offers to change it', () => {
    renderZone({ previewUri: 'file:///tmp/a.jpg', changeLabel: '📷 Change Cover Photo' });

    expect(screen.getByText('📷 Change Cover Photo')).toBeTruthy();
    expect(screen.queryByText('Tap to upload cover image')).toBeNull();
  });
});

describe('the housing wizard photo step', () => {
  const source: string = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'housing', 'create.tsx'),
    'utf8'
  );

  /** The step's three photo controls, which is what the member sees three of. */
  it('asks for every photograph through the one control', () => {
    expect(source.match(/<PhotoDropZone/g)?.length).toBe(3);
  });

  /**
   * The rule that matters: no hand-rolled picker beside them. Both handlers
   * open a picker sheet, and a `TouchableOpacity` carrying one is a fourth
   * design of the same control — which is exactly what the thin
   * "Select cover image from gallery" row was.
   */
  it('has no picker built by hand beside it', () => {
    const handRolled: string[] = [];

    for (
      let at = source.indexOf('<TouchableOpacity');
      at !== -1;
      at = source.indexOf('<TouchableOpacity', at + 1)
    ) {
      const element = source.slice(at, source.indexOf('>', at));

      if (/onPress=\{(handleCoverPhotoSelect|handleAddGalleryPhoto)\}/.test(element)) {
        handRolled.push(element.replace(/\s+/g, ' ').slice(0, 80));
      }
    }

    expect(handRolled).toEqual([]);
  });
});
