// ─────────────────────────────────────────────────────────────────────────────
// Does every Modal reach both edges of the screen?
//
//   node scripts/audit-modal-edges.js
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// On Android a `<Modal>` is its own window. Without `statusBarTranslucent` it
// stops below the status bar; without `navigationBarTranslucent` it stops above
// the navigation bar. Either way the dimmed app shows through in a band, and
// the sheet looks like it is floating rather than anchored.
//
// The status-bar half was found and fixed across 34 modals in an earlier pass.
// The navigation-bar half was not — including in `overlays/AppModal`, the
// shared primitive every sheet in the app goes through, so *every* sheet had a
// strip of dimmed app beneath it. Reported from a device: the location picker,
// the language picker and the badge sheet.
//
// One flag missing from one file is not worth an audit. The same flag missing
// from a primitive that 48 call sites were consolidated onto is, because
// nothing about the consolidation guaranteed the primitive was right.
//
// Exits 1 if a transparent Modal is missing either flag.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const ROOTS = ['src/app', 'src/components'];

const files = [];
for (const root of ROOTS) {
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.tsx')) files.push(p.split(path.sep).join('/'));
    }
  })(root);
}

const violations = [];
let ok = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');

  // Each `<Modal … >` opening tag, with brace-depth counting because props are
  // `{…}` expressions that contain `>`.
  for (const m of src.matchAll(/<Modal\b/g)) {
    let i = m.index + 6;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    const attrs = src.slice(m.index, i);

    // A non-transparent Modal is a full-screen page and owns both bars itself.
    if (!/\btransparent\b/.test(attrs)) continue;
    // Spread props may carry the flags; SHEET_MODAL_PROPS does.
    if (/\{\.\.\./.test(attrs)) {
      ok += 1;
      continue;
    }

    const missing = [];
    if (!/statusBarTranslucent/.test(attrs)) missing.push('statusBarTranslucent');
    if (!/navigationBarTranslucent/.test(attrs)) missing.push('navigationBarTranslucent');

    if (missing.length) {
      violations.push([file.replace('src/', ''), missing.join(' + ')]);
    } else {
      ok += 1;
    }
  }
}

console.log('');
console.log('=== MODAL EDGES ===');
console.log('');
console.log('  reaching both edges : ' + ok);
console.log('  VIOLATION           : ' + violations.length);

if (violations.length) {
  console.log('');
  console.log('=== VIOLATION — a transparent Modal missing an edge flag ===');
  console.log('');
  violations.forEach(([f, why]) => console.log('  ' + f.padEnd(58) + 'missing ' + why));
  console.log('');
  console.log('  Prefer `Sheet`/`AppModal` from components/overlays, which set both.');
  console.log('  A hand-rolled Modal can spread SHEET_MODAL_PROPS from');
  console.log('  components/layout/bottom-inset instead.');
  console.log('');
  process.exit(1);
}

console.log('');
process.exit(0);
