import { call, verifiedUser } from './e2e-harness.mjs';

// The walkthrough member signs in; a second member is created to talk to.
const login = await call('POST', '/auth/login', {
  body: { phoneNumber: '+23481000902001', password: 'Yr5#dGkP7wLs' }, label: 'login walkthrough member' });
const T = ((login.body?.data ?? {}).tokens ?? login.body?.data ?? {}).accessToken;
if (!T) { console.log('no token', login.status); process.exit(1); }

const other = await verifiedUser({
  name: 'Chidi Sender', phone: '+23481000998001', password: 'Yr5#dGkP8wLs' });
if (!other.token) { console.log('no second member'); process.exit(1); }

// The OTHER member opens it, so the walkthrough member is the recipient and the
// person they would report is the one who messaged them.
const conv = await call('POST', '/conversations', {
  token: other.token, label: 'open a conversation',
  body: {
    recipientId: '4f7e0fa8-ce77-4798-b2c0-91c09b532d05',
    context: { type: 'PrivateConversation', entityId: '4f7e0fa8-ce77-4798-b2c0-91c09b532d05' },
    initialMessage: 'Hello — seeded so the report control has a real subject.',
  },
});
console.log('conversation', conv.status, JSON.stringify(conv.body?.data ?? conv.body).slice(0, 300));
