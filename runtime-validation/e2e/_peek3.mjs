import { call } from './e2e-harness.mjs';
const login = await call('POST', '/auth/login', {
  body: { phoneNumber: '+23481000902001', password: 'Yr5#dGkP7wLs' }, label: 'login' });
const T = ((login.body?.data ?? {}).tokens ?? login.body?.data ?? {}).accessToken;
const r = await call('GET', '/conversations?limit=10', { token: T, label: 'conversations' });
const d = r.body?.data;
console.log('status', r.status);
console.log('typeof data       :', Array.isArray(d) ? 'ARRAY' : typeof d);
console.log('data keys         :', d && !Array.isArray(d) ? Object.keys(d).join(',') : '(array)');
console.log('data.items is array:', Array.isArray(d?.items));
