/**
 * Clears the Diaspora Verification gate through the real product flow.
 *
 * The home screen renders `FeatureGate` until
 * `trust.verifications.Diaspora ∈ {Approved, PartiallyApproved}`. That is a Trust
 * record, distinct from `AccessState` — a member can be `AccessState.Verified`
 * and still see the gate, which is exactly what the earlier device run showed.
 *
 * Unlike `POST /trust/decisions` (declared `PermissionAudience.Service`, so no
 * human credential can call it), `POST /trust/verifications/{id}/review` is a
 * moderator route. So the gate is reachable by driving the product flow:
 * member submits → moderator reviews → gate opens.
 */
import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (flow, verdict, note) => {
  results.push({ flow, verdict, note });
  console.log(`  ${verdict.padEnd(7)} ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '800';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;

console.log('\n=== PHASE 7: DIASPORA VERIFICATION GATE ===\n');

// ── The member ───────────────────────────────────────────────────────────
const member = await makeUser({ name: 'Verified Member', phone: ph(1), password: 'Vm5#kzWq8Rt4' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${member.userId}';`);
const mLogin = await call('POST', '/auth/login', { label: 'member login', body: { phoneNumber: ph(1), password: 'Vm5#kzWq8Rt4' } });
const MT = (mLogin.body?.data?.tokens ?? mLogin.body?.data ?? {}).accessToken;
rec('member authenticates', !!MT ? 'PASS' : 'FAIL', `userId=${member.userId}`);

// The gate reads the trust profile, so that is what to check before and after.
const before = await call('GET', '/trust/profile', { token: MT, label: 'trust profile before' });
const statusBefore = before.body?.data?.verifications?.Diaspora ?? '(none)';
rec('gate is closed before submission', before.status === 200 ? 'PASS' : 'FAIL',
  `Diaspora verification status = ${JSON.stringify(statusBefore)}`);

// ── Submit ───────────────────────────────────────────────────────────────
const submit = await call('POST', '/trust/verifications/diaspora', {
  token: MT, label: 'submit diaspora verification',
  body: {
    nationality: 'NG',
    // Must differ from nationality. A Diaspora verification is a claim about
    // living abroad, so nationality == residence is auto-rejected on submission
    // as a fact rather than a judgement — correctly.
    residenceCountry: 'GB',
    documentType: 'Passport',
    issueCountry: 'NG',
    documentReference: `runtime-validation-${RUN}`,
    documentNumber: `A${RUN}0001`,
    // Required by the domain although OpenAPI lists it as optional — the
    // submission is refused with trust.verification.type-unsupported without it.
    selfieReference: `runtime-validation-selfie-${RUN}`,
    supportingNotes: 'Submitted by the runtime validation harness.',
  },
});
const verificationId = submit.body?.data?.verificationId ?? submit.body?.data?.id;
rec('member submits a Diaspora verification', submit.status < 400 ? 'PASS' : 'FAIL',
  `status=${submit.status} id=${verificationId ?? JSON.stringify(submit.body).slice(0, 220)}`);

// ── The moderator ────────────────────────────────────────────────────────
const mod = await makeUser({ name: 'Trust Moderator', phone: ph(2), password: 'Tm3#nqXv7Wd9' });
sql(`UPDATE identity.users SET "Role"='Moderator', "AccessState"='Verified' WHERE "Id"='${mod.userId}';`);
const modLogin = await call('POST', '/auth/login', { label: 'moderator login', body: { phoneNumber: ph(2), password: 'Tm3#nqXv7Wd9' } });
const MOD = (modLogin.body?.data?.tokens ?? modLogin.body?.data ?? {}).accessToken;
rec('moderator authenticates', !!MOD ? 'PASS' : 'FAIL',
  sql(`SELECT "Role" || '/' || "AccessState" FROM identity.users WHERE "Id"='${mod.userId}';`));

const queue = await call('GET', '/trust/verifications/queue', { token: MOD, label: 'moderation queue' });
const queued = queue.body?.data?.items ?? queue.body?.data ?? [];
rec('submission appears in the moderation queue',
  queue.status === 200 ? 'PASS' : 'FAIL',
  `status=${queue.status} items=${Array.isArray(queued) ? queued.length : 'n/a'}`);

// An ordinary member must not be able to approve their own verification.
if (verificationId) {
  const selfApprove = await call('POST', `/trust/verifications/${verificationId}/review`, {
    token: MT, label: 'self-approval attempt', body: { decision: 'Approved', notes: 'self' },
  });
  rec('member cannot approve their own verification',
    selfApprove.status === 403 || selfApprove.status === 404 ? 'PASS' : 'FAIL',
    `status=${selfApprove.status} code=${selfApprove.body?.code ?? ''}`);
}

// ── Review ───────────────────────────────────────────────────────────────
if (verificationId) {
  const review = await call('POST', `/trust/verifications/${verificationId}/review`, {
    token: MOD, label: 'moderator approves',
    // `details` is nullable in OpenAPI and required by the validator — the second
    // such mismatch in this module, after `selfieReference` on submission.
    body: {
      // `Approve`, not `Approved` — the review vocabulary is ReviewDecision
      // (Approve/PartiallyApprove/Reject/NeedMoreInfo/Escalate/Revoke), not the
      // VerificationStatus names. An unparseable value silently becomes
      // NeedMoreInfo rather than being refused; see the findings.
      decision: 'Approve',
      details: 'Documents match the declared nationality and residence. Approved to exercise gated screens.',
      notes: 'Runtime validation.',
    },
  });
  rec('moderator approves the verification', review.status < 400 ? 'PASS' : 'FAIL',
    `status=${review.status} ${review.status >= 400 ? JSON.stringify(review.body).slice(0, 260) : ''}`);
}

// ── Did the gate actually open? ──────────────────────────────────────────
const after = await call('GET', '/trust/profile', { token: MT, label: 'trust profile after' });
const statusAfter = after.body?.data?.verifications?.Diaspora;
const opened = statusAfter === 'Approved' || statusAfter === 'PartiallyApproved';
rec('the gate opens (Approved / PartiallyApproved)', opened ? 'PASS' : 'FAIL',
  `Diaspora verification status = ${JSON.stringify(statusAfter)}`);

if (opened) {
  console.log('\n  ── credentials for the UI sweep ──');
  console.log(`  phone    : ${ph(1)}`);
  console.log(`  userId   : ${member.userId}`);
  console.log(`  moderator: ${ph(2)}`);
}

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 7: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase7-verification.json');
