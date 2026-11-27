// ─────────────────────────────────────────────────────────────────────────────
// How a guard reads source: without its comments, and exactly
//
// Seventy guards read this codebase's source to check what the code does, and
// each read it without its comments, because the comments here quote the very
// calls the guards forbid. Until 27 Nov 2026 each did so with its own `.replace`
// chain, and almost all removed block comments before line comments. A `/*`
// inside a line comment or a string then opened a block that ran to the next
// real `*/`: against the TypeScript parser, that hid code in 32 application
// files, most of four gap registers among them, from 28 of those guards.
//
// They all read through `support/source-text` now, and this file holds three
// things about it:
//
//   1. the reader's rules, case by case;
//   2. that it finds exactly the comments the TypeScript parser finds, on every
//      source file a guard reads, so no guard takes a comment for code or code
//      for a comment;
//   3. that no test or script strips comments some other way.
// ─────────────────────────────────────────────────────────────────────────────

import * as ts from 'typescript';

import { blankComments, commentRanges, withoutComments } from './support/source-text';

// Narrow local signatures rather than `@types/node`, as the sibling suites do.
const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const path = require('path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const SCRIPTS = path.join(ROOT, 'scripts');

type Range = [number, number];

const repoPath = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

function walk(directory: string, keep: (file: string, insideTests: boolean) => boolean, insideTests = false): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : walk(full, keep, insideTests || entry.name === '__tests__');
    }
    return /\.[jt]sx?$/.test(entry.name) && keep(full, insideTests) ? [full] : [];
  });
}

/**
 * Every source file a guard reads: everything under `src/` that is not a test,
 * and the configuration at the root (`eas-json-claims` reads `app.config.js`).
 */
const sourceFiles = () => [
  ...walk(SRC, (file, insideTests) => !insideTests && !/\.test\.[jt]sx?$/.test(file)),
  ...fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && /\.[jt]sx?$/.test(entry.name))
    .map((entry) => path.join(ROOT, entry.name)),
];

/** Where guards live: every test under `src/`, and every script. */
const guardFiles = () => [
  ...walk(SRC, (file, insideTests) => insideTests || /\.test\.[jt]sx?$/.test(file)),
  ...walk(SCRIPTS, () => true),
];

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/**
 * The comments the TypeScript parser leaves: whatever `//` or `/*` it finds
 * between two tokens.
 *
 * A string, a template, a regular expression and JSX text are each a token, so
 * nothing inside one can be counted. Between two tokens there is only space and
 * comments, so there a plain pattern finds exactly the comments.
 */
function parserComments(file: string, text: string): Range[] {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const tokens: Range[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    if (node.end > node.pos) {
      const isJsxText = node.kind === ts.SyntaxKind.JsxText || node.kind === ts.SyntaxKind.JsxTextAllWhiteSpaces;
      tokens.push([isJsxText ? node.pos : node.getStart(sourceFile), node.end]);
    }
  };
  visit(sourceFile);

  const comments: Range[] = [];
  const between = (from: number, to: number) => {
    for (const match of text.slice(from, to).matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g)) {
      const start = from + (match.index ?? 0);
      comments.push([start, start + match[0].length]);
    }
  };
  let previous = 0;
  for (const [start, end] of tokens) {
    between(previous, start);
    previous = Math.max(previous, end);
  }
  between(previous, text.length);
  return comments;
}

function firstDisagreement(file: string, text: string, parser: Range[], reader: Range[]): string {
  const key = ([start, end]: Range) => `${start}:${end}`;
  const parserKeys = new Set(parser.map(key));
  const readerKeys = new Set(reader.map(key));
  const line = (offset: number) => text.slice(0, offset).split('\n').length;
  const show = ([start, end]: Range) => text.slice(start, Math.min(end, start + 70)).replace(/\s+/g, ' ');

  const invented = reader.find((range) => !parserKeys.has(key(range)));
  if (invented) return `${repoPath(file)}:${line(invented[0])}  read as a comment, but code: ${show(invented)}`;
  const missed = parser.find((range) => !readerKeys.has(key(range)));
  if (missed) return `${repoPath(file)}:${line(missed[0])}  a comment the reader keeps as code: ${show(missed)}`;
  return `${repoPath(file)}  the same comments in a different order`;
}

describe('the reader', () => {
  it('removes line and block comments, and keeps the code around them', () => {
    expect(withoutComments('const a = 1; // a note\nconst b = 2;')).toBe('const a = 1; \nconst b = 2;');
    expect(withoutComments('/** A doc. */\nconst a = 1;')).toBe('\nconst a = 1;');
    expect(withoutComments('<View>{/* a note */}</View>')).toBe('<View>{}</View>');
  });

  it('gives a comment everything up to its own end, whichever kind opens first', () => {
    // A `/*` inside a line comment opens nothing: not in a whole-line comment,
    expect(withoutComments('// routes under `/creator/*`\nconst kept = 1;\n/* dropped */ const also = 2;')).toBe(
      '\nconst kept = 1;\n const also = 2;'
    );
    // not after a space, which is the case the order alone decides,
    expect(withoutComments('// a /* after a space\nconst kept = 1;\n/* dropped */ const also = 2;')).toBe(
      '\nconst kept = 1;\n const also = 2;'
    );
    // and not in a comment after code.
    expect(withoutComments('const a = 1; // see /* here\nconst kept = 2;\n/* dropped */')).toBe(
      'const a = 1; \nconst kept = 2;\n'
    );
    // A `//` inside a block belongs to the block, and does not take its `*/` with it.
    expect(withoutComments('/* see https://example.com, and // this */ const kept = 1;')).toBe(' const kept = 1;');
    expect(withoutComments('/* a // b */\nconst kept = 1;\n/* c */')).toBe('\nconst kept = 1;\n');
  });

  it('opens no comment inside a path, a URL, a glob or a regular expression', () => {
    expect(withoutComments("const route = '/community/*'; // */")).toBe("const route = '/community/*'; ");
    expect(withoutComments("const a = 'https://example.com/x'; const kept = 1;")).toBe(
      "const a = 'https://example.com/x'; const kept = 1;"
    );
    expect(withoutComments("const glob = 'src/**/*.ts'; const kept = 1; /* x */")).toBe(
      "const glob = 'src/**/*.ts'; const kept = 1; "
    );
    expect(withoutComments('const slashes = /^\\/\\//; const kept = 1;')).toBe('const slashes = /^\\/\\//; const kept = 1;');
  });

  it('blanks without moving anything', () => {
    const source = 'const a = 1; // a note\r\n/**\r\n * A doc.\r\n */\r\nconst b = 2;';
    const blanked = blankComments(source);

    expect(blanked).toHaveLength(source.length);
    expect(blanked.indexOf('const b')).toBe(source.indexOf('const b'));
    expect(blanked.split('\r\n')).toHaveLength(source.split('\r\n').length);
    expect(blanked).not.toMatch(/note|doc/i);
  });

  it('says where each comment is', () => {
    expect(commentRanges('a; // b\n/* c */ d')).toEqual([
      [3, 7],
      [8, 15],
    ]);
  });
});

describe('the reader and the TypeScript parser', () => {
  it('find the same comments in every source file a guard reads', () => {
    const files = sourceFiles();
    let comments = 0;
    const disagreements: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const parser = parserComments(file, text);
      const reader = commentRanges(text);
      comments += parser.length;
      if (JSON.stringify(reader) !== JSON.stringify(parser)) {
        disagreements.push(firstDisagreement(file, text, parser, reader));
      }
    }

    // Not a vacuous pass: the walk found the application, the registers the
    // old order lost most of among it, and the comments in them.
    const read = new Set(files.map(repoPath));
    for (const register of ['analytics-gaps', 'integration-gaps', 'multi-community-gaps', 'financial-gaps']) {
      expect(read).toContain(`src/config/${register}.ts`);
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(comments).toBeGreaterThan(10000);

    expect(disagreements).toEqual([]);
  }, 180_000);
});

describe('no test or script strips comments some other way', () => {
  /**
   * The files that read comments their own way, how many readers each has, and
   * why. Each reads a language other than this codebase's TypeScript, or is the
   * reader. A count rather than a pass: a second reader added beside a C# one is
   * still an offender.
   */
  const OWN_READERS: Record<string, { reads: string; count: number }> = {
    'scripts/source-text.js': { reads: 'the reader itself', count: 1 },
    'src/lib/__tests__/source-text.test.ts': {
      reads: 'the parser oracle, which reads only the space between tokens, and the canaries below',
      count: 6,
    },
    'src/lib/__tests__/backend-row-property-drift.test.ts': { reads: "the backend's C# response contracts", count: 2 },
    'src/lib/__tests__/backend-request-binding-drift.test.ts': {
      reads: "the backend's C# handlers and requests (its client screens go through the reader)",
      count: 2,
    },
    'src/lib/__tests__/backend-gap-register-drift.test.ts': { reads: "the backend's C# route mappings", count: 1 },
    'src/lib/__tests__/reputation-rules-drift.test.ts': { reads: "the backend's C# reputation rules", count: 1 },
    'src/lib/__tests__/creator-earning-drift.test.ts': { reads: 'a C# enum in the backend', count: 1 },
    'src/lib/__tests__/withdrawal-status.test.ts': { reads: 'a C# enum in the backend', count: 1 },
  };

  /** Text with a comment, and the same text with only the comment markers taken out. */
  const PROBES: [string, string][] = [
    ['  // a note', '     a note'],
    ['code(); // a note', 'code();    a note'],
    ['code(); /* a note */ more', 'code();    a note    more'],
    ['<View>{/* a note */}</View>', '<View>{   a note   }</View>'],
    [' * a note', '   a note'],
  ];

  const compile = (body: string, flags: string): RegExp | null => {
    try {
      return new RegExp(body, flags.replace(/[gy]/g, ''));
    } catch {
      return null;
    }
  };

  /**
   * A pattern that reads comments. Either it takes a comment's words out when
   * it replaces, as a stripper does, or it is anchored to the start of a line
   * and tells a comment line from the same line without its markers, as a line
   * filter does. A pattern that only matches a slash or an asterisk does neither.
   */
  const findsComments = (pattern: RegExp) => {
    const everywhere = new RegExp(pattern.source, `${pattern.flags}g`);
    return PROBES.some(([withComment, without]) => {
      const strips =
        !withComment.replace(everywhere, '').includes('a note') && without.replace(everywhere, '').includes('a note');
      const filters = pattern.source.startsWith('^') && pattern.test(withComment) && !pattern.test(without);
      return strips || filters;
    });
  };

  function commentReadersIn(file: string): { line: number; text: string }[] {
    const text = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    const found: { line: number; text: string }[] = [];
    const report = (node: ts.Node) =>
      found.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 100),
      });

    const visit = (node: ts.Node): void => {
      if (ts.isRegularExpressionLiteral(node)) {
        const end = node.text.lastIndexOf('/');
        const pattern = compile(node.text.slice(1, end), node.text.slice(end + 1));
        if (pattern && findsComments(pattern)) report(node);
      } else if (
        (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'RegExp'
      ) {
        const [body, flags] = node.arguments ?? [];
        if (body && ts.isStringLiteralLike(body) && (!flags || ts.isStringLiteralLike(flags))) {
          const pattern = compile(body.text, flags ? flags.text : '');
          if (pattern && findsComments(pattern)) report(node);
        }
      } else if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'startsWith' &&
        node.arguments.length > 0 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        node.arguments[0].text === '//'
      ) {
        report(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }

  it('tells a comment-reading pattern from any other', () => {
    expect(findsComments(/\/\*[\s\S]*?\*\//)).toBe(true);
    expect(findsComments(new RegExp('//[^\\n]*'))).toBe(true);
    expect(findsComments(/^\s*(\/\/|\*)/)).toBe(true);
    expect(findsComments(/(^|[^:])\/\/.*$/m)).toBe(true);
    expect(findsComments(/\{\/\*[\s\S]*?\*\/\}/)).toBe(true);
    // A path separator, a run of slashes in a URL and a regex escaper match a
    // slash or an asterisk, and read no comment.
    expect(findsComments(/https?:\/\/\S+/)).toBe(false);
    expect(findsComments(/[\\/]/)).toBe(false);
    expect(findsComments(/\/{2,}/)).toBe(false);
    expect(findsComments(/[.*+?^${}()|[\]\\]/)).toBe(false);
    expect(findsComments(/\buse[A-Z]\w*\(/)).toBe(false);
  });

  it('every guard reads comments through the shared reader', () => {
    const files = guardFiles();
    const offenders = files.flatMap((file) => {
      const readers = commentReadersIn(file);
      const own = OWN_READERS[repoPath(file)];
      if (own === undefined) return readers.map(({ line, text }) => `${repoPath(file)}:${line}  ${text}`);
      return readers.length === own.count
        ? []
        : [`${repoPath(file)}: ${own.count} reader(s) of ${own.reads} expected, ${readers.length} found`];
    });

    expect(files.length).toBeGreaterThan(300);
    expect(offenders).toEqual([]);
  }, 120_000);
});
