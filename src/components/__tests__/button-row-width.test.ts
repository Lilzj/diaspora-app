// ─────────────────────────────────────────────────────────────────────────────
// A Button that shares a row cannot also be full width — 21 Sep 2026
//
// `Button` defaults to `fullWidth`, which compiles to `w-full`: width 100% of
// whatever contains it. That default is right for the overwhelming majority of
// call sites, which is why it exists.
//
// It is wrong for a Button in a `flex-row` beside another one. Two elements
// each asking for the whole width do not negotiate: the first takes it, and the
// second is laid out after it, off the edge of the screen. Measured on an
// Android emulator, 1080px wide, on the housing create wizard:
//
//     Back: bounds=[63,2169][1017,2295]   →  954px
//     Next: bounds=[1049,2169][1080,2295] →   31px
//
// Next was `clickable="true"` and did work when hit. It was a three-millimetre
// target at the extreme edge of the display. The guide wizard had it too, in
// the same shape, and both had shipped.
//
// **`flex-1` goes in `className`, not in `style`.** Both call sites already
// passed `style={{ flex: 1 }}`, and it had never done anything: NativeWind owns
// the `style` of a component carrying a `className`, so the flex never arrived
// and `w-full` was the only thing sizing the button. Dropping `fullWidth` alone
// left them at content width — 217px and 204px, packed to the left — which the
// device showed and no test could have. `className="flex-1"` is merged by
// tailwind-variants into the class string the component builds, and measures:
//
//     Back: [63,2169][531,2295]  → 468px
//     Next: [562,2169][1017,2295] → 455px
//
// **Nothing that runs in CI can see any of this.** It is not a type error, it
// is not a render error, and a component test in jsdom has no screen to
// overflow — the half-fix was caught only by measuring the device a second
// time. So the guard is a source rule: no Button may carry
// `style={{ flex: 1 }}`, which reads like a share of the row and delivers
// nothing. That is the mistake that produced the 31px button,
// and unlike "should this one be full width" it has no legitimate reading.
// ─────────────────────────────────────────────────────────────────────────────

// `require`, not `import`: this project's tsconfig carries no node types, and
// the other source-reading tests here do the same.
const fs = require('fs');
const path = require('path');

interface DirEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/** Every `.tsx` under `src`, so a new wizard is covered the day it is written. */
function sourceFiles(dir: string): string[] {
  const entries: DirEntry[] = fs.readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const full: string = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * Each `<Button …>` element's own text, so a prop is checked against the
 * element that carries it rather than against the file.
 */
function buttonElements(source: string): string[] {
  const elements: string[] = [];

  for (let at = source.indexOf('<Button'); at !== -1; at = source.indexOf('<Button', at + 1)) {
    const end = source.indexOf('>', at);
    if (end !== -1) elements.push(source.slice(at, end));
  }

  return elements;
}

const FLEX_STYLE = /style=\{\{[^}]*\bflex:\s*1\b/;
const FLEX_CLASS = /className="[^"]*\bflex-1\b/;

describe('a Button that shares a row', () => {
  const root = path.join(process.cwd(), 'src');

  const everyButton = () =>
    sourceFiles(root).flatMap((file) =>
      buttonElements(fs.readFileSync(file, 'utf8')).map((element) => ({
        file: path.relative(root, file),
        element,
      }))
    );

  it('never asks for its share through the style prop, which is dropped', () => {
    const offenders = everyButton()
      .filter(({ element }) => FLEX_STYLE.test(element))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  // There is deliberately no rule that every flexed Button opts out of full
  // width. Sixteen call sites carry `flex-1` while keeping the default, and
  // measuring one showed why that is not a defect: the row still fits, it is
  // merely shared unevenly — 528px against 394px, where opting out gives 468
  // and 455. A rule that failed those sixteen would be reporting a preference
  // as a fault, and the next person would switch it off rather than read it.

  /**
   * The rule is only worth anything if it is looking at real call sites. The
   * shape it exists to protect, a Back and a Next sharing one row, each opted
   * out and each taking half, lives in one place since 16 Oct 2026: the shared
   * wizard footer, which the two wizards it was written for now use.
   */
  it('is looking at the wizard footer it was written for', () => {
    const footer = fs.readFileSync(path.join(root, 'components/forms/WizardFooter.tsx'), 'utf8');
    const halves = buttonElements(footer).filter(
      (element) => FLEX_CLASS.test(element) && element.includes('fullWidth={false}')
    ).length;

    expect(halves).toBe(2);

    for (const wizard of ['app/housing/create.tsx', 'app/guide/create.tsx']) {
      expect(fs.readFileSync(path.join(root, wizard), 'utf8')).toContain('<WizardFooter');
    }
  });
});
