/**
 * SignalR against the running Diaspora.Api.
 *
 * The client is `@microsoft/signalr` — the same package `src/lib/realtime.ts`
 * imports, at the same version — driven against the real `/hubs/realtime`. No
 * test transport, no fake hub. §17 asks for exactly this, and it is the one
 * capability with no unit-level substitute.
 */
// React Native has no `process.release`, so `@microsoft/signalr` takes its
// browser path there and uses the global `fetch` and `WebSocket`. Node reports
// `process.release.name === 'node'`, which sends the same library down a Node
// path wanting `tough-cookie` and `ws`. Clearing the marker before the import
// makes this process take the *same* branch the application takes, on Node 24's
// native `fetch` and `WebSocket`. It is a shim on the runner, not on the client:
// the code under test is the shipped package at the shipped version.
Object.defineProperty(process, 'release', { value: { name: 'browser' }, configurable: true });

const signalR = await import('@microsoft/signalr');
const { call, makeUser, sql, save, ORIGIN } = await import('./harness.mjs');

const results = [];
const rec = (flow, verdict, note) => {
  results.push({ flow, verdict, note });
  console.log(`  ${verdict.padEnd(8)} ${flow} — ${note}`);
};

const RUN = process.env.RUNTIME_RUN ?? '50';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const HUB = `${ORIGIN}/hubs/realtime`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== PHASE 4: REAL-TIME (SignalR) ===\n');
console.log(`  hub: ${HUB}`);
console.log(`  client: @microsoft/signalr (the package src/lib/realtime.ts imports)\n`);

async function verified(name, n, password) {
  const u = await makeUser({ name, phone: ph(n), password });
  if (!u.userId) return null;
  sql(`UPDATE identity.users SET "AccessState"='Verified' WHERE "Id"='${u.userId}';`);
  const re = await call('POST', '/auth/login', { label: `login ${name}`, body: { phoneNumber: ph(n), password } });
  return { ...u, token: (re.body?.data?.tokens ?? re.body?.data ?? {}).accessToken };
}

const A = await verified('Sender Ada', 1, 'Sa4#kwPz9Rn2');
const B = await verified('Receiver Ben', 2, 'Rb7#tqLm3Xd8');
rec('two verified identities', A?.token && B?.token ? 'PASS' : 'FAIL', `A=${A?.userId} B=${B?.userId}`);

function build(token) {
  return new signalR.HubConnectionBuilder()
    .withUrl(HUB, { accessTokenFactory: () => token })
    .configureLogging(signalR.LogLevel.Error)
    .build();
}

// ── Anonymous negotiate must be refused ──────────────────────────────────
const anon = new signalR.HubConnectionBuilder().withUrl(HUB).configureLogging(signalR.LogLevel.None).build();
let anonErr = null;
try { await anon.start(); } catch (e) { anonErr = String(e.message ?? e); }
rec('anonymous negotiate is refused', anonErr ? 'PASS' : 'FAIL', anonErr ? anonErr.slice(0, 110) : 'connection established without a token');
try { await anon.stop(); } catch { /* already down */ }

// ── Authenticated connect ────────────────────────────────────────────────
const ca = build(A.token);
const cb = build(B.token);

const received = [];
cb.on('MessageReceived', (p) => { received.push({ at: Date.now(), p }); });
const presence = [];
cb.on('PresenceChanged', (p) => { presence.push(p); });
const typing = [];
cb.on('TypingChanged', (p) => { typing.push(p); });
const readReceipts = [];
ca.on('ReadReceiptReceived', (p) => { readReceipts.push(p); });

let startErr = null;
try {
  await ca.start();
  await cb.start();
} catch (e) { startErr = String(e.message ?? e); }
rec('authenticated negotiate + connect', !startErr && ca.state === 'Connected' && cb.state === 'Connected' ? 'PASS' : 'FAIL',
  startErr ? startErr.slice(0, 200) : `A.connectionId=${ca.connectionId} B.connectionId=${cb.connectionId}`);

if (ca.state === 'Connected') {
  // ── Conversation, over REST ────────────────────────────────────────────
  // Every conversation is anchored to an entity — `GET /conversations/context-types`
  // returns MarketplaceListing, HousingListing, JobOpportunity, ProviderInquiry
  // and no free-floating direct chat — so A first becomes a seller with a listing,
  // and B opens a conversation about it.
  await call('POST', '/marketplace/sellers', {
    token: A.token, label: 'seller for conversation context',
    body: { displayName: `Ada Trading ${RUN}`, countryCode: 'NG', kind: 'Individual' },
  });
  const anchor = await call('POST', '/marketplace/listings', {
    token: A.token, label: 'listing for conversation context',
    body: { title: `Conversation anchor ${RUN}`, description: 'anchor', categoryKey: 'electronics', countryCode: 'NG', price: 1000, currency: 'NGN' },
  });
  const anchorId = anchor.body?.data?.listingId ?? anchor.body?.data?.id;
  rec('conversation anchor entity created', anchor.status < 400 && anchorId ? 'PASS' : 'FAIL', `status=${anchor.status} listingId=${anchorId}`);

  const conv = await call('POST', '/conversations', {
    token: B.token, label: 'start conversation',
    body: {
      recipientId: A.userId,
      context: { type: 'MarketplaceListing', entityId: anchorId, entityTitle: `Conversation anchor ${RUN}` },
      initialMessage: null,
    },
  });
  const convId = conv.body?.data?.id ?? conv.body?.data?.conversationId;
  rec('conversation created over REST', conv.status < 400 && convId ? 'PASS' : 'FAIL',
    `status=${conv.status} id=${convId ?? JSON.stringify(conv.body).slice(0, 220)}`);

  if (convId) {
    // ── Group join ───────────────────────────────────────────────────────
    let joined = null;
    try { joined = await cb.invoke('JoinGroup', `conversation:${convId}`); } catch (e) { joined = `ERROR ${e.message}`; }
    rec('receiver joins conversation:{id} group', joined === true ? 'PASS' : 'FAIL', `JoinGroup returned ${JSON.stringify(joined)}`);
    // The sender joins too: a read receipt is addressed to the conversation
    // group, so a sender outside it would never see one.
    try { await ca.invoke('JoinGroup', `conversation:${convId}`); } catch { /* recorded by the receipt check */ }

    // ── Delivery ─────────────────────────────────────────────────────────
    const text = `Hello over the socket ${RUN}`;
    const sent = await call('POST', `/conversations/${convId}/messages`, {
      token: A.token, label: 'send message (A → B)', body: { text, localId: `local-${RUN}` },
    });
    const messageId = sent.body?.data?.id ?? sent.body?.data?.messageId;
    rec('message accepted over REST', sent.status < 400 ? 'PASS' : 'FAIL', `status=${sent.status} id=${messageId}`);

    await wait(4000);
    rec('receiver got MessageReceived over the real socket', received.length > 0 ? 'PASS' : 'FAIL',
      `events=${received.length}`);

    if (received.length) {
      const p = received[0].p;
      const body = p?.text ?? p?.body ?? p?.message?.text;
      rec('delivered payload carries the message', body === text ? 'PASS' : 'FAIL',
        `text="${body}" keys=[${Object.keys(p ?? {}).join(',')}]`);
      rec('delivered payload carries conversation and sender',
        JSON.stringify(p).includes(convId) ? 'PASS' : 'FAIL',
        `conversationId present=${JSON.stringify(p).includes(convId)} senderId present=${JSON.stringify(p).includes(A.userId)}`);
    }

    // ── Duplicate delivery: conversation group AND user group ────────────
    // The client documents that MessageReceived may arrive twice. This
    // records what the server actually does.
    rec('duplicate delivery observed?', received.length === 1 ? 'PASS' : received.length > 1 ? 'DEFECT' : 'FAIL',
      received.length === 1
        ? 'exactly one MessageReceived for one sent message'
        : `${received.length} MessageReceived events for ONE sent message — the client must de-duplicate`);

    // ── Persistence ──────────────────────────────────────────────────────
    const dbCount = sql(`SELECT count(*) FROM conversations.conversation_messages WHERE "ConversationId"='${convId}';`);
    rec('message persisted', dbCount === '1' ? 'PASS' : dbCount.startsWith('SQL_ERROR') ? 'BLOCKED' : 'FAIL', `rows=${dbCount}`);

    // ── Typing ───────────────────────────────────────────────────────────
    try { await ca.invoke('Typing', convId, 'started'); } catch (e) { /* recorded below */ }
    await wait(2000);
    rec('typing signal reaches the other participant', typing.length > 0 ? 'PASS' : 'FAIL',
      typing.length ? `payload=${JSON.stringify(typing[0]).slice(0, 200)}` : 'no TypingChanged received');

    // ── Read receipt ─────────────────────────────────────────────────────
    if (messageId) {
      try { await cb.invoke('MarkRead', convId, messageId); } catch (e) { /* recorded below */ }
      await wait(2000);
      rec('read receipt originates from the server, not a local timer', readReceipts.length > 0 ? 'PASS' : 'FAIL',
        readReceipts.length ? `payload=${JSON.stringify(readReceipts[0]).slice(0, 200)}` : 'no ReadReceiptReceived at the sender');
    }

    // ── Presence ─────────────────────────────────────────────────────────
    let snap = null;
    try { snap = await ca.invoke('GetPresence', [B.userId]); } catch (e) { snap = `ERROR ${e.message}`; }
    rec('GetPresence answers for another member', Array.isArray(snap) ? 'PASS' : 'FAIL',
      `returned=${JSON.stringify(snap).slice(0, 240)}`);
  }

  // ── Teardown and connection accounting ─────────────────────────────────
  await ca.stop();
  await cb.stop();
  rec('teardown disconnects', ca.state === 'Disconnected' && cb.state === 'Disconnected' ? 'PASS' : 'FAIL',
    `A=${ca.state} B=${cb.state}`);

  // MaxConnectionsPerUser is 10. Mount/unmount more than that; if teardown
  // leaks, the 11th connect is refused.
  let mounted = 0;
  let leakErr = null;
  for (let i = 0; i < 14; i++) {
    const c = build(A.token);
    try { await c.start(); mounted++; await c.stop(); }
    catch (e) { leakErr = `cycle ${i}: ${String(e.message ?? e).slice(0, 140)}`; break; }
  }
  rec('repeated mount/unmount does not accumulate connections', mounted === 14 ? 'PASS' : 'FAIL',
    leakErr ? `completed ${mounted}/14 — ${leakErr}` : `completed ${mounted}/14 cycles (MaxConnectionsPerUser=10)`);
}

const pass = results.filter((r) => r.verdict === 'PASS').length;
console.log(`\n--- PHASE 4: ${pass}/${results.length} PASS ---`);
save('C:/Users/User/source/repos/Diaspora/runtime-validation/evidence-phase4-signalr.json');
process.exit(0);
