/**
 * Audits every screen and overlay for the bottom guard rail.
 *
 *   node scripts/audit-bottom-inset.js
 *
 * The invariant: whatever scrolls, or whatever sits at the bottom of a sheet,
 * must reserve room for the phone's navigation area. On Android 15 the system
 * bars draw over the app — `dumpsys window displays` reports
 * `nonDecorInsets` bottom = 0 — so nothing is reserved on the app's behalf.
 *
 * ── The false negative this version removes ──────────────────────────────────
 *
 * The first version asked "does the root reserve the bottom edge?" and answered
 * it by looking for a `<SafeAreaView>` anywhere in the file with no `edges`
 * prop. `app/country/[code].tsx` has exactly that — in its *error* branch:
 *
 *     if (!stats) return <SafeAreaView className="…">Not found</SafeAreaView>;
 *     …
 *     return (
 *       <View className="flex-1">          ← the real root, no safe area
 *         <ScrollView className="flex-1">  ← no contentContainerStyle
 *
 * so the file was reported clean while its content scrolled under the
 * navigation bar. It took a photograph of a real phone to catch it.
 *
 * This version does not try to reason about roots at all. It asks one question
 * per scroll container — *is there a bottom reserve that derives from the
 * inset?* — and treats anything else as a violation. That over-reports the
 * handful of screens whose `SafeAreaView` genuinely wraps everything with
 * `edges` including `'bottom'`; those are listed separately as `root-bottom`
 * rather than hidden, so they can be eyeballed rather than assumed.
 */
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Opening-tag span for `<Name …>`, brace- and quote-aware. */
function findTag(src, name, from = 0) {
  const re = new RegExp('<' + name + '(?=[\\s/>])', 'g');
  re.lastIndex = from;
  const m = re.exec(src);
  if (!m) return null;

  let i = m.index + m[0].length;
  let depth = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return { start: m.index, end: i, attrs: src.slice(m.index, i) };
    i++;
  }
  return null;
}

/** Every non-horizontal scroll container in the file. */
function verticalScrollers(src) {
  const out = [];
  for (const name of ['ScrollView', 'FlatList', 'FlashList', 'SectionList']) {
    let from = 0;
    for (;;) {
      const tag = findTag(src, name, from);
      if (!tag) break;
      from = tag.end;
      if (/\bhorizontal\b/.test(tag.attrs)) continue;
      // An inner pane (a modal body capped by `max-h-`) is reserved by its
      // container, not by itself.
      if (/className="[^"]*max-h-/.test(tag.attrs)) continue;
      out.push({ ...tag, name });
    }
  }
  return out;
}

const CANONICAL = /ScrollEndScrollView|KeyboardAwareScrollView|useBottomInset|ScreenScrollView|navContentInset|useSheetInset/;
const WRAPPERS = /<(CreatorScreen|CommunityScreen|AnalyticsScreen)\b/;

const rows = [];

for (const file of [...walk('src/app'), ...walk('src/components')]) {
  const rel = file.replace(/\\/g, '/');
  if (/_layout\.tsx$/.test(rel)) continue;

  const src = fs.readFileSync(file, 'utf8');
  const scrollers = verticalScrollers(src);
  const isOverlay = /<Modal\b/.test(src);
  if (!scrollers.length && !isOverlay) continue;

  // A component under `src/components` that is not itself an overlay is
  // rendered *inside* a screen or a sheet, and that parent owns the bottom
  // edge. A chart, a suggestion list, a map result list — none of them know
  // where the bottom of the window is, and none of them should.
  //
  // Skipping them is not a shortcut: giving them the inset too is how a screen
  // ends up reserving it twice and showing a band of dead space. Only overlays
  // are judged here, because an overlay *is* its own window.
  if (rel.startsWith('src/components/') && !isOverlay) continue;

  const canonical = CANONICAL.test(src);
  const wrapped = WRAPPERS.test(src);
  const insetAware = /insets\.bottom/.test(src);
  const rootBottom = /edges=\{\[[^\]]*'bottom'/.test(src);

  // Overlays are judged on the window flags as well: without them the modal's
  // window behaviour differs from the app's, and the inset it pads by is the
  // app window's.
  const translucent = /statusBarTranslucent/.test(src);

  // A centred dialog never reaches the navigation bar — it is `justify-center`
  // with a `max-w-*` card, floating clear of both edges. Padding one would open
  // a gap under its buttons for no reason, so an overlay that has no
  // bottom-anchored container is exempt rather than unfixed.
  const bottomAnchored = /rounded-t-|justify-end/.test(src);
  const centredDialogOnly = isOverlay && !bottomAnchored;

  let verdict;
  if (canonical || wrapped) verdict = 'canonical';
  else if (centredDialogOnly) verdict = 'centred-dialog';
  else if (isOverlay && !translucent) verdict = insetAware ? 'OVERLAY-NO-FLAGS' : 'OVERLAY-BARE';
  else if (insetAware) verdict = 'inset-aware';
  else if (rootBottom) verdict = 'root-bottom';
  else verdict = 'VIOLATION';

  rows.push({ rel, verdict, scrollers: scrollers.length, isOverlay });
}

const counts = {};
for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

console.log('=== SUMMARY (%d files) ===', rows.length);
for (const k of ['VIOLATION', 'OVERLAY-BARE', 'OVERLAY-NO-FLAGS', 'root-bottom', 'centred-dialog', 'inset-aware', 'canonical']) {
  if (counts[k]) console.log('  %s: %d', k.padEnd(18), counts[k]);
}
console.log('');

for (const k of ['VIOLATION', 'OVERLAY-BARE', 'OVERLAY-NO-FLAGS', 'root-bottom']) {
  const group = rows.filter((r) => r.verdict === k);
  if (!group.length) continue;
  console.log('=== %s (%d) ===', k, group.length);
  for (const r of group) console.log('  %s', r.rel.replace('src/', ''));
  console.log('');
}

const bad = rows.filter((r) => /^(VIOLATION|OVERLAY)/.test(r.verdict)).length;
process.exitCode = bad ? 1 : 0;
