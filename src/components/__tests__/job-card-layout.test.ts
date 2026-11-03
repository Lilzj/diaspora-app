// ─────────────────────────────────────────────────────────────────────────────
// The job card's bottom row — Android UAT, 3 Nov 2026
//
// "SALARY MUR 15,000–20,000 a month", the share button and Apply share one
// row. The salary column had no width limit, so a long range in `text-lg`
// took the row and pushed Apply past the card's right edge, where it was drawn
// outside the card.
//
// The salary column now takes what is left (`flex-1 min-w-0`) and wraps onto a
// second line, and the buttons keep their size (`shrink-0`). As in
// `button-row-width.test.ts`, nothing in jsdom can see an overflow, so the
// guard reads the source.
// ─────────────────────────────────────────────────────────────────────────────

// `require`, not `import`: this project's tsconfig carries no node types.
const fs = require('fs');
const path = require('path');

const card: string = fs.readFileSync(path.join(__dirname, '..', 'JobCard.tsx'), 'utf8');

/** The JSX from the bottom-row comment to the end of the component. */
const bottomRow = card.slice(card.indexOf('Bottom row: Salary & Action buttons'));

describe('the job card bottom row', () => {
  it('lets the salary take only the space the buttons leave', () => {
    expect(bottomRow).toMatch(/<View className="flex-1 min-w-0 mr-3">\s*<Text[^>]*>Salary<\/Text>/);
  });

  it('wraps a long salary instead of widening the row', () => {
    expect(bottomRow).toMatch(/numberOfLines=\{2\}[^>]*>\{getSalaryDisplay\(\)\}/);
  });

  it('never shrinks the share and Apply buttons', () => {
    expect(bottomRow).toContain('<View className="flex-row gap-2 shrink-0">');
  });

  it('uses only spacing classes that exist', () => {
    // `mb-4.5` is not on Tailwind's scale, so the perks row had no margin at all.
    expect(card).not.toContain('mb-4.5');
  });
});
