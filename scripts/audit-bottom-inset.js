/**
 * Audits every route file for the bottom-inset invariant:
 *
 *   A screen whose root does not reserve the bottom safe-area inset must have a
 *   scroll container that reserves it in contentContainerStyle.
 *
 * Emits a table of violations, grouped by how the screen fails.
 *
 *   node scripts/audit-bottom-inset.js src/app
 *
 * Written for the post-APK stabilization pass, where it found 34 screens
 * reserving nothing below their content. Kept because the failure it catches is
 * invisible in review — a screen with no `contentContainerStyle` looks like a
 * screen that does not need one.
 *
 * ── What it cannot see ───────────────────────────────────────────────────────
 *
 * It reads one file at a time, so a screen that renders inside a shared
 * container which owns the inset looks like a violation. `CreatorScreen`,
 * `CommunityScreen` and `AnalyticsScreen` are recognised by name below; a new
 * wrapper has to be added to that list or its screens will be reported falsely.
 * That is exactly what happened on the first run — nine `creator/*` screens were
 * flagged and none of them was broken.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || 'src/app';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const rows = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/');

  if (/_layout\.tsx$/.test(rel)) continue;

  // --- What does the root reserve? ---
  const usesSafeAreaView = /<SafeAreaView/.test(src);
  const edgesMatches = [...src.matchAll(/edges=\{\[([^\]]*)\]\}/g)].map((m) => m[1]);
  // A SafeAreaView with no edges prop defaults to all edges (bottom included).
  const safeAreaCount = (src.match(/<SafeAreaView/g) || []).length;
  const edgesCount = edgesMatches.length;
  const hasImplicitAllEdges = usesSafeAreaView && edgesCount < safeAreaCount;
  const anyEdgesIncludesBottom = edgesMatches.some((e) => /bottom/.test(e));
  const rootReservesBottom = hasImplicitAllEdges || anyEdgesIncludesBottom;

  // --- Does it use a canonical container? ---
  const usesScrollEnd = /ScrollEndScrollView|ScrollEndNavigationMenu/.test(src);
  const usesKeyboardAware = /KeyboardAwareScrollView/.test(src);
  const usesScreenScroll = /ScreenScrollView|useBottomInset|navContentInset/.test(src);
  // Shared screen containers that own the inset on their children's behalf.
  const usesWrapper = /<(CreatorScreen|CommunityScreen|AnalyticsScreen)\b/.test(src);
  const canonical = usesScrollEnd || usesKeyboardAware || usesScreenScroll || usesWrapper;

  // --- Scroll containers present? ---
  const scrollers = [];
  if (/<ScrollView/.test(src)) scrollers.push('ScrollView');
  if (/<FlatList/.test(src)) scrollers.push('FlatList');
  if (/<FlashList/.test(src)) scrollers.push('FlashList');
  if (/<SectionList/.test(src)) scrollers.push('SectionList');
  const hasScroller = scrollers.length > 0;

  // --- Does any scroll container reserve bottom padding? ---
  const insetAware = /paddingBottom:\s*(insets\.bottom|.*insets\.bottom)/.test(src);
  const hardCoded = [...src.matchAll(/paddingBottom:\s*(\d+)/g)].map((m) => Number(m[1]));
  const pbClass = [...src.matchAll(/\bpb-(\d+)\b/g)].map((m) => Number(m[1]) * 4);
  const maxReserve = Math.max(0, ...hardCoded, ...pbClass);

  // --- Floating / absolutely pinned footer? ---
  const floatingFooter =
    /className="[^"]*absolute[^"]*bottom-/.test(src) ||
    /position:\s*'absolute'[\s\S]{0,200}bottom:\s*\d/.test(src);

  if (!hasScroller) continue;

  let verdict = 'ok';
  let detail = '';

  if (canonical) {
    verdict = 'canonical';
    detail = usesScrollEnd ? 'ScrollEndScrollView' : usesKeyboardAware ? 'KeyboardAware' : 'inset-hook';
  } else if (rootReservesBottom) {
    verdict = 'root-bottom';
    detail = 'SafeAreaView reserves bottom';
    if (floatingFooter && maxReserve < 96) {
      verdict = 'RISK';
      detail = `floating footer, list reserves only ${maxReserve}`;
    }
  } else if (insetAware) {
    verdict = 'inset-aware';
    detail = 'scroll container uses insets.bottom';
  } else if (maxReserve === 0) {
    verdict = 'VIOLATION';
    detail = 'no bottom edge, no bottom padding at all';
  } else if (maxReserve < 48) {
    verdict = 'VIOLATION';
    detail = `no bottom edge, only ${maxReserve}pt reserved`;
  } else {
    verdict = 'WEAK';
    detail = `hard-coded ${maxReserve}pt, not inset-aware`;
  }

  rows.push({ rel, verdict, detail, scrollers: scrollers.join('+'), floatingFooter });
}

const order = ['VIOLATION', 'RISK', 'WEAK', 'inset-aware', 'root-bottom', 'canonical'];
const counts = {};
for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

console.log('=== SUMMARY (%d scrollable route files) ===', rows.length);
for (const k of order) if (counts[k]) console.log('  %s: %d', k.padEnd(12), counts[k]);
console.log('');

for (const k of ['VIOLATION', 'RISK', 'WEAK']) {
  const group = rows.filter((r) => r.verdict === k);
  if (!group.length) continue;
  console.log('=== %s (%d) ===', k, group.length);
  for (const r of group) {
    console.log('  %s  [%s]%s  — %s', r.rel.replace('src/app/', ''), r.scrollers, r.floatingFooter ? ' +float' : '', r.detail);
  }
  console.log('');
}
