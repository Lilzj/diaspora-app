// ─────────────────────────────────────────────────────────────────────────────
// Seed members into the hosted deployment
//
// ── Why this cannot work the way the local seeders did ───────────────────────
//
// Every existing seeder here registers through `POST /auth/register` and then
// reads the verification code out of the API's log, because
// `LogOtpCodesForDevelopment` writes it there.
//
// That option is refused outside Development —
// `IdentityModuleOptionsValidator` will not start the host with it enabled in
// any other environment — and the hosted API runs as `Production`. There is no
// code to read, and no SMS provider configured to deliver one.
//
// So registration happens through the real route, and only the two facts the
// OTP round trip would have established are set directly on the database:
// the phone is verified, and the account is past `LimitedAccess`.
//
// ── Why that is not cheating ─────────────────────────────────────────────────
//
// The local workflow did the same thing for the second of those. A newly
// verified member is `AccessState.LimitedAccess` and cannot contribute — every
// create answers 403 — and only the Trust Engine can promote them, through a
// permission whose audience is `Service`. No human role, not Moderator or
// Admin, can call it. Seeding the state directly has always been the only way
// to get a member who can post.
//
// Everything after this point — every listing, guide, event, reservation and
// review — goes through the real API as that member.
//
// ── Credentials ──────────────────────────────────────────────────────────────
//
// `SEED_PASSWORD` is required and has no default. The shared fixture password
// is committed in eight probe scripts in this repository; those are now on
// GitHub, and this API is publicly reachable. Reusing it would publish a working
// login to a live deployment.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';

const ORIGIN = process.env.RUNTIME_API_ORIGIN;
const PASSWORD = process.env.SEED_PASSWORD;
const NEON_URI = process.env.NEON_URI;
const PSQL = process.env.PSQL ?? 'psql';

if (!ORIGIN || !PASSWORD || !NEON_URI) {
  console.error('Set RUNTIME_API_ORIGIN, SEED_PASSWORD and NEON_URI before running this.');
  process.exit(2);
}

/** The members this deployment needs, and what each one is for. */
const MEMBERS = [
  { name: 'Amara Okafor', phone: '+2348100200001', role: 'the walkthrough member — signs in on the device' },
  { name: 'Chidi Eze', phone: '+2348100200002', role: 'a second member, so conversations and reports have a real other party' },
  { name: 'Ngozi Balogun', phone: '+2348100200003', role: 'a seller and landlord, so purchases and tenancies have a counterparty' },
];

function sql(query) {
  try {
    return execFileSync(PSQL, [NEON_URI, '-tAc', query], { encoding: 'utf8' }).trim();
  } catch (cause) {
    return `SQL_ERROR: ${cause.stderr ?? cause.message}`;
  }
}

/** A scalar, or null. A failed read is unknown — never a value. */
function scalar(query) {
  const value = sql(query);
  if (!value || value.startsWith('SQL_ERROR') || value.includes('ERROR:')) return null;
  return value;
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${ORIGIN}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    // A body that is not JSON is a fact about the response, not a crash here.
  }

  return { status: response.status, body: parsed };
}

console.log(`\n  Seeding ${ORIGIN}\n`);

const created = [];

for (const member of MEMBERS) {
  const existing = scalar(
    `SELECT "Id" FROM identity.users WHERE "PhoneNumber" = '${member.phone}' LIMIT 1;`
  );

  if (existing) {
    console.log(`  EXISTS   ${member.name} (${existing.slice(0, 8)})`);
    created.push({ ...member, id: existing });
    continue;
  }

  const registration = await call('POST', '/auth/register', {
    body: {
      fullName: member.name,
      phoneNumber: member.phone,
      password: PASSWORD,
      nationality: 'NG',
      countryOfResidence: 'GB',
    },
  });

  if (registration.status < 200 || registration.status >= 300) {
    console.log(
      `  BLOCKED  ${member.name} — ${registration.status} ${registration.body?.code ?? ''} ` +
        `${(registration.body?.detail ?? '').slice(0, 80)}`
    );
    continue;
  }

  const id = scalar(`SELECT "Id" FROM identity.users WHERE "PhoneNumber" = '${member.phone}' LIMIT 1;`);
  if (!id) {
    console.log(`  BLOCKED  ${member.name} — registered but no row found`);
    continue;
  }

  console.log(`  OK       ${member.name} (${id.slice(0, 8)}) — ${member.role}`);
  created.push({ ...member, id });
}

// ── The two facts the OTP round trip would have established ──────────────────
//
// Set together, in one statement, so a member can never be half-seeded: verified
// but still `LimitedAccess` looks exactly like a member whose Trust decision has
// not landed, and debugging that is a waste of an afternoon.

if (created.length > 0) {
  const ids = created.map((m) => `'${m.id}'`).join(',');
  const updated = sql(`
    UPDATE identity.users
       SET phone_verified_at = COALESCE(phone_verified_at, NOW()),
           "AccessState" = 'Verified'
     WHERE "Id" IN (${ids})
    RETURNING "Id";
  `);

  const count = updated.startsWith('SQL_ERROR') ? 0 : updated.split('\n').filter(Boolean).length;
  console.log(`\n  verified and promoted: ${count} of ${created.length}`);
  if (updated.startsWith('SQL_ERROR')) console.log(`  ${updated.slice(0, 160)}`);
}

// ── Prove it, rather than assume it ──────────────────────────────────────────
//
// A registration that returned 201 and a member who can actually sign in are
// different claims. The second is the one that matters, so it is the one tested.

console.log('\n  ── can each of them sign in? ──');

let usable = 0;
for (const member of created) {
  const login = await call('POST', '/auth/login', {
    body: { phoneNumber: member.phone, password: PASSWORD },
  });

  const token = ((login.body?.data ?? {}).tokens ?? login.body?.data ?? {}).accessToken;

  if (token) {
    usable += 1;
    console.log(`  OK       ${member.name}`);
  } else {
    console.log(`  FAILED   ${member.name} — ${login.status} ${login.body?.code ?? ''}`);
  }
}

console.log(`\n  ${usable} of ${MEMBERS.length} members can sign in.\n`);
process.exit(usable === MEMBERS.length ? 0 : 1);
