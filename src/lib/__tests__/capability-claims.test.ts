// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — nothing is announced as done that was not done
//
// ── The defect this exists for (FBL-007) ────────────────────────────────────
//
// `conversation/[id].tsx` handed the attachment picker this callback:
//
//     onImageSelected={(uri) => {
//       setAttachmentPickerVisible(false);
//       showAlert({ type: 'success', title: 'Image Selected',
//                   message: 'Image will be sent in the full release.' });
//     }}
//
// The member granted camera or photo-library access, took or chose a picture,
// and `uri` was dropped on the floor under a green banner. Nothing was uploaded
// and nothing reached the conversation.
//
// FBL-007's own enumeration missed this one. It named the surfaces that label
// themselves honestly — "Location sharing coming soon!", "(Feature details
// coming soon)", the two dimmed `Coming Soon` rows on the security screen — and
// classified them, correctly, as acceptable. Those tell the member *before*
// they invest anything. This one told them *after*, in the colour reserved for
// things that worked.
//
// ── What the rule is, and why it is this one ────────────────────────────────
//
// Not "no deferral copy": labelled incompleteness is the right pattern and this
// repository uses it well. Not "no success alerts": there are 94 of them and
// almost all are honest. The checkable class is the **contradiction** — an
// alert or toast styled `success` whose own words say the thing has not
// happened. That rule needs no list of screens and holds for ones not yet
// written.
//
// It found a second site on its first run: `creator/verification.tsx` answered
// "can I apply now?" with a green `success` alert titled "Not yet". Same shape,
// different feature, and the author of either would have had no way to notice.
// ─────────────────────────────────────────────────────────────────────────────

// Required locally with narrow signatures, as the sibling suites do: adding
// `"node"` to `types` in `tsconfig.json` makes `@types/node` shadow the ambient
// React Native `globalThis` and breaks twenty boundary assertions.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const readdirSync: (path: string, options: object) => Array<{
  name: string;
  isDirectory: () => boolean;
}> = require('fs').readdirSync;
const join: (...parts: string[]) => string = require('path').join;
const relative: (from: string, to: string) => string = require('path').relative;

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SCREENS = join(REPO_ROOT, 'src', 'app');
const COMPONENTS = join(REPO_ROOT, 'src', 'components');

/** The two channels that reach the member. Nothing here uses `Alert.alert`. */
const ANNOUNCEMENT = /\bshow(?:Alert|Toast)\s*\(/g;

/** The colour that means "it worked". */
const SUCCESS = /type:\s*'success'/;

/** The member's own words for "it did not happen". */
const NOT_HAPPENED =
  /coming soon|full release|not yet|in a future release|available soon|is ?n[o']t available|is not available/i;

/**
 * The file with its comments removed, whitespace collapsed.
 *
 * The same helper, and the same reason, as `security-claims.test.ts`: the first
 * version of that suite failed on the comment explaining the defect it was
 * written for. A rule that forbids *describing* a defect makes every file that
 * documents one unfixable, and this file quotes the offending call verbatim at
 * the top. Block comments first — that also removes any `//` inside them — then
 * line comments, which run to a newline, so both must precede the collapse.
 */
function visibleCopy(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');
}

function sourceFilesUnder(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...sourceFilesUnder(path));
      continue;
    }

    if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) found.push(path);
  }

  return found;
}

/**
 * The *claim* each `showAlert(…)` / `showToast(…)` makes: its `type`, `title`
 * and `message`, and nothing else.
 *
 * Bounded at whichever comes first, the object literal's `})` or its
 * `buttons:`. Both bounds are load-bearing and the first run proved it.
 *
 * `buttons:` — a button label is an action the member may take, not a statement
 * about what happened. `community-life/series/[id].tsx` asks *"Publish this
 * series?"* with a `Not yet` cancel button and, once they confirm, announces
 * success. Scanning the labels read that as a success alert saying "not yet".
 *
 * `})` — alerts nest. The confirm button above opens a second `showAlert` from
 * inside the first, so an unbounded slice swallowed the inner call's
 * `type: 'success'` and attributed it to the outer question. Each call is
 * matched separately and judged on its own region.
 *
 * Where a call puts `buttons:` before its `message:` the region is short and
 * the message goes unscanned. That is a miss, never a false accusation, which
 * is the right direction for a rule that names files in its failure output.
 */
function claims(source: string): string[] {
  const found: string[] = [];

  ANNOUNCEMENT.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANNOUNCEMENT.exec(source)) !== null) {
    const bounds = [source.indexOf('})', match.index), source.indexOf('buttons:', match.index)]
      .filter((at) => at !== -1);

    const end = bounds.length > 0 ? Math.min(...bounds) : match.index + 400;

    found.push(source.slice(match.index, end));
  }

  return found;
}

describe('nothing is announced as done that was not done', () => {
  const files = [...sourceFilesUnder(SCREENS), ...sourceFilesUnder(COMPONENTS)];
  const calls = files.flatMap((file) =>
    claims(visibleCopy(file)).map((call) => ({ file, call }))
  );

  it('found files to check', () => {
    // A scan that matched nothing would pass this suite for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
  });

  it('found success announcements to check', () => {
    // And the rule below is only meaningful if the slicing above actually
    // recognises the construct. Without this, a broken `announcements()` would
    // make the real assertion pass on an empty list — proof of nothing, which
    // is the failure mode the backend's own empty-table rule exists for.
    const successes = calls.filter(({ call }) => SUCCESS.test(call));

    expect(successes.length).toBeGreaterThan(20);
  });

  it('no success alert or toast says the thing has not happened', () => {
    const offences = calls
      .filter(({ call }) => SUCCESS.test(call) && NOT_HAPPENED.test(call))
      .map(({ file, call }) => `${relative(REPO_ROOT, file)}: ${call.trim()}`);

    expect(offences).toEqual([]);
  });
});

describe('the conversation screen does not announce a photo it discards', () => {
  const SCREEN = join(SCREENS, 'conversation', '[id].tsx');
  const source = visibleCopy(SCREEN);

  it('still handles a chosen image', () => {
    // If the picker stops being wired at all this suite is guarding nothing and
    // should be re-read rather than left running green.
    expect(source).toContain('onImageSelected');
  });

  it('tells the member the photo was not sent', () => {
    expect(source).toContain('Not sent');
  });

  it('does not promise a later release', () => {
    // The original copy blamed a capability the server already has:
    // `SendMessageRequest.attachment` carries a `mediaAssetId`, and the
    // deployment serves GET /conversations/{id}/media. What is missing is this
    // client's upload-then-send wiring.
    expect(source).not.toMatch(NOT_HAPPENED);
  });
});
