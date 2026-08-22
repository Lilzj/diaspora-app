/**
 * DEFECT-002 stress test.
 *
 * The dispatcher fanned every partition out through `Task.WhenAll` while holding a
 * single scoped `DbContext`, so partitions issued their delivery-status writes on
 * one connection. Npgsql answered `A command is already in progress`, and a live
 * run failed 25 of 37 claimed messages per pass.
 *
 * This drives enough concurrent traffic to produce many partitions in one pass,
 * then reads the dispatcher's own pass statistics from the log and the resulting
 * message states from the database. A message that publishes but fails to be
 * *recorded* as published retries forever, so `AttemptCount` matters as much as
 * `State`.
 */
import { readFileSync } from 'node:fs';
import { call, makeUser, sql, save } from './harness.mjs';

const RUN = process.env.RUNTIME_RUN ?? '300';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const LOG = process.env.RUNTIME_API_LOG;
const WAVE = Number(process.env.OUTBOX_WAVE ?? 12);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function outboxState() {
  const rows = sql(
    `SELECT s."State" || '=' || s.cnt FROM (SELECT "State", count(*) AS cnt FROM platform.outbox_messages GROUP BY "State") s ORDER BY 1;`
  );
  return rows.split('\n').filter(Boolean).join('  ');
}

/**
 * Only messages enqueued by THIS run.
 *
 * The table still holds rows from before the fix, and those legitimately carry
 * retry counts. Measuring the whole table would report the defect's history as
 * though it were the present — the exact mistake the previous programme made five
 * times and had to withdraw.
 */
let watermark = '1970-01-01';
const scoped = (where) =>
  sql(`SELECT count(*) FROM platform.outbox_messages WHERE "EnqueuedAt" > '${watermark}'::timestamptz AND ${where};`);

function exceptionCounts() {
  if (!LOG) return { operationInProgress: 0, invalidCast: 0 };
  const text = readFileSync(LOG, 'utf8');
  const count = (needle) => (text.match(new RegExp(needle, 'g')) ?? []).length;
  return {
    operationInProgress: count('NpgsqlOperationInProgressException'),
    invalidCast: count('InvalidCastException'),
  };
}

function failingPasses() {
  if (!LOG) return [];
  // The dispatcher logs this line only when something failed, so any occurrence
  // during the window is itself the signal.
  return readFileSync(LOG, 'utf8').split(/\r?\n/).filter((l) => l.includes('Outbox pass:'));
}

console.log('\n=== DEFECT-002: OUTBOX DISPATCH STRESS ===\n');

watermark = sql(`SELECT now()::text;`);
const before = exceptionCounts();
const passesBefore = failingPasses().length;
console.log(`  watermark : ${watermark}`);
console.log(`  before    : ${outboxState()}`);
console.log(`  exceptions before: ${JSON.stringify(before)}, failing passes before: ${passesBefore}`);

// ── Traffic across many modules, so one pass claims many partitions ──────────
const users = [];
for (let i = 1; i <= WAVE; i++) {
  const u = await makeUser({ name: `Outbox Probe ${i}`, phone: ph(i), password: 'Ox4#tqWn7Zr3' });
  if (!u.userId) continue;
  sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
  const re = await call('POST', '/auth/login', { label: `login ${i}`, body: { phoneNumber: ph(i), password: 'Ox4#tqWn7Zr3' } });
  users.push({ ...u, token: (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken });
}
console.log(`  created ${users.length} verified identities`);

const bursts = [];
for (const u of users) {
  if (!u.token) continue;
  bursts.push(call('POST', '/community/posts', {
    token: u.token, label: 'burst post',
    body: { body: `Outbox stress ${RUN} ${u.userId}`, countryCode: 'NG', cityName: 'Lagos', publish: true },
  }));
  bursts.push(call('POST', '/marketplace/sellers', {
    token: u.token, label: 'burst seller',
    body: { displayName: `Outbox Trader ${u.userId.slice(0, 8)}`, countryCode: 'NG', kind: 'Individual' },
  }));
}
const results = await Promise.all(bursts);
console.log(`  fired ${results.length} concurrent writes, ${results.filter((r) => r.status < 400).length} accepted`);

// ── Drain ────────────────────────────────────────────────────────────────────
console.log('  draining…');
let drained = false;
for (let i = 0; i < 45; i++) {
  await wait(2000);
  if (sql(`SELECT count(*) FROM platform.outbox_messages WHERE "State" NOT IN ('Delivered','DeadLettered');`) === '0') {
    drained = true;
    break;
  }
}
console.log(`  after     : ${outboxState()}`);

const after = exceptionCounts();
const newInProgress = after.operationInProgress - before.operationInProgress;
const newInvalidCast = after.invalidCast - before.invalidCast;
const newFailingPasses = failingPasses().length - passesBefore;

const enqueued = scoped('true');
const delivered = scoped(`"State"='Delivered'`);
const deadLettered = scoped(`"State"='DeadLettered'`);
const multiAttempt = scoped(`"AttemptCount" > 1`);
const maxAttempts = sql(
  `SELECT COALESCE(max("AttemptCount"),0) FROM platform.outbox_messages WHERE "EnqueuedAt" > '${watermark}'::timestamptz;`
);
console.log(`  messages enqueued by this run: ${enqueued}\n`);

const checks = [];
const rec = (name, ok, note) => {
  checks.push({ name, ok, note });
  console.log(`  ${(ok ? 'PASS' : 'FAIL').padEnd(5)} ${name} — ${note}`);
};

rec('no "command already in progress"', newInProgress === 0, `new NpgsqlOperationInProgressException: ${newInProgress}`);
rec('no Npgsql data-source cast failures', newInvalidCast === 0, `new InvalidCastException: ${newInvalidCast}`);
rec('no dispatcher pass reported a failure', newFailingPasses === 0, `failing passes during the run: ${newFailingPasses}`);
rec('outbox drained', drained, drained ? 'nothing left pending' : 'still pending after 90s');
rec('nothing dead-lettered', deadLettered === '0', `dead-lettered=${deadLettered}`);
rec('every message this run enqueued was delivered', enqueued !== '0' && delivered === enqueued,
  `delivered=${delivered} of ${enqueued}`);
rec('no retry amplification', Number(maxAttempts) <= 1,
  `max AttemptCount=${maxAttempts}, retried=${multiAttempt} (scoped to this run)`);

const pass = checks.filter((c) => c.ok).length;
console.log(`\n--- OUTBOX STRESS: ${pass}/${checks.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-outbox-stress.json');
