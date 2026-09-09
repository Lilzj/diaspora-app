// ─────────────────────────────────────────────────────────────────────────────
// Two layout defects a screenshot found and no test could
//
// ── The tab strip that never scrolled ───────────────────────────────────────
//
// The proximity hub's row carried `overflow-x-scroll`. That is a **web** class:
// NativeWind has nothing to map it to on React Native, so it compiled to
// nothing and the row was a plain fixed-width `View`. Seven tabs inside it each
// asked for `flex-1 min-w-[70px]`, which cannot be satisfied, so they were
// squeezed below their own stated minimum and the last one was cut off at the
// edge of the screen.
//
// A class that silently does nothing is the worst kind: the code reads as
// though the case was handled.
//
// ── Three short labels, three full widths ───────────────────────────────────
//
// "Get directions", "Add to calendar" and "Remind me" were three stacked
// full-width buttons. Nothing was broken, and it was still wrong: they read as
// three unrelated decisions rather than one row of things you can do, and they
// pushed the rest of the event a screenful further down.
//
// Neither of these could fail a unit test. Both were obvious in one screenshot,
// which is the whole argument for looking at the thing on a device.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

/** A file's code with its prose removed, so a comment cannot fail a check. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');
}

const SCREEN = code('app', 'community-life', 'event', '[id].tsx');

describe('the event screen does not use web-only classes', () => {
  it('has no overflow class that React Native cannot honour', () => {
    // `overflow-x-scroll`, `overflow-auto` and friends compile to nothing here.
    // Something that must scroll needs a `ScrollView`.
    expect(SCREEN).not.toMatch(/overflow-(x|y)-|overflow-auto|overflow-scroll/);
  });
});

describe('the proximity hub tabs', () => {
  it('sit in a horizontal ScrollView', () => {
    expect(SCREEN).toMatch(/<ScrollView\s+horizontal/);
  });

  it('are sized to their labels rather than fighting over a fixed width', () => {
    // `flex-1 min-w-[70px]` on seven siblings is a contradiction, and the
    // seventh fell off the screen resolving it.
    expect(SCREEN).not.toMatch(/flex-1 py-2 rounded-xl items-center justify-center min-w-/);
  });

  it('no longer advertises a restaurants integration that does not exist', () => {
    // A seventh tab whose panel promised "reservations, menus, and discounts",
    // with no data source and no route, and whose count read "Future-ready" —
    // a string in the place every sibling shows a number. It was also the tab
    // pushing the strip over the edge.
    expect(SCREEN).not.toContain('Future-ready');
    expect(SCREEN).not.toContain('Nearby Restaurants Integration');
    expect(SCREEN).not.toMatch(/activeEcosystemTab === 'Restaurants'/);
  });

  it('still offers the six that have something behind them', () => {
    for (const tab of ['Updates', 'Community', 'Guides', 'Services', 'Jobs', 'Housing']) {
      expect(SCREEN).toMatch(new RegExp(`key: '${tab}'`));
    }
  });
});

describe('the three things you can do with an event', () => {
  it('share one row rather than a full width each', () => {
    expect(SCREEN).toMatch(/flex-row flex-wrap gap-2/);
  });

  it('use labels short enough not to wrap in a third of a screen', () => {
    expect(SCREEN).toContain('>Directions<');
    expect(SCREEN).toContain('>Calendar<');
    expect(SCREEN).not.toContain('>Get directions<');
    expect(SCREEN).not.toContain('>Add to calendar<');
  });

  it('asks the reminder button for its compact trigger', () => {
    expect(SCREEN).toMatch(/<EventReminderButton\s+compact/);
  });

  it('keeps the reminder panels full width', () => {
    // The offsets are a vertical list and the summary is a paragraph; either
    // squeezed into a third of a screen would be unreadable. They ask for the
    // whole line, and the wrapping row gives it to them.
    const component = code('components', 'automation', 'ContextualAutomation.tsx');

    expect(component).toMatch(/compact \? \{ width: '100%' as const \} : \{\}/);
  });
});
