#!/usr/bin/env node
/**
 * Diaspora Platform — how one list scrolls, on a device (FARCH-004)
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * FARCH-004 moved every list that pages to FlashList and memoised the list
 * cards. The audit's first step was "measure first": nobody had a number for
 * how a long list scrolls on a mid-range Android phone, and without one a claim
 * about jank either way is speculation. This measures the same scroll, the same
 * way, on two builds: master before the change, and the branch after it.
 *
 * ── What it measures ─────────────────────────────────────────────────────────
 *
 * Android's own frame statistics for the app (`dumpsys gfxinfo`) over a fixed
 * run of swipes, and the app's memory (`dumpsys meminfo`) once they are done.
 * Nothing is added to the app: no code ships for this, and both builds are
 * measured identically.
 *
 * ── It checks the instrument before it reports ───────────────────────────────
 *
 * The rule of `runtime-validation/device/harness.mjs`: a measurement that
 * quietly reads zero is worse than none. So this refuses to report when no
 * device is attached, when the app is not the window in front, when the frame
 * counter did not reset, or when the swipes drew too few frames to have
 * scrolled anything. Each of those would otherwise read as a perfectly smooth
 * list.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/profile-list-scroll.js measure --label discover-providers-after-1
 *        [--swipes 20] [--out list-profiles]
 *   node scripts/profile-list-scroll.js compare list-profiles/<before>.json list-profiles/<after>.json
 *
 * Open the screen and load its pages first; `measure` scrolls what is in front.
 * The plan this belongs to (which builds, which phone, which screens, how many
 * runs) is in the pull request that added this script: documentation is not
 * committed in this repository.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGE = process.env.PROFILE_PACKAGE || 'com.diaspora.app';

/** A frame drawn per swipe, at the least, for a swipe that scrolled anything at all. */
const MIN_FRAMES_PER_SWIPE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Reading what Android prints
// ─────────────────────────────────────────────────────────────────────────────

/** The first number after `label:` at the start of a line, or null. */
function field(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp('^\\s*' + escaped + ':\\s*(\\d+(?:\\.\\d+)?)', 'm'));
  return match ? Number(match[1]) : null;
}

/**
 * The app's frame statistics since the last reset.
 *
 * `Janky frames:` is read and `Janky frames (legacy):` is not, and the plain
 * percentiles are read rather than the GPU ones printed below them.
 */
function parseGfxinfo(text) {
  const janky = text.match(/^\s*Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/m);
  return {
    totalFrames: field(text, 'Total frames rendered'),
    jankyFrames: janky ? Number(janky[1]) : null,
    jankyPercent: janky ? Number(janky[2]) : null,
    p50Ms: percentile(text, 50),
    p90Ms: percentile(text, 90),
    p95Ms: percentile(text, 95),
    p99Ms: percentile(text, 99),
    missedVsync: field(text, 'Number Missed Vsync'),
    slowUiThread: field(text, 'Number Slow UI thread'),
    slowBitmapUploads: field(text, 'Number Slow bitmap uploads'),
    slowDrawCommands: field(text, 'Number Slow issue draw commands'),
    frameDeadlineMissed: field(text, 'Number Frame deadline missed'),
  };
}

function percentile(text, which) {
  const match = text.match(new RegExp('^\\s*' + which + 'th percentile:\\s*(\\d+)ms', 'm'));
  return match ? Number(match[1]) : null;
}

/** The app's memory, from the App Summary, in kilobytes. */
function parseMeminfo(text) {
  const totalPss = field(text, 'TOTAL PSS');
  const tableTotal = text.match(/^\s*TOTAL\s+(\d+)/m);
  return {
    totalPssKb: totalPss ?? (tableTotal ? Number(tableTotal[1]) : null),
    javaHeapKb: field(text, 'Java Heap'),
    nativeHeapKb: field(text, 'Native Heap'),
    graphicsKb: field(text, 'Graphics'),
  };
}

/** `wm size`: the override where there is one, since that is what the app draws at. */
function parseScreenSize(text) {
  const override = text.match(/Override size:\s*(\d+)x(\d+)/);
  const physical = text.match(/Physical size:\s*(\d+)x(\d+)/);
  const size = override || physical;
  return size ? { width: Number(size[1]), height: Number(size[2]) } : null;
}

/** Whether the app's window is the one in front, from `dumpsys window`. */
function isFocused(windowDump, pkg = PACKAGE) {
  return windowDump
    .split('\n')
    .some((line) => /mCurrentFocus|mFocusedApp|mFocusedWindow/.test(line) && line.includes(pkg));
}

/** Why two profiles cannot be compared, if they cannot. */
function incomparable(before, after) {
  const reasons = [];
  if (before.device.model !== after.device.model) reasons.push(`different devices: ${before.device.model} and ${after.device.model}`);
  if (before.device.android !== after.device.android) reasons.push(`different Android versions: ${before.device.android} and ${after.device.android}`);
  if (before.swipes !== after.swipes) reasons.push(`different swipe counts: ${before.swipes} and ${after.swipes}`);
  return reasons;
}

/** One line per measure: before, after, and the change. */
function comparison(before, after) {
  const rows = [
    ['frames rendered', 'gfx', 'totalFrames', ''],
    ['janky frames', 'gfx', 'jankyPercent', '%'],
    ['frame time p50', 'gfx', 'p50Ms', 'ms'],
    ['frame time p90', 'gfx', 'p90Ms', 'ms'],
    ['frame time p95', 'gfx', 'p95Ms', 'ms'],
    ['frame time p99', 'gfx', 'p99Ms', 'ms'],
    ['slow UI thread', 'gfx', 'slowUiThread', ''],
    ['frame deadline missed', 'gfx', 'frameDeadlineMissed', ''],
    ['memory, total PSS', 'memory', 'totalPssKb', ' KB'],
    ['memory, graphics', 'memory', 'graphicsKb', ' KB'],
    ['memory, native heap', 'memory', 'nativeHeapKb', ' KB'],
  ];
  return rows.map(([name, group, key, unit]) => {
    const a = before[group][key];
    const b = after[group][key];
    const change = a === null || b === null ? 'n/a' : `${b - a >= 0 ? '+' : ''}${round(b - a)}${unit}`;
    return { name, before: a === null ? 'n/a' : `${a}${unit}`, after: b === null ? 'n/a' : `${b}${unit}`, change };
  });
}

const round = (value) => Math.round(value * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Talking to the device
// ─────────────────────────────────────────────────────────────────────────────

function adb(args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function refuse(step, detail) {
  console.error(`REFUSED  ${step}`);
  console.error(`         ${detail}`);
  console.error('         Nothing was measured. Fix the above and run it again.');
  process.exit(2);
}

function argument(argv, name, fallback) {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

function measure(argv) {
  const label = argument(argv, 'label', null);
  const swipes = Number(argument(argv, 'swipes', '20'));
  const out = argument(argv, 'out', 'list-profiles');
  if (!label || !/^[\w.-]+$/.test(label)) refuse('a label', 'Pass --label, letters, digits, dots and dashes only.');
  if (!Number.isInteger(swipes) || swipes < 4) refuse('a swipe count', '--swipes must be a whole number, 4 or more.');

  // ── 1. A device, booted ────────────────────────────────────────────────────
  let devices = '';
  try {
    devices = adb(['devices']);
  } catch (cause) {
    refuse('adb', `adb did not run: ${cause.message}`);
  }
  const attached = devices.split('\n').slice(1).filter((line) => line.trim().endsWith('device'));
  if (attached.length !== 1) refuse('one device attached', `adb lists ${attached.length}. Attach exactly one.`);
  if (adb(['shell', 'getprop', 'sys.boot_completed']).trim() !== '1') refuse('the device has booted', 'sys.boot_completed is not 1.');

  // ── 2. The app, in front ───────────────────────────────────────────────────
  if (!adb(['shell', 'pidof', PACKAGE]).trim()) refuse('the app is running', `${PACKAGE} has no process.`);
  if (!isFocused(adb(['shell', 'dumpsys', 'window']))) {
    refuse('the app is in front', `${PACKAGE} is not the focused window: the swipes would scroll something else.`);
  }

  const size = parseScreenSize(adb(['shell', 'wm', 'size']));
  if (!size) refuse('the screen size', '`wm size` printed no size.');

  // ── 3. The frame counter, reset ────────────────────────────────────────────
  adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE, 'reset']);
  const afterReset = parseGfxinfo(adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE]));
  if (afterReset.totalFrames === null) refuse('the frame counter', 'gfxinfo printed no "Total frames rendered".');
  if (afterReset.totalFrames > 10) {
    refuse('the frame counter reset', `${afterReset.totalFrames} frames counted right after the reset: something is animating.`);
  }

  // ── 4. The scroll: the same swipes down, then back up ──────────────────────
  const x = String(Math.round(size.width / 2));
  const low = String(Math.round(size.height * 0.75));
  const high = String(Math.round(size.height * 0.3));
  for (let i = 0; i < swipes; i += 1) adb(['shell', 'input', 'swipe', x, low, x, high, '250']);
  for (let i = 0; i < swipes; i += 1) adb(['shell', 'input', 'swipe', x, high, x, low, '250']);

  const gfx = parseGfxinfo(adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE]));
  const floor = swipes * 2 * MIN_FRAMES_PER_SWIPE;
  if (gfx.totalFrames === null || gfx.totalFrames < floor) {
    refuse(
      'the swipes scrolled the list',
      `${gfx.totalFrames ?? 'no'} frames for ${swipes * 2} swipes (at least ${floor} expected). ` +
        'Is the list in front, long enough to scroll, and the screen on?'
    );
  }
  const memory = parseMeminfo(adb(['shell', 'dumpsys', 'meminfo', PACKAGE]));

  const profile = {
    label,
    package: PACKAGE,
    measuredAt: new Date().toISOString(),
    device: {
      model: adb(['shell', 'getprop', 'ro.product.model']).trim(),
      android: adb(['shell', 'getprop', 'ro.build.version.release']).trim(),
      size: `${size.width}x${size.height}`,
    },
    swipes,
    gfx,
    memory,
  };

  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(profile, null, 2) + '\n');
  console.log(
    `${label}: ${gfx.totalFrames} frames, ${gfx.jankyPercent}% janky, p90 ${gfx.p90Ms}ms, ` +
      `p95 ${gfx.p95Ms}ms; PSS ${memory.totalPssKb} KB, graphics ${memory.graphicsKb} KB → ${file}`
  );
}

function compare(argv) {
  const [beforeFile, afterFile] = argv.filter((arg) => arg.endsWith('.json'));
  if (!beforeFile || !afterFile) refuse('two profiles', 'Pass the before profile, then the after profile.');
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  const reasons = incomparable(before, after);
  if (reasons.length) refuse('comparable profiles', reasons.join('; '));

  console.log(`\n  ${before.label}  →  ${after.label}   (${before.device.model}, Android ${before.device.android})\n`);
  for (const row of comparison(before, after)) {
    console.log(`  ${row.name.padEnd(24)}${row.before.padStart(14)}${row.after.padStart(14)}${row.change.padStart(14)}`);
  }
  console.log('');
}

module.exports = { parseGfxinfo, parseMeminfo, parseScreenSize, isFocused, incomparable, comparison };

if (require.main === module) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'measure') measure(rest);
  else if (command === 'compare') compare(rest);
  else {
    console.error('Usage: node scripts/profile-list-scroll.js measure --label <name> [--swipes 20] [--out list-profiles]');
    console.error('       node scripts/profile-list-scroll.js compare <before.json> <after.json>');
    process.exit(2);
  }
}
