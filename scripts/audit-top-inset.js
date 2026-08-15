/**
 * Audits every screen for the top safe area.
 *
 *   node scripts/audit-top-inset.js
 *
 * The companion to `audit-bottom-inset.js`, written after the bottom one was
 * finished and a device capture showed the status-bar clock sitting on top of
 * `country/[code]`'s stats cards. Same enforced edge-to-edge, same consequence,
 * opposite edge — and nothing was checking it.
 *
 * ── What counts as handled ───────────────────────────────────────────────────
 *
 * A screen is fine if any of these is true:
 *
 *   * its root is a `SafeAreaView` whose `edges` include `'top'`, or which
 *     omits `edges` entirely (the default is all four);
 *   * it renders `ScreenHeader`, `CommunityHeader` or one of the shared screen
 *     wrappers, all of which sit inside a `SafeAreaView` themselves;
 *   * it reads `insets.top` and does something with it.
 *
 * ── The failure this is looking for ─────────────────────────────────────────
 *
 * A bare `<View className="flex-1">` root with content straight after it. On a
 * phone with a notch or a tall status bar, the first thing the member sees is
 * the clock printed over the first row of content. `country/[code]` also had a
 * back button at a hardcoded `top-12`, which is one specific phone's status bar
 * height and nobody else's.
 *
 * ── Deliberately not flagged ─────────────────────────────────────────────────
 *
 * Components under `src/components` that are not screens: they render inside a
 * screen that owns the top edge, and giving them the inset too would double it.
 * Same rule as the bottom audit, same reason.
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

/** Headers and wrappers that sit inside a SafeAreaView of their own. */
const OWNS_TOP =
  /<(ScreenHeader|CommunityHeader|CommunityScreen|CreatorScreen|AnalyticsScreen|Stack\.Screen)\b/;

/**
 * Follows a route file that only delegates.
 *
 * Many routes are three lines — `return <CommunityGovernanceScreen kind="rules" />`
 * — and the component they name is what owns the top edge. Judging the route
 * file on its own text reports 30-odd false positives, which is how an audit
 * teaches people to ignore it.
 *
 * One level only. A delegate that itself delegates is rare enough that a false
 * positive there is better than a script that recurses through the tree and
 * quietly finds a `SafeAreaView` three components away that is not the one
 * wrapping this content.
 */
function resolveDelegate(src, fromFile) {
  // Matches both `return <Thing` and a parenthesised, newline-separated
  // `return ( <Thing`, which is the shape most of these routes use.
  const m = src.match(/return\s*\(?\s*<([A-Z][A-Za-z0-9_]*)[\s/>]/);
  if (!m) return null;

  const name = m[1];
  const imp = src.match(
    new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`)
  );
  if (!imp) return null;

  let spec = imp[1];
  if (spec.startsWith('@/')) spec = path.join('src', spec.slice(2));
  else if (spec.startsWith('.')) spec = path.join(path.dirname(fromFile), spec);
  else return null;

  for (const candidate of [spec + '.tsx', path.join(spec, 'index.tsx')]) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }

  // A barrel. `@/components/analytics` is an `index.ts` of re-exports, so the
  // file that owns the top edge is one hop further on. Follow the re-export for
  // this specific name rather than concatenating the whole barrel — a barrel
  // exports a dozen components and any one of their `SafeAreaView`s would
  // wrongly clear all the others.
  const barrel = path.join(spec, 'index.ts');
  if (!fs.existsSync(barrel)) return null;

  const barrelSrc = fs.readFileSync(barrel, 'utf8');
  const reExport = barrelSrc.match(
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`)
  );
  if (!reExport) return null;

  const target = path.join(spec, reExport[1].replace(/^\.\//, ''));
  for (const candidate of [target + '.tsx', path.join(target, 'index.tsx')]) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return null;
}

const rows = [];

for (const file of walk('src/app')) {
  const rel = file.replace(/\\/g, '/');
  if (/_layout\.tsx$/.test(rel)) continue;

  let src = fs.readFileSync(file, 'utf8');

  // `<Redirect>` renders nothing. It has no edges to own.
  if (/<Redirect\b/.test(src)) {
    rows.push({ rel, verdict: 'ok' });
    continue;
  }

  const delegate = resolveDelegate(src, file);
  if (delegate) src = src + '\n' + delegate;

  // A parent `_layout.tsx` can own the top edge for everything beneath it.
  // `(tabs)/knowledge/_layout.tsx` wraps its three children in
  // `<SafeAreaView edges={['top']}>`, so judging those children alone reports
  // three screens that are already correct.
  let dir = path.dirname(file);
  let ownedByLayout = false;
  while (dir.startsWith('src' + path.sep + 'app') || dir === path.join('src', 'app')) {
    const layout = path.join(dir, '_layout.tsx');
    if (fs.existsSync(layout)) {
      const layoutSrc = fs.readFileSync(layout, 'utf8');
      if (/<SafeAreaView/.test(layoutSrc) && !/edges=\{\[(?![^\]]*top)[^\]]*\]\}/.test(layoutSrc)) {
        ownedByLayout = true;
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (ownedByLayout) {
    rows.push({ rel, verdict: 'ok' });
    continue;
  }

  // A screen that sets `<StatusBar style="…" />` is stating what the status bar
  // should look like *over its content*, which only makes sense if it means to
  // draw under it. `(auth)/index.tsx` is the case: a 220pt decorative globe
  // hero with `style="light"`, so the clock sits on artwork and nothing is
  // clipped. That is a design decision, not a missing inset — and a screen that
  // has thought about the status bar hard enough to restyle it has thought
  // about it.
  const deliberateFullBleed = /<StatusBar\b/.test(src);

  const safeAreaCount = (src.match(/<SafeAreaView/g) || []).length;
  if (
    safeAreaCount === 0 &&
    !OWNS_TOP.test(src) &&
    !/insets\.top/.test(src) &&
    !deliberateFullBleed
  ) {
    rows.push({ rel, verdict: 'NO-TOP-HANDLING' });
    continue;
  }

  // A `SafeAreaView` that explicitly lists edges without `'top'` is opting out.
  const edgeLists = [...src.matchAll(/edges=\{\[([^\]]*)\]\}/g)].map((m) => m[1]);
  const everyEdgeListOmitsTop =
    edgeLists.length > 0 &&
    edgeLists.length === safeAreaCount &&
    edgeLists.every((e) => !/top/.test(e));

  if (everyEdgeListOmitsTop && !OWNS_TOP.test(src) && !/insets\.top/.test(src)) {
    rows.push({ rel, verdict: 'OPTS-OUT-OF-TOP' });
    continue;
  }

  // A hardcoded offset standing in for the status bar height — but only where
  // the screen has no top handling at all. `guide/create.tsx` positions an
  // autocomplete dropdown at `top-16` below its input, which is a layout
  // offset and nothing to do with the status bar; flagging it taught nothing
  // except to distrust the audit. `country/[code].tsx` had the same class of
  // expression *and* no `SafeAreaView`, which is what made it the real thing.
  if (
    safeAreaCount === 0 &&
    /className="[^"]*absolute[^"]*top-(1[0-9]|[2-9][0-9])\b/.test(src)
  ) {
    rows.push({ rel, verdict: 'HARDCODED-TOP' });
    continue;
  }

  rows.push({ rel, verdict: 'ok' });
}

const counts = {};
for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

console.log('=== SUMMARY (%d screens) ===', rows.length);
for (const k of ['NO-TOP-HANDLING', 'OPTS-OUT-OF-TOP', 'HARDCODED-TOP', 'ok']) {
  if (counts[k]) console.log('  %s: %d', k.padEnd(18), counts[k]);
}
console.log('');

for (const k of ['NO-TOP-HANDLING', 'OPTS-OUT-OF-TOP', 'HARDCODED-TOP']) {
  const group = rows.filter((r) => r.verdict === k);
  if (!group.length) continue;
  console.log('=== %s (%d) ===', k, group.length);
  for (const r of group) console.log('  %s', r.rel.replace('src/app/', ''));
  console.log('');
}

process.exitCode = rows.some((r) => r.verdict !== 'ok') ? 1 : 0;
