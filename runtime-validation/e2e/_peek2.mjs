import { call } from './e2e-harness.mjs';
const login = await call('POST', '/auth/login', {
  body: { phoneNumber: '+23481000902001', password: 'Yr5#dGkP7wLs' }, label: 'login' });
const d = login.body?.data ?? {};
const T = (d.tokens ?? d).accessToken;
const r = await call('GET', '/marketplace/listings/mine?limit=10', { token: T, label: 'mine' });
const items = r.body?.data?.items ?? r.body?.data ?? [];
console.log('status', r.status, 'count', items.length);
for (const i of items) console.log(' -', i.title, '| status =', i.status);
