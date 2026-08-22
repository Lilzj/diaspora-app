// ─────────────────────────────────────────────────────────────────────────────
// A fallback may not invent a fact about somebody
//
// ── What this exists to stop ─────────────────────────────────────────────────
//
// On 22 Aug 2026 the organisation profile rendered:
//
//     {org.rating || 4.7} / 5.0 rating          — beside a five-star icon
//     {org.reputationLevel || 'Highly Trusted'} — as a green badge
//
// `OrganizationResponse` declares neither field. **The platform has no
// organisation rating at all**, so both fallbacks fired on every profile,
// always. The organisation this was found on was `verificationState:
// "Unverified"` with one member, and the application told the reader it was
// rated 4.7 out of 5 and Highly Trusted — on the surface a member uses to
// decide whether a group is safe to deal with.
//
// The event screen had the same shape: `event.location.latitude || 51.5` and
// `|| -0.1`, which is central London, under a caption reading "Mini-Map
// Preview".
//
// ── Why the pattern rather than the two instances ────────────────────────────
//
// `??` and `||` are ordinary and overwhelmingly benign — a default page size, a
// fallback colour, an empty array. What is not benign is a **literal that reads
// as a measurement**: a rating, a score, a coordinate, a trust label. Those
// assert something about a person, an organisation or a place, and a reader
// cannot tell an invented one from a real one.
//
// So this bans a narrow shape: a numeric or trust-word literal used as the
// fallback of a `||`/`??` inside a screen. A genuine default that is not a
// claim — `?? 0` for a count, `?? []` for a list — is untouched.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals declared locally; adding `"node"` to the tsconfig `types` field
// breaks `__DEV__` in other suites.
declare const __dirname: string;
declare const require: (id: string) => unknown;

const fs = require('fs') as {
  readdirSync: (p: string) => string[];
  readFileSync: (p: string, enc: string) => string;
  statSync: (p: string) => { isDirectory: () => boolean };
};
const path = require('path') as { join: (...parts: string[]) => string };

const APP_ROOT: string = path.join(__dirname, '..');

/** Trust words that assert a judgement about somebody. */
const TRUST_WORDS = /^(highly |very |extremely )?(trusted|verified|reliable|excellent|reputable|safe|recommended)/i;

function screens(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      screens(full, acc);
    } else if (/\.tsx$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Comments blanked, **line numbering preserved**.
 *
 * A block comment is replaced by its own newlines rather than by a space. The
 * reported line has to index back into the original file — both to be a usable
 * "file:line" and because the allow-list matches on the raw text of that line —
 * and collapsing a twenty-line comment to one character silently shifts every
 * line after it.
 */
function withoutComments(source: string): string {
  const block = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const line = new RegExp('//[^\\n]*', 'g');
  return source
    .replace(block, (match) => match.replace(/[^\n]/g, ' '))
    .replace(line, (match) => ' '.repeat(match.length));
}

interface Offence {
  file: string;
  line: number;
  source: string;
}

/**
 * `x || 4.7`, `x ?? 51.5`, `x || 'Highly Trusted'` — inside JSX only.
 *
 * Restricted to braces so it reads rendered output rather than configuration.
 * A `const PAGE_SIZE = opts.size ?? 20` is not a claim about anybody; the same
 * expression printed next to a star icon is.
 */
function fabrications(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const lines = withoutComments(source).split('\n');

  // A decimal literal is the tell: whole numbers are overwhelmingly counts and
  // indexes, while a rating, a score or a coordinate carries a decimal point.
  const numeric = /(?:\|\||\?\?)\s*(-?\d+\.\d+)/g;
  const words = /(?:\|\||\?\?)\s*['"]([^'"]{3,40})['"]/g;

  lines.forEach((line, i) => {
    if (!line.includes('{')) return;

    let match = numeric.exec(line);
    while (match !== null) {
      found.push({ line: i + 1, text: match[0].trim() });
      match = numeric.exec(line);
    }
    numeric.lastIndex = 0;

    match = words.exec(line);
    while (match !== null) {
      if (TRUST_WORDS.test(match[1])) found.push({ line: i + 1, text: match[0].trim() });
      match = words.exec(line);
    }
    words.lastIndex = 0;
  });

  return found;
}

/**
 * Fallbacks that look like the banned shape and are not.
 *
 * Kept as an explicit list with a reason each, rather than by widening the
 * pattern until it stops matching: the next reader needs to see that this was
 * judged, not that the check quietly got weaker.
 */
const ALLOWED: { file: string; fragment: string; because: string }[] = [
  {
    file: 'guide/[id].tsx',
    fragment: "guide.trustMark.badge ?? 'Verified'",
    because:
      'Only reached inside `guide.trustMark.state === "Verified"`. The server has already ' +
      'asserted the state; this names the badge for a verification that exists, rather than ' +
      'inventing one.',
  },
];

describe('no screen invents a rating, a score, a coordinate or a trust label', () => {
  const NEWLINE = String.fromCharCode(10);
  it('finds no fallback literal that reads as a measurement', () => {
    const offences: Offence[] = [];

    for (const file of screens(APP_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      const relative = file.slice(APP_ROOT.length + 1).replace(/\\/g, '/');
      const lines = source.split('\n');

      for (const hit of fabrications(source)) {
        const text = lines[hit.line - 1] ?? '';
        const excused = ALLOWED.some(
          (entry) => entry.file === relative && text.includes(entry.fragment),
        );
        if (excused) continue;

        offences.push({
          file: file.slice(APP_ROOT.length + 1).replace(/\\/g, '/'),
          line: hit.line,
          source: hit.text,
        });
      }
    }

    const report = offences.map((o) => `  app/${o.file}:${o.line}   ${o.source}`).join('\n');

    expect(
      offences.length === 0
        ? ''
        : `${offences.length} fallback literal(s) that a reader would take for data.\n` +
            `A rating, score, coordinate or trust word supplied by \`||\`/\`??\` is a claim ` +
            `the platform did not make.\nRender what the response carries, or render nothing.` +
            `\n\n${report}`,
    ).toBe('');
  });

  it('detects the two shapes it is meant to detect', () => {
    // A guard that cannot fail proves nothing. These are the real lines.
    expect(fabrications('<Text>{org.rating || 4.7} / 5.0</Text>')).toHaveLength(1);
    expect(fabrications("<Text>{org.reputationLevel || 'Highly Trusted'}</Text>")).toHaveLength(1);
    expect(fabrications('<Text>Lat: {event.location.latitude || 51.5}</Text>')).toHaveLength(1);
  });

  it('keeps line numbers pointing at the original file', () => {
    // The allow-list matches on the raw text of the reported line, so a shift
    // introduced by comment stripping would both misreport the location and
    // silently stop excusing the entry it was written for.
    const source = ['/*', ' * a', ' * long', ' * comment', ' */', "<Text>{x || 4.7}</Text>"].join(NEWLINE);

    expect(fabrications(source)[0].line).toBe(6);
  });

  it('leaves ordinary defaults alone', () => {
    // Counts, lists and labels that assert nothing about anybody.
    expect(fabrications('<Text>{org.statistics?.memberCount ?? 0}</Text>')).toHaveLength(0);
    expect(fabrications("<Text>{org.name ?? 'This organisation'}</Text>")).toHaveLength(0);
    expect(fabrications('const items = data?.items ?? [];')).toHaveLength(0);
  });
});
