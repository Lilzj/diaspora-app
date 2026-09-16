/**
 * A button in a row must not take the whole row — 16 Sep 2026.
 *
 * `Button` is full width by default (`defaultVariants: { fullWidth: true }` in
 * `components/Button.tsx`). Put one beside a column of text inside a
 * `flex-row` and it takes `w-full`: the text column is squeezed to zero width,
 * every line wraps to one character, and nothing is visible.
 *
 * **"My Listings" shipped like that.** Every row — item, home, draft — rendered
 * as a bare icon and a stretched "Open" button. It survived because it is
 * invisible to everything except a screenshot: the titles were still in the
 * React tree, `tsc` and 5,800 tests were green, and a zero-width `Text` does not
 * even appear in the Android accessibility dump, so a tap-through that reads the
 * dump sees nothing wrong either.
 *
 * So the shape is pinned here instead. A button that shares a row with anything
 * else has to say how wide it is: `fullWidth={false}` to hug its label, or
 * `flex-1` to share the row deliberately — which is what the six publish
 * wizards' "Back / Next" footers do.
 */
const fs = require('fs') as {
  readdirSync(p: string): string[];
  readFileSync(p: string, e: string): string;
  statSync(p: string): { isDirectory(): boolean };
};
const path = require('path') as { join(...parts: string[]): string; relative(a: string, b: string): string };

const ROOT: string = path.join(process.cwd(), 'src');

function screens(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (fs.statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      screens(full, acc);
      continue;
    }

    if (/\.tsx$/.test(entry)) acc.push(full);
  }

  return acc;
}

const indentOf = (line: string): number => line.length - line.trimStart().length;
const OPENS_TAG = /^\s*<[A-Za-z]/;

/** Whether this button element says how wide it is. */
function declaresWidth(element: string): boolean {
  return (
    element.includes('fullWidth')
    || /className="[^"]*\bflex-1\b/.test(element)
    || /style=\{\{[^}]*flex:\s*1/.test(element)
  );
}

interface Offence {
  file: string;
  line: number;
  parent: string;
}

/**
 * Every `<Button>` that is a direct child of a flex row holding something else.
 *
 * By indentation rather than by parsing: the repository has no JSX parser in its
 * test dependencies, and the shape being looked for — a button and a sibling,
 * one level in from a row — is exactly what indentation expresses.
 */
function offences(source: string, file: string): Offence[] {
  const lines = source.split('\n');
  const found: Offence[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*<Button\b/.test(lines[i])) continue;

    const buttonIndent = indentOf(lines[i]);

    // The element that encloses it.
    let parentIndex = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (!lines[j].trim()) continue;
      if (indentOf(lines[j]) < buttonIndent && OPENS_TAG.test(lines[j])) {
        parentIndex = j;
        break;
      }
    }

    if (parentIndex < 0) continue;

    // Its attributes may span lines; read to the end of the opening tag.
    let parent = '';
    for (let j = parentIndex; j < lines.length; j += 1) {
      parent += `${lines[j]} `;
      if (lines[j].includes('>')) break;
    }

    const isRow =
      /className="[^"]*\bflex-row\b/.test(parent)
      || /flexDirection:\s*'row'/.test(parent);

    if (!isRow) continue;

    // Anything else in the row.
    let siblings = 0;
    for (let k = parentIndex + 1; k < lines.length; k += 1) {
      if (lines[k].trim() && indentOf(lines[k]) < buttonIndent) break;
      if (indentOf(lines[k]) !== buttonIndent) continue;

      const start = lines[k].trimStart();
      if ((start.startsWith('<') || start.startsWith('{')) && !/^<Button\b/.test(start)) {
        siblings += 1;
      }
    }

    if (siblings === 0) continue;

    // The button element itself, to the end of its opening tag.
    let element = '';
    for (let j = i; j < lines.length; j += 1) {
      element += `${lines[j]} `;
      if (lines[j].includes('/>') || lines[j].includes('>')) break;
    }

    if (!declaresWidth(element)) {
      found.push({ file, line: i + 1, parent: parent.trim().slice(0, 60) });
    }
  }

  return found;
}

describe('a button that shares a row', () => {
  it('says how wide it is, so the words beside it are not squeezed to nothing', () => {
    const offenders = screens(ROOT).flatMap((file) =>
      offences(fs.readFileSync(file, 'utf8'), path.relative(process.cwd(), file))
    );

    expect(
      offenders.map((offence) => `${offence.file}:${offence.line} in ${offence.parent}`)
    ).toEqual([]);
  });

  it('is the check that would have caught My Listings', () => {
    // The row as it shipped: an icon, a column of text, and a full-width button.
    const shipped = [
      '<View className="flex-row items-start">',
      '  <Text className="text-2xl mr-3">{ROW_ICON[item.kind]}</Text>',
      '  <View className="flex-1">',
      '    <Text>{item.title}</Text>',
      '  </View>',
      '  <Button',
      '    label="Open"',
      '    variant="outline"',
      '    onPress={() => router.push(item.href)}',
      '  />',
      '</View>',
    ].join('\n');

    expect(offences(shipped, 'shipped.tsx')).toHaveLength(1);

    // And the two ways of saying it: hug the label, or share the row.
    expect(offences(shipped.replace('label="Open"', 'label="Open" fullWidth={false}'), 'x.tsx')).toEqual([]);
    expect(offences(shipped.replace('label="Open"', 'label="Open" className="flex-1"'), 'x.tsx')).toEqual([]);
  });
});
