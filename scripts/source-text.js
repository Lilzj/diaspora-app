// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — source text without its comments
//
// Every guard that reads this codebase's source reads it through these
// functions (`src/lib/__tests__/support/source-text.ts` gives them types), and
// so does `generate-production-registers.js`, which counts the references to a
// constant before deciding nothing reads it. It is plain JavaScript because
// that script cannot import TypeScript.
//
// ── Why one reader (27 Nov 2026) ───────────────────────────────────────────
//
// Seventy guards carried their own `.replace` chain, and almost all of them
// removed block comments first and line comments second. That order has a
// blind spot: a `/*` inside a line comment ("routes under /creator/*") or a
// string ('/marketplace/*') opens a block that runs to the next real `*/`, and
// everything between disappears. Measured against the TypeScript parser, that
// hid code in 32 application files, four gap registers among them, and 28
// guards read at least one of those files.
//
// Reversing the order does not fix it; it moves the blind spot. Line comments
// first lets a `//` inside a block ("see https://…") take the block's own `*/`
// with it, and the block then runs on into the code that follows.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/**
 * A comment, found in one pass from left to right.
 *
 * Whichever comment opens first owns the text up to its end, the way a
 * tokenizer reads them: a `/*` inside a line comment belongs to that comment,
 * and a `//` inside a block belongs to the block.
 *
 * A comment does not open straight after a letter, a digit, a quote, a
 * backslash, a slash, a dot, a colon or an asterisk. Those are paths, URLs,
 * globs and regular expressions: `'/community/*'`, `'https://…'`,
 * `'**\/*.ts'`, `/^\/\//`.
 *
 * Strings are not tracked, because JSX text is full of apostrophes. Instead
 * `src/lib/__tests__/source-text.test.ts` holds this matcher to the TypeScript
 * parser on every source file, so a string that would fool it fails there,
 * naming the file, rather than quietly hiding code from a guard.
 */
const COMMENT = /(?<![\w'"`\\/.:*])\/(?:\*[\s\S]*?\*\/|\/[^\r\n]*)/g;

/** Where each comment is: `[start, end)` offsets into `source`, in order. */
function commentRanges(source) {
  return Array.from(source.matchAll(COMMENT), (match) => [match.index, match.index + match[0].length]);
}

/**
 * `source` with every comment removed.
 *
 * What a guard reads when it asks whether something is in the code: a comment
 * names a component without rendering it, and this repository's comments
 * routinely quote the very call a guard forbids.
 */
function withoutComments(source) {
  return source.replace(COMMENT, '');
}

/**
 * `source` with every comment blanked to spaces: the same length, the same
 * lines and the same offsets, so a reported `file:line` still points at code.
 */
function blankComments(source) {
  return source.replace(COMMENT, (comment) => comment.replace(/[^\r\n]/g, ' '));
}

module.exports = { blankComments, commentRanges, withoutComments };
