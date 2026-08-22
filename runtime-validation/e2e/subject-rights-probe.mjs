/**
 * Account deletion and data export, driven end to end against a real API and a real database.
 *
 * The two rights a member exercises on themselves. Both are new, both are irreversible in one
 * direction, and neither is worth anything unless the database agrees afterwards — so every check
 * here that matters reads PostgreSQL directly rather than re-reading the API that just wrote it.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Written beside this file rather than relative to the cwd. `run-all.mjs` spawns each
// harness with its own working directory, and a relative path silently resolved to
// `runtime-validation/e2e/runtime-validation/e2e/...` — the probe ran, found everything it
// was looking for, and then died writing its own results.
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'results-subject-rights-probe.json');

import { call, sql, verifiedUser, recorder } from './e2e-harness.mjs';

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '700';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const PASSWORD = 'Hq3#zWvL8kTr';

const member = await verifiedUser({ name: 'Amara Leaving', phone: ph(1), password: PASSWORD });
rec('setup', 'a verified member', member.token ? 'PASS' : 'FAIL', `userId=${member.userId}`);
if (!member.token) {
  writeFileSync(OUT, JSON.stringify({ results }, null, 2));
  process.exit(1);
}
const T = member.token;
const U = member.userId;

// A second member, whose data must be untouched by the first one's deletion.
const bystander = await verifiedUser({ name: 'Chidi Staying', phone: ph(2), password: 'Kp9#mXbN2vQd' });
rec('setup', 'a second member who is not deleting anything', bystander.token ? 'PASS' : 'FAIL', `userId=${bystander.userId}`);

// Something to export and something to erase: a device registration.
await call('POST', '/notifications/devices', {
  token: T, label: 'register a device',
  body: { deviceIdentifier: `sr-${RUN}-device`, friendlyName: 'Amara phone', platform: 'Android', pushToken: `tok-${RUN}` },
});

// ── Export ──────────────────────────────────────────────────────────────────
const exportResponse = await call('GET', '/privacy/export', { token: T, label: 'export my data' });
const data = exportResponse.body?.data ?? {};
const sections = data.sections ?? [];
rec('export', 'the export endpoint answers', exportResponse.status === 200 ? 'PASS' : 'FAIL',
  `status=${exportResponse.status} sections=${sections.length}`);

const account = sections.find((s) => s.dataSet === 'account')?.records?.[0];
rec('export', 'the export carries the account the member gave us',
  account?.fullName === 'Amara Leaving' && account?.phoneNumber === ph(1) ? 'PASS' : 'FAIL',
  `fullName=${account?.fullName} phone=${account?.phoneNumber}`);

// The one thing that must never be in an export.
const raw = JSON.stringify(data);
rec('export', 'no credential is exported',
  !raw.includes('passwordHash') && !raw.includes('PasswordHash') && !raw.includes('securityStamp') ? 'PASS' : 'FAIL',
  'searched the whole document for a password hash or a security stamp');

rec('export', 'the export names the modules that could not contribute',
  Array.isArray(data.modulesWithoutExportProvider) && data.modulesWithoutExportProvider.length > 0 ? 'PASS' : 'FAIL',
  `withoutProvider=${(data.modulesWithoutExportProvider ?? []).length} — an export that hid its own gaps would read as complete`);

rec('export', "another member's export does not contain this member",
  await (async () => {
    const theirs = await call('GET', '/privacy/export', { token: bystander.token, label: "bystander's export" });
    return !JSON.stringify(theirs.body?.data ?? {}).includes(U);
  })() ? 'PASS' : 'FAIL',
  'scoped to the caller');

const anonExport = await call('GET', '/privacy/export', { label: 'anonymous export' });
rec('export', 'anonymous cannot export anybody', anonExport.status === 401 ? 'PASS' : 'FAIL', `status=${anonExport.status}`);

// ── Deletion preview ────────────────────────────────────────────────────────
const preview = await call('GET', '/privacy/deletion/preview', { token: T, label: 'preview deletion' });
const previewBody = preview.body?.data ?? {};
rec('deletion', 'the preview answers and changes nothing',
  preview.status === 200 && previewBody.isPreview === true ? 'PASS' : 'FAIL',
  `status=${preview.status} isPreview=${previewBody.isPreview} results=${(previewBody.results ?? []).length}`);

const stillThere = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${U}';`);
rec('deletion', 'the preview really did change nothing', stillThere === 'Amara Leaving' ? 'PASS' : 'FAIL',
  `db FullName="${stillThere}"`);

rec('deletion', 'the preview says what is kept, and why',
  (previewBody.results ?? []).some((r) => r.outcome === 'Retained' && r.reason) ? 'PASS' : 'FAIL',
  (previewBody.results ?? []).filter((r) => r.outcome === 'Retained').map((r) => `${r.module}/${r.dataSet}`).join(', ') || 'none');

// ── The refusals ────────────────────────────────────────────────────────────
const noConfirm = await call('POST', '/privacy/deletion', {
  token: T, label: 'delete without the confirmation word', body: { currentPassword: PASSWORD, confirmation: 'yes' },
});
rec('deletion', 'a missing confirmation word is refused', noConfirm.status === 400 ? 'PASS' : 'FAIL',
  `status=${noConfirm.status} code=${noConfirm.body?.code ?? '-'}`);

const wrongPassword = await call('POST', '/privacy/deletion', {
  token: T, label: 'delete with the wrong password', body: { currentPassword: 'not-the-password', confirmation: 'DELETE' },
});
rec('deletion', 'a valid token is not enough — the password is required', wrongPassword.status === 401 ? 'PASS' : 'FAIL',
  `status=${wrongPassword.status} code=${wrongPassword.body?.code ?? '-'}`);

const survived = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${U}';`);
rec('deletion', 'neither refusal erased anything', survived === 'Amara Leaving' ? 'PASS' : 'FAIL', `db FullName="${survived}"`);

// ── The erasure ─────────────────────────────────────────────────────────────
const devicesBefore = sql(`SELECT COUNT(*) FROM identity.user_devices WHERE "UserId"='${U}';`);
const sessionsBefore = sql(`SELECT COUNT(*) FROM identity.user_sessions WHERE "UserId"='${U}';`);

const deletion = await call('POST', '/privacy/deletion', {
  token: T, label: 'delete my account', body: { currentPassword: PASSWORD, confirmation: 'DELETE' },
});
const receipt = deletion.body?.data ?? {};
rec('deletion', 'the erasure is accepted', deletion.status === 200 ? 'PASS' : 'FAIL',
  `status=${deletion.status} isPreview=${receipt.isPreview} complete=${receipt.isComplete}`);
rec('deletion', 'no module failed', (receipt.failures ?? []).length === 0 ? 'PASS' : 'FAIL',
  `failures=${JSON.stringify(receipt.failures ?? [])}`);

// ── What the database says afterwards ───────────────────────────────────────
const after = sql(`SELECT "FullName" || '|' || "PhoneNumber" || '|' || COALESCE("Email",'-') || '|' || "AccessState" || '|' || "IsDeleted" FROM identity.users WHERE "Id"='${U}';`);
const [name, phone, email, state, deleted] = (after || '').split('|');

rec('erasure', 'the name is gone', name === 'Deleted member' ? 'PASS' : 'FAIL', `FullName="${name}"`);
rec('erasure', 'the phone number is gone and cannot be dialled',
  phone !== ph(1) && phone.startsWith('+999') ? 'PASS' : 'FAIL',
  `PhoneNumber="${phone}" — +999 is unassigned by the ITU`);
rec('erasure', 'the email is gone', email === '-' ? 'PASS' : 'FAIL', `Email=${email}`);
// `deleted` is the text psql renders for a boolean, which is "true" rather than "t" when it comes
// through a concatenation. Both are accepted so the check tests the platform and not psql's
// formatting — the first draft asserted on 't' and failed against a correctly erased account.
rec('erasure', 'the account is closed and soft-deleted',
  state === 'Disabled' && (deleted === 'true' || deleted === 't') ? 'PASS' : 'FAIL',
  `AccessState=${state} IsDeleted=${deleted}`);

rec('erasure', 'the row survives, so nothing that points at it breaks',
  sql(`SELECT COUNT(*) FROM identity.users WHERE "Id"='${U}';`) === '1' ? 'PASS' : 'FAIL',
  '216 foreign keys across the platform point at a member');

rec('erasure', 'sessions are deleted',
  sql(`SELECT COUNT(*) FROM identity.user_sessions WHERE "UserId"='${U}';`) === '0' ? 'PASS' : 'FAIL',
  `before=${sessionsBefore} after=0`);
rec('erasure', 'devices are deleted',
  sql(`SELECT COUNT(*) FROM identity.user_devices WHERE "UserId"='${U}';`) === '0' ? 'PASS' : 'FAIL',
  `before=${devicesBefore} after=0`);
rec('erasure', 'one-time codes are deleted',
  sql(`SELECT COUNT(*) FROM identity.otp_challenges WHERE "UserId"='${U}';`) === '0' ? 'PASS' : 'FAIL', '');
rec('erasure', 'password history is deleted',
  sql(`SELECT COUNT(*) FROM identity.user_password_history WHERE "UserId"='${U}';`) === '0' ? 'PASS' : 'FAIL',
  'the hashes of passwords a departed member chose are a liability with no purpose');
rec('erasure', 'the security trail is kept, as the receipt said it would be',
  Number(sql(`SELECT COUNT(*) FROM identity.security_events WHERE "UserId"='${U}';`)) > 0 ? 'PASS' : 'FAIL',
  'declared Retained with a reason, not quietly omitted');

// ── After erasure, the account must be unusable ─────────────────────────────
const oldToken = await call('GET', '/auth/me', { token: T, label: 'the old access token' });
rec('erasure', 'the access token issued before erasure no longer works',
  oldToken.status === 401 ? 'PASS' : 'FAIL', `status=${oldToken.status} — the security stamp was rotated`);

const signIn = await call('POST', '/auth/login', { label: 'sign in as the erased member', body: { phoneNumber: ph(1), password: PASSWORD } });
rec('erasure', 'the member cannot sign in again', signIn.status >= 400 ? 'PASS' : 'FAIL', `status=${signIn.status}`);

// ── The bystander is untouched ──────────────────────────────────────────────
const theirName = sql(`SELECT "FullName" FROM identity.users WHERE "Id"='${bystander.userId}';`);
rec('isolation', "the other member's account is untouched", theirName === 'Chidi Staying' ? 'PASS' : 'FAIL', `FullName="${theirName}"`);

// ── Idempotency ─────────────────────────────────────────────────────────────
const secondPass = sql(`SELECT COUNT(*) FROM identity.users WHERE "PhoneNumber"='${phone}';`);
rec('erasure', 'the tombstone number is unique to this member', secondPass === '1' ? 'PASS' : 'FAIL',
  `rows holding ${phone}: ${secondPass} — drawn from a sequence, not a hash`);

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`\n  ${pass} PASS · ${fail} FAIL · ${results.length} checks\n`);
writeFileSync(OUT, JSON.stringify({ run: RUN, userId: U, results }, null, 2));
// Exit 0 whatever was found. `run-all.mjs` reads the results file and owns the gate, so a
// harness that exited non-zero on a failure would be counted twice — once as a FAIL and
// again as a crashed harness.
process.exit(0);
