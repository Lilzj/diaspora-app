/**
 * Diaspora — Frontend ↔ Backend runtime integration harness.
 *
 * Drives real HTTP against a running Diaspora.Api. Every call is recorded with
 * its request, response, status, timing and correlation id, so a reader can
 * reproduce any single line of the report from the evidence file alone.
 *
 * It addresses the API through `/v1/*` — the alias the mobile client actually
 * uses — rather than the canonical `/api/v1/*`, because the thing under test is
 * the pair of programs, not the backend alone.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const ORIGIN = process.env.RUNTIME_API_ORIGIN ?? 'http://127.0.0.1:5099';
export const BASE = `${ORIGIN}/v1`;
export const API_LOG = process.env.RUNTIME_API_LOG;
const PSQL = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const DB = process.env.RUNTIME_DB ?? 'diaspora_dev';

export const evidence = [];
let seq = 0;

/** One real HTTP round trip, recorded. */
export async function call(method, path, { token, body, headers = {}, label } = {}) {
  const correlationId = `RV-${String(++seq).padStart(4, '0')}`;
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const h = { 'X-Correlation-Id': correlationId, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let res, text;
  try {
    res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    text = await res.text();
  } catch (err) {
    const rec = { seq, label, correlationId, method, url, startedAt, error: String(err), status: 0 };
    evidence.push(rec);
    return rec;
  }
  const ms = +(performance.now() - t0).toFixed(1);

  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  const rec = {
    seq, label, correlationId, method, url,
    status: res.status,
    contentType: res.headers.get('content-type'),
    startedAt, ms,
    requestBody: redact(body),
    body: json ?? text?.slice(0, 4000) ?? null,
  };
  evidence.push(rec);
  return rec;
}

/** Never write a credential into the evidence file. */
function redact(o) {
  if (!o || typeof o !== 'object') return o;
  const out = Array.isArray(o) ? [...o] : { ...o };
  for (const k of Object.keys(out)) {
    if (/password|token|secret|code|otp/i.test(k)) out[k] = '<redacted>';
    else if (out[k] && typeof out[k] === 'object') out[k] = redact(out[k]);
  }
  return out;
}

/** Read the backend's own log — the proof a request was served by this process. */
export function backendLog(pattern, tailLines = 4000) {
  if (!API_LOG) return [];
  const lines = readFileSync(API_LOG, 'utf8').split(/\r?\n/).slice(-tailLines);
  return lines.filter((l) => l.includes(pattern));
}

/** Re-reads `probe` until it returns something truthy, or the attempts run out. */
export async function pollFor(probe, { attempts = 20, everyMs = 150 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const value = probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  return null;
}

/** Development-only OTP delivery writes the live code to the application log. */
export function otpFor(phone) {
  const hits = backendLog(`code for ${phone} is`);
  if (!hits.length) return null;
  return hits[hits.length - 1].match(/is (\d{4,8})/)?.[1] ?? null;
}

/** Independent persistence check — the database, not the API's own read path. */
export function sql(query) {
  try {
    return execFileSync(PSQL, ['-h', '127.0.0.1', '-U', 'postgres', '-d', DB, '-tAc', query],
      { env: { ...process.env, PGPASSWORD: 'postgres' }, encoding: 'utf8' }).trim();
  } catch (err) {
    return `SQL_ERROR: ${err.stderr ?? err.message}`;
  }
}

export function save(file) {
  writeFileSync(file, JSON.stringify(evidence, null, 1));
  return evidence.length;
}

/** A registered, phone-verified, signed-in identity. */
export async function makeUser({ name, phone, password, nationality = 'NG', country = 'NG' }) {
  const reg = await call('POST', '/auth/register', {
    label: `register ${name}`,
    body: { fullName: name, phoneNumber: phone, password, nationality, countryOfResidence: country },
  });
  if (reg.status !== 201) return { ok: false, stage: 'register', reg };

  // The code is read out of the application log, and the log is written by a
  // different process on its own flush schedule. Reading once immediately after
  // the 201 loses the race often enough to matter: the harness reports
  // `otp-not-logged`, the gate reports the setup as FAIL, and that is
  // indistinguishable from a real registration regression. So it waits.
  const code = await pollFor(() => otpFor(phone), { attempts: 20, everyMs: 150 });
  if (!code) return { ok: false, stage: 'otp-not-logged', reg };

  const ver = await call('POST', '/auth/verify-phone', {
    label: `verify ${name}`,
    body: { phoneNumber: phone, code },
  });
  if (ver.status >= 400) return { ok: false, stage: 'verify', reg, ver };

  const login = await call('POST', '/auth/login', {
    label: `login ${name}`,
    body: { phoneNumber: phone, password },
  });

  const d = login.body?.data ?? ver.body?.data ?? {};
  const tokens = d.tokens ?? d;
  return {
    ok: !!tokens?.accessToken,
    userId: reg.body?.data?.userId,
    phone, password, name,
    accessToken: tokens?.accessToken,
    refreshToken: tokens?.refreshToken,
    reg, ver, login,
  };
}
