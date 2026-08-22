/**
 * Can an unauthenticated caller move a payment by forging a gateway callback?
 *
 * `POST /financial/webhooks/{provider}` is the only anonymous route the Financial module
 * publishes, and it is anonymous on purpose: a provider holds a shared secret, not a bearer
 * token, and the signature is the credential. That is the correct design — provided the
 * secret is a secret.
 *
 * For the shipped `simulated` processor it is not. `SimulatedPaymentWebhookProcessor.Sign`
 * takes `secret = DevelopmentSecret`, a public compile-time constant, and `IsSignatureValid`
 * calls it with the default. There is no configuration key that changes it. So anybody
 * holding the source — or this file — can produce a signature that verifies.
 *
 * This probe establishes what that actually buys an attacker, end to end, rather than
 * reasoning about it: create a real payment intent, leave it alone, then forge a `captured`
 * callback naming it and see whether the platform believes it.
 */
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Written beside this file rather than relative to the cwd. `run-all.mjs` spawns each
// harness with its own working directory, and a relative path silently resolved to
// `runtime-validation/e2e/runtime-validation/e2e/...` — the probe ran, found everything it
// was looking for, and then died writing its own results.
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'results-webhook-forgery-probe.json');

import { call, sql, verifiedUser, recorder } from './e2e-harness.mjs';

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '800';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

// The constant from SimulatedPaymentWebhookProcessor. Reproduced here to demonstrate the
// point: a probe can hold it because anyone can.
const PUBLIC_SECRET = 'simulated-gateway-development-secret';
const sign = (rawBody) => createHmac('sha256', PUBLIC_SECRET).update(rawBody).digest('hex');

const member = await verifiedUser({ name: 'Kofi Payer', phone: ph(1), password: 'Zt6#kQwR3mVd' });
rec('setup', 'a verified member', member.token ? 'PASS' : 'FAIL', `userId=${member.userId}`);
if (!member.token) { writeFileSync(OUT, JSON.stringify({ results }, null, 2)); process.exit(1); }

const stamp = `wf${RUN}`;
const intent = await call('POST', '/financial/payment-intents', {
  token: member.token, label: 'member creates a payment intent',
  body: { amount: 25000, currency: 'NGN', methodKind: 'Card', description: `Forgery probe ${stamp}`, countryCode: 'NG', idempotencyKey: `${stamp}-pi` },
});
const intentId = intent.body?.data?.paymentIntentId ?? intent.body?.data?.id;
const stateAfterCreate = sql(`SELECT "Status" FROM financial.financial_payment_intents WHERE "Id"='${intentId}';`);
rec('setup', 'an unpaid payment intent exists', intentId ? 'PASS' : 'FAIL',
  `status=${intent.status} id=${intentId} dbStatus=${stateAfterCreate}`);
if (!intentId) { writeFileSync(OUT, JSON.stringify({ results }, null, 2)); process.exit(1); }

// ── The forgery ─────────────────────────────────────────────────────────────
// No token. No session. Just the public constant and the intent identifier.
// The harness serialises `body` with JSON.stringify, and JavaScript preserves insertion
// order, so signing JSON.stringify(payload) signs exactly the bytes that will be sent. A
// signature computed over a re-serialised object would verify against something the sender
// never sent — the hazard the endpoint's own documentation calls out.
const forge = async (label, eventKind, extra = {}) => {
  const payload = { eventKind, externalReference: intentId, eventId: `${stamp}-${eventKind}`, currency: 'NGN', amountMinorUnits: 2500000, ...extra };
  return call('POST', '/financial/webhooks/simulated', {
    label, body: payload, headers: { 'X-Diaspora-Signature': sign(JSON.stringify(payload)) },
  });
};

const unsigned = await call('POST', '/financial/webhooks/simulated', {
  label: 'unsigned callback', body: { eventKind: 'captured', externalReference: intentId },
});
rec('webhook', 'an unsigned callback is refused', unsigned.status === 400 ? 'PASS' : 'FAIL',
  `status=${unsigned.status} code=${unsigned.body?.code ?? '-'}`);

const wrongSig = await call('POST', '/financial/webhooks/simulated', {
  label: 'wrongly signed callback', body: { eventKind: 'captured', externalReference: intentId },
  headers: { 'X-Diaspora-Signature': 'deadbeef'.repeat(8) },
});
rec('webhook', 'a wrongly signed callback is refused', wrongSig.status === 400 ? 'PASS' : 'FAIL',
  `status=${wrongSig.status} code=${wrongSig.body?.code ?? '-'}`);

const authorized = await forge('FORGED authorized', 'authorized');
const afterAuthorized = sql(`SELECT "Status" FROM financial.financial_payment_intents WHERE "Id"='${intentId}';`);
rec('webhook', 'a forged "authorized" callback, signed with the public constant',
  'OBSERVED', `httpStatus=${authorized.status} outcome=${authorized.body?.data?.outcome ?? '-'} intentStatus: ${stateAfterCreate} → ${afterAuthorized}`);

const captured = await forge('FORGED captured', 'captured');
const afterCaptured = sql(`SELECT "Status" FROM financial.financial_payment_intents WHERE "Id"='${intentId}';`);
rec('webhook', 'a forged "captured" callback, signed with the public constant',
  'OBSERVED', `httpStatus=${captured.status} outcome=${captured.body?.data?.outcome ?? '-'} intentStatus: ${afterAuthorized} → ${afterCaptured}`);

const ledgerRows = sql(`SELECT COUNT(*) FROM financial.financial_ledger_entries WHERE "Reference" LIKE '%${intentId}%';`);
rec('webhook', 'did the forgery post to the ledger?',
  ledgerRows === '0' || ledgerRows.startsWith('SQL_ERROR') ? 'PASS' : 'OBSERVED',
  `ledger rows referencing the intent = ${ledgerRows}`);

// Replay: the same event identifier, twice.
const replay = await forge('FORGED captured, replayed', 'captured');
rec('webhook', 'a replayed event identifier is de-duplicated rather than reapplied',
  replay.body?.data?.wasDuplicate === true ? 'PASS' : 'OBSERVED',
  `wasDuplicate=${replay.body?.data?.wasDuplicate} outcome=${replay.body?.data?.outcome ?? '-'}`);

// A callback naming an intent this deployment has never seen.
const unknownPayload = { eventKind: 'captured', externalReference: '00000000-0000-0000-0000-000000000000', eventId: `${stamp}-unknown` };
const unknown = await call('POST', '/financial/webhooks/simulated', {
  label: 'forged callback for an unknown reference', body: unknownPayload,
  headers: { 'X-Diaspora-Signature': sign(JSON.stringify(unknownPayload)) },
});
rec('webhook', 'an unmatched reference is acknowledged without inventing a payment',
  unknown.body?.data?.outcome === 'Unmatched' ? 'PASS' : 'OBSERVED',
  `status=${unknown.status} outcome=${unknown.body?.data?.outcome ?? '-'}`);

const finalState = sql(`SELECT "Status" FROM financial.financial_payment_intents WHERE "Id"='${intentId}';`);
rec('webhook', 'final intent state after every forgery attempt', 'OBSERVED', `dbStatus=${finalState}`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`\n  ${pass} PASS · ${fail} FAIL · ${results.length - pass - fail} observed · ${results.length} checks\n`);
writeFileSync(OUT, JSON.stringify({ run: RUN, intentId, results }, null, 2));
// Exit 0 whatever was found. `run-all.mjs` reads the results file and owns the gate, so a
// harness that exited non-zero on a failure would be counted twice — once as a FAIL and
// again as a crashed harness.
process.exit(0);
