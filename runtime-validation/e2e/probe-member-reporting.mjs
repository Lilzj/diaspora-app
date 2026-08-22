/**
 * BG-05a — reporting a member.
 *
 * The last unreportable subject on the platform. A member could report a guide, a listing, a
 * property, an event, a post, a comment, a poll, an organisation, a vacancy and a direct message,
 * and could not report the *person* — so somebody being harassed across several surfaces had to
 * file a separate complaint about each thing, and no single case ever described the pattern.
 *
 * **The blocker was architectural, not product.** A `MemberContentSource` was written in Trust,
 * worked, and was reverted: Trust may not depend on Identity's domain (ADR-002), and Trust composes
 * at 200 while Community composes at 500. Both rules are correct and neither was weakened. The
 * capability needed a module that may talk to Community and can prove a member exists — and nothing
 * satisfied both, because Community holds no member projection.
 *
 * It holds one now. `CommunityMember` is fed by `UserRegisteredIntegrationEvent` — a published
 * contract, not Identity's domain — and backfilled by `ProjectCommunityMembers` so members who
 * registered before it existed are reportable too. That backfill is the half most likely to be
 * skipped and the half that decides whether this works for anybody but brand-new accounts.
 *
 * **What this probe is really testing is the boundary, not the happy path.** A reporting seam over
 * people is one careless implementation away from being a member-enumeration route, so the
 * assertions below are mostly about what it refuses.
 *
 *   node runtime-validation/e2e/probe-member-reporting.mjs
 */
import { writeFileSync } from 'node:fs';
import { call, sql, evidence, verifiedUser, recorder } from './e2e-harness.mjs';

const OUT = new URL('./results-member-reporting.json', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '910';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const ok = (r) => r.status >= 200 && r.status < 300;
const code = (r) => r.body?.code ?? r.body?.error?.code ?? null;

/**
 * A refusal by the platform, as distinct from a request the platform could not read.
 *
 * The first run of this probe sent `reasonCode`/`details` where the contract says
 * `reason`/`description`, so *every* call answered `400 Platform.Validation.Failed` — and three
 * "is this refused?" assertions passed on it. A malformed body never reaches the domain, so it
 * proves nothing about what the domain would have decided. Anything that did not get past
 * deserialisation is not evidence either way.
 */
const refused = (r) => !ok(r) && code(r) !== 'Platform.Validation.Failed';

console.log('\n══ BG-05a · reporting a member ════════════════════════════════════════\n');

const reporter = await verifiedUser({ name: `Reporter ${RUN}`, phone: ph(1), password: 'Yr5#dGkP7wLs' });
const subject = await verifiedUser({ name: `Subject ${RUN}`, phone: ph(2), password: 'Yr5#dGkP8wLs' });

rec('setup', 'two members exist', reporter.token && subject.token ? 'PASS' : 'BLOCKED',
  `reporter=${reporter.userId} subject=${subject.userId}`);

if (!reporter.token || !subject.token) {
  writeFileSync(OUT, JSON.stringify({ results, evidence }, null, 2));
  process.exit(1);
}

const T = reporter.token;

// ═════════════════════════════════════════════════════════════════════════════
// The projection
// ═════════════════════════════════════════════════════════════════════════════

{
  // Both members registered *after* the consumer shipped, so this proves the forward path.
  //
  // Polled, because the projection is fed from the outbox: the consumer runs after the
  // registration request returned, and reading once immediately afterwards loses that race often
  // enough to matter. The first run of this probe read 1 of 2 and the missing one arrived a
  // moment later — a flaky assertion rather than a real gap.
  let projected = '0';
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    projected = sql(`
      SELECT count(*) FROM community.community_members
      WHERE "UserId" IN ('${reporter.userId}', '${subject.userId}');
    `).trim();
    if (projected === '2') break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  rec('community', 'a newly registered member is projected into Community',
    projected === '2' ? 'PASS' : 'FAIL', `${projected} of 2 projected`);
}

{
  // And this proves the backfill, which is the half an outbox cannot do.
  const gap = sql(`
    SELECT count(*) FROM identity.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM community.community_members m WHERE m."UserId" = u."Id");
  `).trim();

  rec('community', 'every existing member was backfilled',
    gap === '0' ? 'PASS' : 'FAIL',
    `${gap} members exist in Identity with no Community projection — each one is unreportable`);
}

// ═════════════════════════════════════════════════════════════════════════════
// The capability
// ═════════════════════════════════════════════════════════════════════════════

const reasons = await call('GET', '/community/reports/reasons', { token: T, label: 'report reasons' });
const reasonCode = (reasons.body?.data ?? [])[1]?.code ?? 'spam';

const report = await call('POST', '/community/reports', {
  token: T, label: 'report a member',
  body: {
    contentType: 'Member',
    contentId: subject.userId,
    reason: reasonCode,
    description: 'Filed by the BG-05a probe against a real member.',
  },
});

rec('community', 'a member can be reported', ok(report) ? 'PASS' : 'FAIL',
  `status=${report.status} code=${code(report) ?? 'none'}`);

{
  // The row, read back. A 201 that stored nothing would pass the line above.
  const stored = sql(`
    SELECT count(*) FROM community.content_reports
    WHERE "ReporterId" = '${reporter.userId}';
  `).trim();

  rec('community', 'the report is persisted', stored !== '0' ? 'PASS' : 'FAIL',
    `${stored} report(s) stored for this reporter`);
}

// ═════════════════════════════════════════════════════════════════════════════
// The boundaries — what this seam must refuse
// ═════════════════════════════════════════════════════════════════════════════

{
  const duplicate = await call('POST', '/community/reports', {
    token: T, label: 'report the same member twice',
    body: { contentType: 'Member', contentId: subject.userId, reason: reasonCode, description: 'Again.' },
  });

  // Either refusal is correct. What must not happen is a second stored case for one complaint,
  // which would let one person inflate a member's report count at will.
  rec('community', 'a duplicate report is refused',
    refused(duplicate) ? 'PASS' : 'FAIL',
    `status=${duplicate.status} code=${code(duplicate) ?? 'none'}`);
}

{
  const self = await call('POST', '/community/reports', {
    token: T, label: 'report yourself',
    body: { contentType: 'Member', contentId: reporter.userId, reason: reasonCode, description: 'Myself.' },
  });

  // MemberContentSource sets AuthorId to the member themselves, and Community refuses a report
  // whose author is the caller. Reporting your own account is not a moderation case.
  rec('community', 'reporting yourself is refused', refused(self) ? 'PASS' : 'FAIL',
    `status=${self.status} code=${code(self) ?? 'none'}`);
}

{
  const ghost = await call('POST', '/community/reports', {
    token: T, label: 'report an id that is not a member',
    body: {
      contentType: 'Member',
      contentId: '00000000-0000-4000-8000-000000000000',
      reason: reasonCode,
      description: 'Nobody.',
    },
  });

  rec('community', 'an id that is not a member resolves to not-found',
    ghost.status === 404 ? 'PASS' : 'FAIL',
    `status=${ghost.status} code=${code(ghost) ?? 'none'}`);
}

{
  const comment = await call('POST', '/community/content/member/' + subject.userId + '/comments', {
    token: T, label: 'comment on a member',
    body: { body: 'A public thread about a person.' },
  });

  // AcceptsComments is false and there is no setting that turns it on. A public comment thread
  // hanging off a person is not a moderation feature.
  rec('community', 'a member cannot be commented on', refused(comment) ? 'PASS' : 'FAIL',
    `status=${comment.status} code=${code(comment) ?? 'none'}`);
}

{
  // The seam must not have become a member-lookup route. Whatever the report response carries,
  // it must not carry contact details.
  const body = JSON.stringify(report.body ?? {});
  const leaks = ['phoneNumber', 'phone', 'email', 'passwordHash', 'securityStamp']
    .filter((field) => body.includes(field));

  rec('community', 'the report response carries no contact details',
    leaks.length === 0 ? 'PASS' : 'FAIL',
    leaks.length ? `leaked: ${leaks.join(', ')}` : 'no identity fields in the response');
}

// The reasons the modal offers for a person
//
// The client used to offer content-accuracy reasons for a human being --
// "Conflicting information (with another post)", "Inaccurate or outdated
// details" -- and offered neither of the two a person is most often reported
// for. The subject list is now abusive, inappropriate, spam, personalData,
// other.
//
// Each key is checked against a DISTINCT subject, because a second report from
// the same reporter about the same subject answers 409
// community.report.duplicate -- so a status code alone cannot tell an accepted
// reason from a rejected one, and reusing one subject would have reported four
// false refusals.
//
// And each is read back from the row rather than trusted from the response: the
// question is not "was this accepted" but "did it land on its own code", since
// the reason is what a moderator queue sorts on and PersonalData carries a
// legal clock.

const SUBJECT_REASONS = [
  { key: 'abusive', code: 'Harassment' },
  { key: 'inappropriate', code: 'Inappropriate' },
  { key: 'spam', code: 'Spam' },
  { key: 'personalData', code: 'PersonalData' },
  { key: 'other', code: 'Other' },
];

// Existing members, not freshly registered ones. Registration is rate limited
// to five per 300 seconds, and this loop needs five subjects on top of the two
// the probe already creates -- so seeding them made the probe BLOCK on its own
// setup, which reads exactly like the capability being unavailable.
//
// Any member other than the reporter will do: the subject only has to exist and
// not already have been reported by this reporter.
const candidates = sql(`
  SELECT u."Id" FROM identity.users u
  WHERE u."Id" <> '${reporter.userId}'
    AND NOT EXISTS (
      SELECT 1 FROM community.content_reports r
      WHERE r.content_id = u."Id" AND r."ReporterId" = '${reporter.userId}'
    )
  ORDER BY u."Id"
  LIMIT ${SUBJECT_REASONS.length};
`).trim().split(String.fromCharCode(10)).map((row) => row.trim()).filter(Boolean);

if (candidates.length < SUBJECT_REASONS.length) {
  rec('community', 'reason vocabulary', 'BLOCKED',
    `${candidates.length} of ${SUBJECT_REASONS.length} distinct subjects available`);
} else {
  for (const [index, entry] of SUBJECT_REASONS.entries()) {
    const marker = `reason vocabulary ${RUN} ${entry.key}`;
    const filed = await call('POST', '/community/reports', {
      token: T, label: `report with reason ${entry.key}`,
      body: {
        contentType: 'Member',
        contentId: candidates[index],
        reason: entry.key,
        description: marker,
      },
    });

    if (!ok(filed)) {
      rec('community', `reason "${entry.key}" resolves`, 'FAIL',
        `status=${filed.status} code=${code(filed) ?? 'none'} - the client offers a reason the server refuses`);
      continue;
    }

    const stored = sql(`
      SELECT "Reason" FROM community.content_reports
      WHERE "Description" = '${marker}';
    `).trim();

    rec('community', `reason "${entry.key}" resolves`, stored === entry.code ? 'PASS' : 'FAIL',
      `stored as ${stored || 'nothing'}, expected ${entry.code}`);
  }
}


// ═════════════════════════════════════════════════════════════════════════════

const pass = results.filter((r) => r.verdict === 'PASS').length;
const fail = results.filter((r) => r.verdict === 'FAIL').length;
const blocked = results.filter((r) => r.verdict === 'BLOCKED').length;

console.log(`\n  ${pass} PASS · ${fail} FAIL · ${blocked} BLOCKED\n`);

writeFileSync(OUT, JSON.stringify({
  probe: 'BG-05a member reporting',
  run: RUN,
  members: { reporter: reporter.userId, subject: subject.userId },
  totals: { pass, fail, blocked },
  results,
  evidence,
}, null, 2));

process.exit(fail > 0 ? 1 : 0);
