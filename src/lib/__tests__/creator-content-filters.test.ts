// ─────────────────────────────────────────────────────────────────────────────
// The content-type chips name every kind of row the list can show — 13 Sep 2026
//
// Found on the device. Aisha's "Your content" list showed her listings and jobs
// under "All", and the chips offered Guides, Updates and Events only: no way to
// see just her jobs. The chip labels were also built as `${value}s`, which would
// have printed "Housings" and "Marketplaces" had anybody added those values.
//
// The server side — that `contentType=Job`, `Housing` and `Marketplace` filter —
// is pinned by the analytics integration suite. This pins the chips.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const source = fs
  .readFileSync(path.join(process.cwd(), 'src', 'app', 'creator', 'analytics.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const filters = /const CONTENT_FILTERS = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? '';

function chip(value: string, label: string): RegExp {
  return new RegExp(`\\{\\s*value:\\s*'${value}',\\s*label:\\s*'${label}'\\s*\\}`);
}

describe('the content-type chips', () => {
  it('are declared where the screen reads them', () => {
    expect(filters).not.toBe('');
  });

  it.each([
    ['all', 'All'],
    ['Guide', 'Guides'],
    ['Update', 'Updates'],
    ['Event', 'Events'],
    ['Marketplace', 'Listings'],
    ['Housing', 'Homes'],
    ['Job', 'Jobs'],
  ])('offer %s, labelled %s', (value, label) => {
    expect(filters).toMatch(chip(value, label));
  });

  it('print the declared label rather than pluralising the value', () => {
    // No `${filter}s` or `${filter.value}s` anywhere — the spelling that makes "Housings".
    expect(source).not.toMatch(/\$\{filter(\.value)?\}s/);
    // And the chip's visible text is the label itself, as a JSX child — not merely somewhere in
    // an accessibility string, which would pass while the chip printed something else.
    expect(source).toMatch(/>\s*\{filter\.label\}\s*</);
  });

  it('filter on the value, not the label', () => {
    // The route understands "Housing", not "Homes".
    expect(source).toMatch(/setContentType\(filter\.value\)/);
  });
});
