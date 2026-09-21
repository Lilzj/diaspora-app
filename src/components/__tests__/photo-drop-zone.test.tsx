// ─────────────────────────────────────────────────────────────────────────────
// Asking for a photograph looks the same every time — 21 Sep 2026
//
// Three wizards asked a member for a photograph, and between them they drew
// that one task four ways. Housing alone had three: a 160px dashed panel for
// the cover, an 85px dashed square reading "+ ADD PHOTO" for the gallery, and a
// thin bordered row reading "Select cover image from gallery" for the fallback.
// Marketplace had a solid-bordered 176px panel and a 96px dashed third-width
// square. The provider directory had four 112px dashed boxes. Nothing about the
// task differs between any of them.
//
// Two halves to this file. The first is what the control does, which is the
// part worth keeping right. The second is a source rule, because "these all
// look the same" is not something a render test can see: jsdom has no pixels,
// and panels built from one component are identical by construction while
// hand-rolled ones are identical only until somebody edits one.
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

  /**
   * A full set. The panel could have stayed lit and refused on tap, which is
   * the shape of every "enabled" button on this platform that turns out not to
   * be — so it goes inert and the prompt says what would change that.
   */
  it('goes inert when nothing more can be added, and says what would change it', () => {
    const { onPress } = renderZone({
      disabled: true,
      prompt: 'Four photos is the maximum — remove one to add another',
    });

    expect(screen.getByText(/Four photos is the maximum/)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /Cover Image/ }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the photograph once there is one, and offers to change it', () => {
    renderZone({ previewUri: 'file:///tmp/a.jpg', changeLabel: '📷 Change Cover Photo' });

    expect(screen.getByText('📷 Change Cover Photo')).toBeTruthy();
    expect(screen.queryByText('Tap to upload cover image')).toBeNull();
  });
});

/**
 * Every screen that asks a member for a photograph of their own, and how many
 * times each one asks. Three wizards, four designs between them until today:
 * housing had three, marketplace two more, and the provider directory a fourth.
 *
 * `ImagePickerInput` is deliberately absent. It is the other shared control —
 * one photograph, its own upload — and the screens that use it are already
 * consistent with each other.
 */
const WIZARDS: { name: string; file: string[]; zones: number; handlers: string }[] = [
  {
    name: 'housing',
    file: ['src', 'app', 'housing', 'create.tsx'],
    zones: 3,
    handlers: 'handleCoverPhotoSelect|handleAddGalleryPhoto',
  },
  {
    name: 'marketplace',
    file: ['src', 'app', 'marketplace', 'create.tsx'],
    zones: 2,
    handlers: 'handleCoverPhotoSelect|handleAddGalleryPhoto',
  },
  {
    name: 'provider directory',
    file: ['src', 'app', '(tabs)', 'post.tsx'],
    zones: 1,
    handlers: 'handleAddPhoto|handleUploadPhoto',
  },
];

describe.each(WIZARDS)('the $name wizard photo step', ({ file, zones, handlers }) => {
  const source: string = fs.readFileSync(path.join(process.cwd(), ...file), 'utf8');

  it('asks for every photograph through the one control', () => {
    expect(source.match(/<PhotoDropZone/g)?.length ?? 0).toBe(zones);
  });

  /**
   * The rule that matters: no hand-rolled picker beside them. Each of these
   * handlers opens a picker, and a `TouchableOpacity` carrying one is another
   * design of the same control — which is exactly what the thin
   * "Select cover image from gallery" row and the four dashed boxes were.
   */
  it('has no picker built by hand beside it', () => {
    const carriesHandler = new RegExp('onPress=\\{(\\(\\) => )?(' + handlers + ')\\b');
    const handRolled: string[] = [];

    for (
      let at = source.indexOf('<TouchableOpacity');
      at !== -1;
      at = source.indexOf('<TouchableOpacity', at + 1)
    ) {
      const element = source.slice(at, source.indexOf('>', at));

      if (carriesHandler.test(element)) {
        handRolled.push(element.replace(/\s+/g, ' ').slice(0, 80));
      }
    }

    expect(handRolled).toEqual([]);
  });
});
