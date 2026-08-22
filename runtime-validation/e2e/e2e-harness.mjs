/**
 * Shared helpers for the Final Runtime Gap Closure / E2E completion phase.
 *
 * Extends `../harness.mjs` with the two things the earlier phases never needed:
 * a multipart upload (the media pipeline is the prerequisite for marketplace
 * publication) and a Verified identity factory that does not re-derive the
 * access ladder on every script.
 */
import { Buffer } from 'node:buffer';
import { call, makeUser, sql, evidence, ORIGIN } from '../harness.mjs';

export { call, sql, evidence, save } from '../harness.mjs';

const BASE = `${ORIGIN}/v1`;

/** A real 8x8 PNG — 4 solid quadrants, so a derived thumbnail is still an image. */
export function samplePng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAKklEQVR42mP8z8DwnwEP' +
    'YMSngIlhFIyCUTAKRsEoGAWjYBSMglEwCkYBAA0bAgFvQZ2iAAAAAElFTkSuQmCC',
    'base64'
  );
}

/**
 * One real multipart upload, recorded in the same evidence stream as every
 * other call so the journey reads as one sequence.
 *
 * Built by hand rather than with `FormData` because the recorder needs the
 * exact bytes and content type that left the process, and because this is the
 * shape `src/lib/media-api.ts:toFormData` produces on the device.
 */
export async function uploadDirect(token, { fileName = 'e2e-cover.png', contentType = 'image/png', kind = 'image', bytes = samplePng(), ownerType, ownerId, role, label = 'media upload direct' } = {}) {
  const boundary = `----diasporaE2E${Math.random().toString(16).slice(2)}`;
  const parts = [];
  const field = (name, value) =>
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`));
  parts.push(bytes);
  parts.push(Buffer.from('\r\n'));
  field('kind', kind);
  if (ownerType) field('ownerType', ownerType);
  if (ownerId) field('ownerId', ownerId);
  if (role) field('role', role);
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);
  const t0 = performance.now();
  const correlationId = `E2E-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  let res, text;
  try {
    res = await fetch(`${BASE}/media/uploads/direct`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Correlation-Id': correlationId,
      },
      body,
    });
    text = await res.text();
  } catch (err) {
    const rec = { label, correlationId, method: 'POST', url: `${BASE}/media/uploads/direct`, status: 0, error: String(err) };
    evidence.push(rec);
    return rec;
  }
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const rec = {
    label, correlationId, method: 'POST', url: `${BASE}/media/uploads/direct`,
    status: res.status, ms: +(performance.now() - t0).toFixed(1),
    requestBody: { multipart: true, fileName, contentType, kind, bytes: bytes.length, ownerType, ownerId, role },
    body: json ?? text?.slice(0, 2000) ?? null,
  };
  evidence.push(rec);
  return rec;
}

/**
 * A member on the Verified rung.
 *
 * `POST /trust/decisions` is `PermissionAudience.Service`, so no human role can
 * promote anyone; the rung is seeded and the identity signs in again to obtain
 * a token that carries it. Documented in `runtime-validation/README.md`.
 */
export async function verifiedUser({ name, phone, password, nationality = 'NG', country = 'NG' }) {
  const u = await makeUser({ name, phone, password, nationality, country });
  if (!u.userId) return { ...u, token: null };
  sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
  const re = await call('POST', '/auth/login', { label: `re-login ${name}`, body: { phoneNumber: phone, password } });
  const d = re.body?.data ?? {};
  return { ...u, token: (d.tokens ?? d).accessToken ?? null };
}

/** A result line, printed as it happens and collected for the evidence file. */
export function recorder(results) {
  return (domain, flow, verdict, note) => {
    results.push({ domain, flow, verdict, note });
    console.log(`  ${verdict.padEnd(9)} [${domain}] ${flow} — ${note}`);
  };
}
