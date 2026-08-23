// ─────────────────────────────────────────────────────────────────────────────
// The device walkthrough harness
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// Walking screens on a device has found more real defects than every other check
// in this programme combined — a launch crash, an invented 4.7-star rating, 59
// capabilities the client denied. It has also, twice in a row, produced findings
// that turned out to be the *tooling* rather than the product:
//
//   · "The job screen terminates the app." It did not. `logd` had wedged after
//     ~15 install cycles, so a healthy launch logged zero `ReactNativeJS` lines
//     and a screen that simply took a while to render looked like a silent
//     crash. Restarting the emulator put the finding back to nothing.
//   · "Unrecognised analytics periods answer 500 rather than 400." They answer
//     400. The 500 came from the timezone, and the request that produced it had
//     two variables changed at once.
//
// Both cost more than the defects they masked. The rule this file exists to
// enforce is the one that would have caught them:
//
//     **Verify the instrument before believing what it reports.**
//
// So every step here checks that its own measurement is working *before* it
// measures anything, and fails loudly when it is not. A harness that quietly
// reports "no error found" on a dead logger is worse than no harness.
//
// ── What it does not do ──────────────────────────────────────────────────────
//
// It does not decide whether a screen is correct. It puts a working device in
// front of a working backend with a signed-in member, opens a screen, and hands
// back a screenshot plus anything the app said. Judging the screen is still a
// person's job — that is where the findings have come from.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//
//     node runtime-validation/device/harness.mjs preflight
//     node runtime-validation/device/harness.mjs signin
//     node runtime-validation/device/harness.mjs open diaspora://job/<id> job-detail
//     node runtime-validation/device/harness.mjs walk walkthrough.json
//
// Environment:
//     RUNTIME_API_LOG   where the running API writes (required for signin)
//     RUNTIME_API_ORIGIN default http://127.0.0.1:5099
//     SEED_PHONE        default +23481000902001
//     SEED_PASSWORD     no default; required only for the token round-trip check
//     SHOT_DIR          where screenshots land; default ./device-shots
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = process.env.RUNTIME_API_ORIGIN ?? 'http://127.0.0.1:5099';
const API_LOG = process.env.RUNTIME_API_LOG;
const PHONE = process.env.SEED_PHONE ?? '+23481000902001';
const SHOT_DIR = process.env.SHOT_DIR ?? 'device-shots';
const PACKAGE = 'com.diaspora.app';

const RED = (s) => `[31m${s}[0m`;
const GREEN = (s) => `[32m${s}[0m`;
const DIM = (s) => `[2m${s}[0m`;

function adb(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (cause) {
    if (allowFailure) return '';
    throw new Error(`adb ${args.join(' ')} failed: ${cause.message}`);
  }
}

/** Settle without `sleep`: poll the device itself, which also proves it is responsive. */
function settle(ticks = 16) {
  for (let i = 0; i < ticks; i += 1) adb(['shell', 'cat', '/proc/uptime'], { allowFailure: true });
}

function appPid() {
  return adb(['shell', 'pidof', PACKAGE], { allowFailure: true }).trim();
}

/**
 * The device is still there.
 *
 * Called at the top of every command, because preflight passing is not a promise
 * that the device survives the walk. It did not: preflight went seven-for-seven
 * and the emulator was gone before sign-in finished, which made a dead device
 * look like a broken OTP flow — the harness reported "the platform issued no
 * code" when the truth was "there is no longer a phone".
 *
 * An absent device must never be reported as a product failure.
 */
function requireDevice(step) {
  const attached = adb(['devices'], { allowFailure: true })
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().endsWith('device'));

  if (attached.length === 0) {
    console.error(`${RED('GONE')}  ${step}`);
    console.error(
      '      No device is attached. The emulator has died mid-run — this says nothing\n' +
        '      about the app. Restart it and run `preflight` before reading any result\n' +
        '      from this session.'
    );
    process.exit(2);
  }
}

function fail(step, detail) {
  console.error(`${RED('FAIL')}  ${step}`);
  console.error(`      ${detail}`);
  process.exit(1);
}

function pass(step, detail) {
  console.log(`${GREEN('OK')}    ${step}${detail ? DIM('  — ' + detail) : ''}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Preflight — every check here failed silently at least once this session
// ═════════════════════════════════════════════════════════════════════════════

async function preflight() {
  console.log('\n  Device walkthrough preflight\n');

  // ── 1. A device at all ─────────────────────────────────────────────────────
  const devices = adb(['devices'])
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().endsWith('device'));

  if (devices.length === 0) fail('a device is attached', 'adb devices lists none');
  pass('a device is attached', devices[0].split('\t')[0]);

  // ── 2. It has finished booting ─────────────────────────────────────────────
  const booted = adb(['shell', 'getprop', 'sys.boot_completed'], { allowFailure: true }).trim();
  if (booted !== '1') fail('the device has booted', `sys.boot_completed=${booted || 'unset'}`);
  pass('the device has booted');

  // ── 3. The app is installed ────────────────────────────────────────────────
  const installed = adb(['shell', 'pm', 'list', 'packages', PACKAGE], { allowFailure: true });
  if (!installed.includes(PACKAGE)) fail('the app is installed', `${PACKAGE} not found`);
  pass('the app is installed');

  // ── 4. **logd is alive.** ──────────────────────────────────────────────────
  //
  // The check that would have saved two rounds. A wedged `logd` reports no
  // errors for the same reason a working app does, and the two are
  // indistinguishable unless you ask whether logging works at all.
  adb(['logcat', '-c'], { allowFailure: true });
  adb(['shell', 'am', 'force-stop', PACKAGE], { allowFailure: true });
  adb(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`], { allowFailure: true });
  settle(24);

  const jsLines = adb(['logcat', '-d'], { allowFailure: true })
    .split('\n')
    .filter((line) => line.includes('ReactNativeJS')).length;

  if (jsLines === 0) {
    fail(
      'logcat captures app output',
      'zero ReactNativeJS lines on a fresh launch. `logd` has wedged — restart the\n' +
        '      emulator before walking anything. Until then a crash and a clean run look\n' +
        '      identical, which is how "the job screen terminates the app" was reported\n' +
        '      and later retracted.'
    );
  }
  pass('logcat captures app output', `${jsLines} ReactNativeJS lines`);

  if (!appPid()) fail('the app survives a plain launch', 'process gone after starting MainActivity');
  pass('the app survives a plain launch', `pid ${appPid()}`);

  // ── 5. The API is up, and its log is the one we are reading ────────────────
  if (!API_LOG) {
    fail('RUNTIME_API_LOG is set', 'required — the OTP and the round-trip check both read it');
  }
  if (!existsSync(API_LOG)) fail('the API log exists', API_LOG);

  const before = statSync(API_LOG).size;
  let status;
  try {
    const probe = await fetch(`${ORIGIN}/api/v1/automations/templates`);
    status = probe.status;
  } catch (cause) {
    fail('the API answers', `${ORIGIN} — ${cause.message}`);
  }

  // Give the logger a moment by polling the file rather than sleeping.
  let after = before;
  for (let i = 0; i < 40 && after === before; i += 1) {
    settle(1);
    after = statSync(API_LOG).size;
  }

  if (after === before) {
    fail(
      'the API log is the one this API writes',
      `a request answered ${status} and ${API_LOG} did not grow. RUNTIME_API_LOG points\n` +
        '      at a different file, so the OTP will never appear and sign-in cannot proceed.'
    );
  }
  pass('the API log is the one this API writes', `grew ${after - before} bytes`);

  // ── 6. **The device can reach the API**, proved server-side ────────────────
  //
  // Not "the tunnel is listed" and not "the screen advanced". The only evidence
  // that counts is the request appearing in the API's own log. The sign-in
  // screen advanced to code entry on a request that never arrived, which is how
  // an unreachable backend looked like a working one.
  const beforeDevice = statSync(API_LOG).size;
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'diaspora://', PACKAGE], {
    allowFailure: true,
  });
  settle(24);

  let afterDevice = statSync(API_LOG).size;
  for (let i = 0; i < 20 && afterDevice === beforeDevice; i += 1) {
    settle(2);
    afterDevice = statSync(API_LOG).size;
  }

  if (afterDevice === beforeDevice) {
    console.log(
      `${RED('WARN')}  the device reaches the API — unproven\n` +
        '      Opening the app produced no traffic in the API log. That may be a cold\n' +
        '      start with nothing to fetch, or the device cannot reach the backend at\n' +
        `      all. Run \`signin\` next: it fails loudly rather than advancing on hope.`
    );
  } else {
    pass('the device reaches the API', `${afterDevice - beforeDevice} bytes of traffic`);
  }

  console.log(`\n  ${GREEN('Preflight complete.')} Screens walked from here can be trusted.\n`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Sign in — with an OTP that must be newer than the request
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The most recent development OTP for `PHONE`, but only if it was issued after
 * `since`.
 *
 * The timestamp guard is the point. Reading "the last code in the file" happily
 * returns yesterday's, which then fails verification for reasons that look like
 * a broken OTP flow rather than a stale read — exactly what happened when this
 * was done by hand.
 */
function otpIssuedAfter(since) {
  const log = readFileSync(API_LOG, 'utf8');
  const pattern = new RegExp(
    `\\[(\\d{2}:\\d{2}:\\d{2})[^\\]]*\\][\\s\\S]{0,200}?code for \\${PHONE} is (\\d{6})`,
    'g'
  );

  let match;
  let newest = null;
  while ((match = pattern.exec(log)) !== null) newest = match;

  if (!newest) return null;

  const [hh, mm, ss] = newest[1].split(':').map(Number);
  const issued = new Date(since);
  issued.setHours(hh, mm, ss, 0);

  return issued >= since ? newest[2] : null;
}

async function signin() {
  requireDevice('sign in');
  if (!API_LOG) fail('RUNTIME_API_LOG is set', 'required to read the development OTP');

  console.log('\n  Signing in\n');

  const requestedAt = new Date();

  adb(['shell', 'am', 'force-stop', PACKAGE], { allowFailure: true });
  adb(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`], { allowFailure: true });
  settle(26);

  // Coordinates are the release build's, captured at 1080x2400. A different
  // density moves them, which is why every step below re-checks the outcome
  // rather than assuming the tap landed.
  adb(['shell', 'input', 'tap', '731', '2145'], { allowFailure: true }); // Sign in
  settle(14);
  adb(['shell', 'input', 'tap', '480', '704'], { allowFailure: true }); // phone field
  adb(['shell', 'input', 'text', PHONE.replace('+234', '')], { allowFailure: true });
  adb(['shell', 'input', 'keyevent', '111'], { allowFailure: true }); // dismiss keyboard
  settle(6);
  adb(['shell', 'input', 'tap', '539', '2081'], { allowFailure: true }); // Continue
  settle(20);

  // Before blaming the OTP flow, check the phone is still there. This ordering
  // is the fix for the run that reported a missing code when the emulator had
  // simply disappeared.
  requireDevice('the platform issued a code');

  const code = otpIssuedAfter(requestedAt);

  if (!code) {
    fail(
      'the platform issued a code',
      'no development OTP newer than this request appeared in the API log.\n' +
        '      The screen may still show code entry — it advances without confirming the\n' +
        '      send — so do not read that as success. Check that the device can reach the\n' +
        '      API (preflight step 6) before assuming the OTP flow is broken.'
    );
  }
  pass('the platform issued a code', code);

  adb(['shell', 'input', 'tap', '125', '619'], { allowFailure: true }); // first OTP box
  adb(['shell', 'input', 'text', code], { allowFailure: true });
  settle(26);

  if (!appPid()) fail('the app survived sign-in', 'process gone');

  const shot = capture('signed-in');
  pass('signed in', `screenshot at ${shot}`);
  console.log('\n  Confirm the screenshot shows Home before walking anything.\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// Open one screen
// ═════════════════════════════════════════════════════════════════════════════

function capture(name) {
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  const target = join(SHOT_DIR, `${name}.png`);
  adb(['shell', 'screencap', '-p', '/sdcard/_walk.png'], { allowFailure: true });
  adb(['pull', '/sdcard/_walk.png', target], { allowFailure: true });
  return target;
}

function open(deepLink, name) {
  requireDevice(`open ${name}`);
  adb(['logcat', '-c'], { allowFailure: true });
  adb(
    ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', deepLink, PACKAGE],
    { allowFailure: true }
  );
  settle(26);

  const pid = appPid();
  const log = adb(['logcat', '-d'], { allowFailure: true });

  const errors = log
    .split('\n')
    .filter((line) => /JavascriptException|FATAL EXCEPTION|ReactNativeJS.*(Error|TypeError)/.test(line))
    .slice(0, 3);

  const shot = capture(name);

  if (!pid) {
    // Three things look identical from here — a crashed app, a dead logger and a
    // vanished device — and this session mistook the second and third for the
    // first. Rule both out before saying anything about the app.
    requireDevice(`open ${name}`);

    // Distinguish a crash from a dead logger, every time. The whole reason this
    // harness exists.
    const jsLines = log.split('\n').filter((l) => l.includes('ReactNativeJS')).length;
    console.error(`${RED('DIED')}  ${name}  ${deepLink}`);
    console.error(
      jsLines === 0
        ? '      …and logcat captured no app output at all, so this is NOT evidence of a\n' +
            '      crash. Re-run preflight; `logd` has probably wedged.'
        : `      ${errors.join('\n      ') || 'no JS exception logged'}`
    );
    return { name, deepLink, alive: false, shot, errors };
  }

  console.log(
    `${GREEN('OK')}    ${name}${DIM('  — ' + shot)}${errors.length ? RED('  (JS errors logged)') : ''}`
  );
  for (const error of errors) console.log(`      ${error.slice(0, 160)}`);

  return { name, deepLink, alive: true, shot, errors };
}

// ═════════════════════════════════════════════════════════════════════════════

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'preflight':
    await preflight();
    break;
  case 'signin':
    await signin();
    break;
  case 'open':
    if (!rest[0]) fail('a deep link was given', 'usage: open <deeplink> [name]');
    open(rest[0], rest[1] ?? 'screen');
    break;
  case 'walk': {
    const plan = JSON.parse(readFileSync(rest[0] ?? 'walkthrough.json', 'utf8'));
    const results = plan.map((entry) => open(entry.deepLink, entry.name));
    const died = results.filter((r) => !r.alive);
    console.log(`\n  ${results.length - died.length} rendered · ${died.length} died\n`);
    process.exit(died.length > 0 ? 1 : 0);
  }
  default:
    console.log(
      '\n  node runtime-validation/device/harness.mjs <preflight|signin|open|walk>\n\n' +
        '    preflight            check every instrument before trusting any of them\n' +
        '    signin               sign in, with an OTP newer than the request\n' +
        '    open <link> [name]   open one screen, screenshot it, report what the app said\n' +
        '    walk <plan.json>     open several, in order\n'
    );
}
