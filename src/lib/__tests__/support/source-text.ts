/**
 * Source text as a guard reads it: without its comments.
 *
 * A comment names a component without rendering it, and this repository's
 * comments routinely quote the very call a guard forbids, so a guard that
 * reads source reads it through here. The reader itself is
 * `scripts/source-text.js`, because the production-registers generator needs
 * it too and cannot import TypeScript; this module gives it types.
 *
 * `source-text.test.ts` holds it to the TypeScript parser on every source
 * file, and fails any test or script that strips comments some other way.
 */
const reader = require('../../../../scripts/source-text') as {
  blankComments(source: string): string;
  commentRanges(source: string): [number, number][];
  withoutComments(source: string): string;
};

/** `source` with every comment removed. */
export const withoutComments: (source: string) => string = reader.withoutComments;

/**
 * `source` with every comment blanked to spaces: the same length, the same
 * lines and the same offsets, so a reported `file:line` still points at code.
 */
export const blankComments: (source: string) => string = reader.blankComments;

/** Where each comment is: `[start, end)` offsets into `source`, in order. */
export const commentRanges: (source: string) => [number, number][] = reader.commentRanges;
