/**
 * Source text as a guard reads it: without its comments (FARCH-004, 27 Nov 2026).
 *
 * A comment names a component without rendering it, so the guards that read
 * source read it without comments. Two rules, in this order:
 *
 * - **Whole-line `//` comments go first.** The stripper this replaces removed
 *   block comments first, so a `/*` inside a line comment ("routes under
 *   `/creator/*`") opened a block that ran to the next `*\/`, and everything in
 *   between vanished from the guard: some three hundred lines of
 *   `app/creator/index.tsx` did, and eighteen files lost code that way.
 * - **A block comment opens only where a comment can.** Not straight after a
 *   letter, a digit, a quote, a slash, a dot or a colon: `'/community/*'` is a
 *   path, not a comment.
 *
 * Strings are not tracked, because JSX text is full of apostrophes that a
 * tokenizer would read as quotes. What is left is a `/*` after whitespace in a
 * comment that follows code on the same line.
 */
export function withoutComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
    .replace(/(?<![\w'"`/.:])\/\*[\s\S]*?\*\//g, '');
}
