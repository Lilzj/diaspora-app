// ─────────────────────────────────────────────────────────────────────────────
// Does every eligible stack screen raise the shared navigation bar?
//
//   node scripts/audit-scroll-end-nav.js
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// §2 asked for end-of-scroll navigation to be standardized. It was reported as
// standardized after `CommunityScreen`, `CreatorScreen` and `AnalyticsScreen`
// were switched to `ScrollEndScrollView`, which reached 57 screens at once and
// felt systemic.
//
// It was systemic *for screens inside those wrappers*. Nothing outside them was
// ever measured, and 81 eligible screens were left — found only when a member
// opened `/profile/reputation`, scrolled to the bottom, and noticed. A claim of
// coverage that nothing checks is a claim that decays silently, which is what
// the two inset audits beside this file exist to prevent for their own rules.
//
// ── The rule ─────────────────────────────────────────────────────────────────
//
// From `Frontend-Navigation-SafeArea-Consistency-Report.md` §2, and it is the
// one the codebase was already following before anybody wrote it down:
//
//   A stack screen a member arrives at and stops on raises the shared
//   navigation bar at the end of its content. A screen that pins its own
//   footer does not — a submit button and a navigation bar competing for the
//   same band is worse than either alone.
//
// Exits 1 if an eligible screen does not.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOT = 'src/app';

// Wrappers that already own the behaviour for every screen they back.
const WRAPPERS = ['CommunityScreen', 'CreatorScreen', 'AnalyticsScreen'];

// Excluded by the rule: forms and flows, auth, the map, and messaging — all of
// which either pin their own controls or are passed through rather than stopped
// on.
const EXCLUDE_PATH = /(\(auth\)|\(tabs\)|create|conversation|messages|\bmap\b)/;

// Named exclusions, each with the reason, so that "why is this not in the list"
// is answerable without re-deriving it.
const ALLOWED = {
  'automation/history.tsx':
    'a paginating virtualized FlashList — the end of content moves as you reach it',
  'verification/diaspora.tsx':
    'a verification wizard; its only list is a country picker inside a Modal',
  'wallet/add-money.tsx': 'payment flow — pins a PaymentConfirmButton',
  'wallet/rewards/convert.tsx': 'payment flow — pins a PaymentConfirmButton',
  'wallet/withdraw.tsx': 'payment flow — pins a PaymentConfirmButton',
};

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.tsx')) files.push(p.split(path.sep).join('/'));
  }
})(ROOT);

const violations = [];
const excused = [];
let raising = 0;

for (const file of files) {
  if (file.endsWith('_layout.tsx')) continue;
  if (EXCLUDE_PATH.test(file)) continue;

  const src = fs.readFileSync(file, 'utf8');
  if (/<Redirect/.test(src)) continue;

  const short = file.replace('src/app/', '');

  // Counted before the "does it scroll at all" gate below, because
  // `<ScrollEndScrollView` does not match `<ScrollView` — testing for a
  // scroller first would skip every screen this audit is meant to be
  // confirming, and report a coverage number far lower than the truth. Which
  // is the same shape of mistake as the report this audit was written to stop
  // repeating.
  if (/ScrollEndScrollView|ScrollEndFlatList/.test(src)) {
    raising += 1;
    continue;
  }
  if (WRAPPERS.some((w) => new RegExp('<' + w).test(src))) {
    raising += 1;
    continue;
  }

  if (!/<ScrollView|<FlatList|<SectionList|<FlashList/.test(src)) continue;
  // A pinned footer is the tell that something else claims the bottom band.
  if (/FloatingFooter|footer=\{|PaymentConfirmButton|absolute[^"']*bottom-/.test(src)) {
    excused.push([short, 'pins its own footer']);
    continue;
  }
  if (ALLOWED[short]) {
    excused.push([short, ALLOWED[short]]);
    continue;
  }

  violations.push(short);
}

console.log('');
console.log('=== SCROLL-END NAVIGATION ===');
console.log('');
console.log('  raising the bar   : ' + raising);
console.log('  excused           : ' + excused.length);
console.log('  VIOLATION         : ' + violations.length);

if (excused.length) {
  console.log('');
  console.log('=== excused ===');
  excused.forEach(([f, why]) => console.log('  ' + f.padEnd(40) + why));
}

if (violations.length) {
  console.log('');
  console.log('=== VIOLATION — eligible and not raising the bar ===');
  console.log('');
  violations.forEach((f) => console.log('  ' + f));
  console.log('');
  console.log('  Swap the screen\'s body scroller for ScrollEndScrollView, or');
  console.log('  ScrollEndFlatList for a list, and drop the \'bottom\' safe-area');
  console.log('  edge — the bar renders inside the scroll container, so a bottom');
  console.log('  inset leaves dead space beneath it.');
  console.log('');
  process.exit(1);
}

console.log('');
process.exit(0);
