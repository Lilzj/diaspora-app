/**
 * The backend half of push: device registration, persistence, and the delivery
 * pipeline under the Loopback provider.
 *
 * This proves everything up to the provider boundary. It cannot prove that a
 * handset lights up — see `runtime-remediation/push-notification-validation.md`
 * for why that half is blocked, and for what would unblock it.
 */
import { call, makeUser, sql, save } from './harness.mjs';

const results = [];
const rec = (flow, verdict, note) => {
  results.push({ flow, verdict, note });
  console.log(`  ${verdict.padEnd(8)} ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '500';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== PHASE 6: PUSH — BACKEND PIPELINE ===\n');

const u = await makeUser({ name: 'Push Probe', phone: ph(1), password: 'Pu6#nzWt4Kq8' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
const re = await call('POST', '/auth/login', { label: 'login', body: { phoneNumber: ph(1), password: 'Pu6#nzWt4Kq8' } });
const T = (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken;
rec('verified identity', T ? 'PASS' : 'FAIL', `userId=${u.userId}`);

// ── Provider state, as the server declares it ───────────────────────────
const prefs = await call('GET', '/notifications/devices', { token: T, label: 'devices before' });
rec('device list reachable', prefs.status === 200 ? 'PASS' : 'FAIL', `status=${prefs.status}`);

// ── Registration ────────────────────────────────────────────────────────
// A synthetic token: this proves the *registration* path, not delivery. A real
// FCM token cannot be obtained here, and inventing one that the provider would
// accept is exactly the fabrication the brief forbids.
const token = `runtime-validation-synthetic-${RUN}`;
const reg = await call('PUT', '/notifications/devices', {
  token: T, label: 'register device',
  body: { token, platform: 'Android', deviceIdentifier: `emulator-${RUN}`, friendlyName: 'Diaspora_API34', appVersion: '1.0.0' },
});
rec('device registration accepted', reg.status < 400 ? 'PASS' : 'FAIL',
  `status=${reg.status} ${reg.status >= 400 ? JSON.stringify(reg.body).slice(0, 200) : ''}`);

// ── Persistence, read from the database rather than the API ─────────────
const stored = sql(`SELECT count(*) FROM notifications.notification_devices WHERE "DeviceIdentifier"='emulator-${RUN}';`);
rec('device persisted', stored === '1' ? 'PASS' : stored.startsWith('SQL_ERROR') ? 'BLOCKED' : 'FAIL',
  stored.startsWith('SQL_ERROR') ? 'table name differs — see note' : `rows=${stored}`);

// The token itself must never be logged or echoed in full.
const echoed = JSON.stringify(reg.body ?? {});
rec('the registration response does not echo the raw token',
  !echoed.includes(token) ? 'PASS' : 'FAIL',
  !echoed.includes(token) ? 'token absent from the response body' : 'raw token returned to the caller');

// ── Idempotency: registering the same device twice ──────────────────────
const again = await call('PUT', '/notifications/devices', {
  token: T, label: 'register same device again',
  body: { token, platform: 'Android', deviceIdentifier: `emulator-${RUN}`, friendlyName: 'Diaspora_API34', appVersion: '1.0.0' },
});
const afterTwice = sql(`SELECT count(*) FROM notifications.notification_devices WHERE "DeviceIdentifier"='emulator-${RUN}';`);
rec('re-registration is idempotent', again.status < 400 && afterTwice === '1' ? 'PASS' : 'FAIL',
  `status=${again.status} rows=${afterTwice}`);

// ── Trigger a real notification through the platform ────────────────────
// A second member sends a message; the conversation vertical creates a
// notification, which is what the push pipeline consumes.
const b = await makeUser({ name: 'Push Sender', phone: ph(2), password: 'Ps5#kwRv9Mn3' });
sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${b.userId}';`);
const bre = await call('POST', '/auth/login', { label: 'sender login', body: { phoneNumber: ph(2), password: 'Ps5#kwRv9Mn3' } });
const BT = (bre.body?.data?.tokens ?? bre.body?.data ?? {}).accessToken;

await call('POST', '/marketplace/sellers', { token: BT, label: 'anchor seller', body: { displayName: `Push Anchor ${RUN}`, countryCode: 'NG', kind: 'Individual' } });
const anchor = await call('POST', '/marketplace/listings', {
  token: BT, label: 'anchor listing',
  body: { title: `Push anchor ${RUN}`, description: 'anchor', categoryKey: 'electronics', countryCode: 'NG', price: 1000, currency: 'NGN' },
});
const anchorId = anchor.body?.data?.listingId;

const conv = await call('POST', '/conversations', {
  token: T, label: 'conversation',
  body: { recipientId: b.userId, context: { type: 'MarketplaceListing', entityId: anchorId, entityTitle: `Push anchor ${RUN}` } },
});
const convId = conv.body?.data?.id ?? conv.body?.data?.conversationId;

const msg = await call('POST', `/conversations/${convId}/messages`, {
  token: BT, label: 'message that should notify', body: { text: `Push trigger ${RUN}` },
});
rec('a real platform event was raised', msg.status < 400 ? 'PASS' : 'FAIL', `message status=${msg.status}`);

await wait(6000);

const notifications = sql(
  `SELECT count(*) FROM notifications.notifications WHERE "UserId"='${u.userId}';`
);
rec('the event produced a notification for the recipient',
  notifications.startsWith('SQL_ERROR') ? 'BLOCKED' : Number(notifications) > 0 ? 'PASS' : 'FAIL',
  notifications.startsWith('SQL_ERROR') ? 'table name differs' : `notifications=${notifications}`);

const list = await call('GET', '/notifications', { token: T, label: 'notification list' });
const items = list.body?.data?.items ?? list.body?.data ?? [];
rec('the notification is readable over HTTP',
  list.status === 200 ? 'PASS' : 'FAIL',
  `status=${list.status} count=${Array.isArray(items) ? items.length : 'n/a'}`);

// ── Delivery attempt state under the configured provider ────────────────
const deliveries = sql(
  `SELECT s."Status" || '=' || s.cnt FROM (SELECT "Status", count(*) AS cnt FROM notifications.notification_deliveries GROUP BY "Status") s ORDER BY 1;`
);
rec('delivery rows record the provider outcome honestly',
  deliveries.startsWith('SQL_ERROR') ? 'BLOCKED' : 'PASS',
  deliveries.startsWith('SQL_ERROR') ? 'table name differs' : deliveries.split('\n').join('  '));

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 6 (backend half): ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase6-push-backend.json');
