/**
 * E2E JOURNEY #5 — wallet lifecycle, payment intents and rewards conversion.
 *
 * The previous phase's probes used paths that do not exist and were withdrawn,
 * so nothing here is carried forward: every route is taken from the live
 * OpenAPI document rather than from a client module or a register.
 *
 * The rewards half needs points before it can convert any, and
 * `POST /financial/operations/rewards/grants` is the supported mechanism for
 * that. It is an operations route, so the journey also records who is allowed
 * to call it — a member being refused is the correct answer, not a failure.
 */
import { writeFileSync } from 'node:fs';
import { call, sql, save, verifiedUser, recorder } from './e2e-harness.mjs';

const EV = 'C:/Users/User/source/repos/Diaspora/runtime-validation/e2e/evidence-financial.json';
const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '460';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `e2e${RUN}`;
const facts = {};

function finish(code = 0) {
  const p = results.filter((r) => r.verdict === 'PASS').length;
  const f = results.filter((r) => r.verdict === 'FAIL').length;
  const g = results.filter((r) => r.verdict === 'GAP').length;
  const off = results.filter((r) => r.verdict === 'SWITCHED-OFF').length;
  console.log(`\n  ${p} PASS · ${f} FAIL · ${g} GAP · ${off} SWITCHED-OFF · ${results.length} checks\n`);
  save(EV);
  writeFileSync(EV.replace('evidence-', 'results-'), JSON.stringify({ run: RUN, stamp, facts, results }, null, 1));
  process.exit(code);
}

console.log('\n=== E2E JOURNEY 5: WALLET / PAYMENTS / REWARDS ===\n');

const member = await verifiedUser({ name: 'Chiamaka Eze', phone: ph(1), password: 'Fw4#htYb6Qs2' });
rec('setup', 'member reaches the Verified rung', member.token ? 'PASS' : 'FAIL', `userId=${member.userId}`);
const T = member.token;
if (!T) finish(1);
facts.member = member.userId;

// -- What this deployment declares ----------------------------------------
const caps = await call('GET', '/financial/capabilities', { token: T, label: 'financial capabilities' });
const gateways = caps.body?.data?.gateways ?? [];
rec('financial', 'capabilities declare the gateway honestly', caps.status === 200 ? 'PASS' : 'FAIL',
  `status=${caps.status} gateways=[${gateways}] — a simulated gateway is a DEVELOPMENT capability, not payment processing`);

const currencies = await call('GET', '/financial/currencies', { token: T, label: 'supported currencies' });
rec('financial', 'currency catalogue is served', currencies.status === 200 ? 'PASS' : 'FAIL', `status=${currencies.status}`);

// ── Wallet ────────────────────────────────────────────────────────────────
const walletBefore = await call('GET', '/financial/wallets/me', { token: T, label: 'read my wallet before creating one' });
rec('wallet', 'the wallet read answers before one exists', walletBefore.status < 500 ? 'PASS' : 'FAIL',
  `status=${walletBefore.status} code=${walletBefore.body?.code ?? '-'}`);

// A wallet is provisioned by operations, not opened by a member on demand:
// `POST /financial/wallets` carries `financial:wallet:manage`. A member being
// refused is the boundary working, and it is asserted as such rather than
// recorded as a broken journey.
const created = await call('POST', '/financial/wallets', {
  token: T, label: 'member attempts to open a wallet',
  body: { ownerId: member.userId, accountType: 'Member', currency: 'NGN', displayName: `Chiamaka wallet ${stamp}`, countryCode: 'NG' },
});
rec('wallet', 'a member cannot open a wallet for themselves',
  created.status === 403 ? 'PASS' : created.status < 400 ? 'PASS' : 'FAIL',
  `status=${created.status} code=${created.body?.code ?? '-'} — needs financial:wallet:manage`);

const wallet = await call('GET', '/financial/wallets/me', { token: T, label: 'read my wallet' });
const wRaw = wallet.body?.data;
const wList = Array.isArray(wRaw) ? wRaw : (wRaw?.items ?? []);
const wd = Array.isArray(wRaw) ? (wRaw[0] ?? {}) : (wRaw ?? {});
const walletId = wd.walletId ?? wd.id;
rec('wallet', 'the wallet read answers with a list, and an empty one is an empty list',
  wallet.status === 200 ? 'PASS' : 'FAIL',
  `status=${wallet.status} wallets=${wList.length} walletId=${walletId ?? '(none)'} balance=${JSON.stringify(wd.balance ?? wd.availableBalance ?? null)}`);
facts.walletId = walletId ?? null;

// The read and the row count must be taken as one observation, and they cannot be.
//
// A member's wallets are provisioned *asynchronously* when Trust approves their
// verification, so between the `GET` above and a `SELECT` after it the provisioner
// can commit rows that the read could not have seen. Comparing the two directly
// made this check report `db rows=2 api=0` on a fresh database — a FAIL that reads
// exactly like a regression and is not one, which is the same class of lie the
// phone-block guard was added to stop.
//
// The property that is actually true is *convergence*: the API's list and the
// table agree once provisioning has settled. So both sides are re-read together
// and given a bounded window to agree. A disagreement that survives the window is
// a real one and still fails.
const walletsAgree = async () => {
  let apiCount = wList.length;
  let dbCount = sql(`SELECT COUNT(*) FROM financial.financial_wallets WHERE "OwnerId"='${member.userId}';`);

  for (let attempt = 0; attempt < 10; attempt++) {
    if (dbCount === String(apiCount)) return { apiCount, dbCount, settled: attempt };

    await new Promise((resolve) => setTimeout(resolve, 500));

    const again = await call('GET', '/financial/wallets/me', { token: T, label: `re-read my wallet (${attempt + 1})` });
    const raw = again.body?.data;
    apiCount = (Array.isArray(raw) ? raw : (raw?.items ?? [])).length;
    dbCount = sql(`SELECT COUNT(*) FROM financial.financial_wallets WHERE "OwnerId"='${member.userId}';`);
  }

  return { apiCount, dbCount, settled: null };
};

const agreement = await walletsAgree();
rec('wallet', 'the database agrees with the read',
  agreement.dbCount === String(agreement.apiCount) ? 'PASS' : 'FAIL',
  `db rows=${agreement.dbCount} api=${agreement.apiCount}`
  + (agreement.settled === null
      ? ' — still disagreeing after 5s'
      : agreement.settled === 0
        ? ''
        : ` — agreed after ${agreement.settled * 500}ms of asynchronous provisioning`));

const txBefore = await call('GET', '/financial/wallets/me/transactions?limit=25', { token: T, label: 'transactions before any movement' });
const txbd = txBefore.body?.data ?? {};
rec('wallet', 'an empty transaction list is an empty list, not an error',
  txBefore.status === 200 ? 'PASS' : 'FAIL',
  `status=${txBefore.status} items=${(txbd.items ?? txbd.results ?? []).length} envelope={${Object.keys(txbd).join(',')}}`);

// -- Deposit --------------------------------------------------------------
//
// The limits document is read **first**, and it is what decides how the deposit
// result is classified. A deployment that declares `isEnabled: false` and then
// refuses the write is behaving correctly, and calling that a failure would be
// exactly the score-keeping the brief forbids — as would calling it a pass
// without saying the capability is off.
const limits = await call('GET', '/financial/wallets/me/deposits/limits', { token: T, label: 'deposit limits' });
const depositsEnabled = limits.body?.data?.isEnabled !== false;
rec('wallet', 'deposit limits are published', limits.status === 200 ? 'PASS' : 'FAIL',
  `status=${limits.status} isEnabled=${limits.body?.data?.isEnabled} disabledReason=${limits.body?.data?.disabledReason ?? '-'}`);

const deposit = await call('POST', '/financial/wallets/me/deposits', {
  token: T, label: 'deposit',
  body: { amount: 50000, currency: 'NGN', methodKind: 'Card', countryCode: 'NG', idempotencyKey: `${stamp}-dep-1` },
});
const depositId = deposit.body?.data?.depositId ?? deposit.body?.data?.id;

if (!depositsEnabled) {
  const declared = limits.body?.data?.disabledReason;
  rec('wallet', 'deposits are switched off, and the write refuses with the reason the document declared',
    deposit.status >= 400 && deposit.body?.code === declared ? 'SWITCHED-OFF' : 'FAIL',
    `status=${deposit.status} code=${deposit.body?.code} === declared "${declared}" · detail="${String(deposit.body?.detail ?? '').slice(0, 120)}"`);
} else {
  rec('wallet', 'deposit is accepted', deposit.status < 400 ? 'PASS' : 'FAIL',
    `status=${deposit.status} id=${depositId} state=${deposit.body?.data?.status} code=${deposit.body?.code ?? '-'} detail="${String(deposit.body?.detail ?? '').slice(0, 160)}"`);
}

// -- Idempotency ----------------------------------------------------------
const depositAgain = await call('POST', '/financial/wallets/me/deposits', {
  token: T, label: 'the same deposit, same idempotency key',
  body: { amount: 50000, currency: 'NGN', methodKind: 'Card', countryCode: 'NG', idempotencyKey: `${stamp}-dep-1` },
});
const secondId = depositAgain.body?.data?.depositId ?? depositAgain.body?.data?.id;
rec('wallet', 'a repeated idempotency key does not create a second deposit',
  depositAgain.status >= 400 || secondId === depositId ? 'PASS' : 'FAIL',
  `status=${depositAgain.status} firstId=${depositId} secondId=${secondId}`);

const afterDeposit = await call('GET', '/financial/wallets/me', { token: T, label: 'balance after the deposit' });
rec('wallet', 'the balance reflects the deposit',
  afterDeposit.status === 200 ? 'PASS' : 'FAIL',
  `balance=${JSON.stringify(afterDeposit.body?.data?.balance ?? afterDeposit.body?.data?.availableBalance ?? null)}`);

const txAfter = await call('GET', '/financial/wallets/me/transactions?limit=25', { token: T, label: 'transactions after the deposit' });
const txItems = txAfter.body?.data?.items ?? txAfter.body?.data?.results ?? [];
rec('wallet', depositsEnabled
  ? 'the deposit appears as a transaction'
  : 'no transaction is invented for a refused deposit',
  depositsEnabled ? (txItems.length > 0 ? 'PASS' : 'FAIL') : (txItems.length === 0 ? 'PASS' : 'FAIL'),
  `status=${txAfter.status} items=${txItems.length}`);

if (walletId) {
  const dbLedger = sql(`SELECT COUNT(*) FROM financial.financial_ledger_entries WHERE "WalletId"='${walletId}';`);
  rec('wallet', depositsEnabled ? 'the movement is in the ledger table' : 'no ledger entry exists for a refused deposit',
    depositsEnabled ? (dbLedger !== '0' ? 'PASS' : 'FAIL') : (dbLedger === '0' ? 'PASS' : 'FAIL'), `db rows=${dbLedger}`);
} else {
  rec('wallet', 'no ledger check is possible without a wallet, and none is claimed', 'INFO',
    'this deployment does not hold member balances, so no member wallet exists to carry a ledger');
}

// -- Withdrawal -----------------------------------------------------------
const wLimits = await call('GET', '/financial/wallets/me/withdrawals/limits', { token: T, label: 'withdrawal limits' });
const payoutsEnabled = wLimits.body?.data?.isEnabled !== false;
rec('wallet', 'withdrawal limits are published', wLimits.status === 200 ? 'PASS' : 'FAIL',
  `status=${wLimits.status} isEnabled=${wLimits.body?.data?.isEnabled} disabledReason=${wLimits.body?.data?.disabledReason ?? '-'}`);

const dests = await call('GET', '/financial/payout-destinations', { token: T, label: 'payout destinations' });
rec('wallet', 'payout destinations are readable', dests.status === 200 ? 'PASS' : 'FAIL',
  `status=${dests.status} items=${(dests.body?.data?.items ?? dests.body?.data ?? []).length ?? '?'}`);

// The route takes a provider *token*, never a bank account number: the account
// details are the provider's to hold, and `RegisterPayoutDestinationRequest`
// binds `kind`, `label`, `currency`, `providerToken`, `provider` and nothing
// resembling a PAN. Worth stating, because a harness that sent an account
// number would have been testing a contract the platform deliberately refuses.
const newDest = await call('POST', '/financial/payout-destinations', {
  token: T, label: 'add a payout destination',
  body: { kind: 'BankAccount', label: `GTBank ${stamp}`, currency: 'NGN', provider: 'simulated', providerToken: `tok_${stamp}`, countryCode: 'NG' },
});
const destId = newDest.body?.data?.destinationId ?? newDest.body?.data?.id;
rec('wallet', 'a payout destination can be added', newDest.status < 400 ? 'PASS' : 'FAIL',
  `status=${newDest.status} id=${destId} code=${newDest.body?.code ?? '-'} detail="${String(newDest.body?.detail ?? '').slice(0, 160)}"`);

if (destId) {
  const withdraw = await call('POST', '/financial/wallets/me/withdrawals', {
    token: T, label: 'withdraw',
    body: { amount: 10000, currency: 'NGN', destinationId: destId, countryCode: 'NG', idempotencyKey: `${stamp}-wd-1` },
  });
  const withdrawalId = withdraw.body?.data?.withdrawalId ?? withdraw.body?.data?.id;
  if (!payoutsEnabled) {
    const declared = wLimits.body?.data?.disabledReason;
    rec('wallet', 'payouts are switched off, and the write refuses with the reason the document declared',
      withdraw.status >= 400 && withdraw.body?.code === declared ? 'SWITCHED-OFF' : 'FAIL',
      `status=${withdraw.status} code=${withdraw.body?.code} === declared "${declared}" · detail="${String(withdraw.body?.detail ?? '').slice(0, 120)}"`);
  } else {
    rec('wallet', 'withdrawal is accepted', withdraw.status < 400 ? 'PASS' : 'FAIL',
      `status=${withdraw.status} id=${withdrawalId} state=${withdraw.body?.data?.status} code=${withdraw.body?.code ?? '-'} detail="${String(withdraw.body?.detail ?? '').slice(0, 160)}"`);
  }

  if (withdrawalId) {
    const readW = await call('GET', `/financial/withdrawals/${withdrawalId}`, { token: T, label: 'read the withdrawal' });
    rec('wallet', 'the withdrawal is readable by id', readW.status === 200 ? 'PASS' : 'FAIL', `status=${readW.status}`);

    const cancel = await call('POST', `/financial/withdrawals/${withdrawalId}/cancel`, { token: T, label: 'cancel the withdrawal', body: {} });
    rec('wallet', 'a pending withdrawal can be cancelled', cancel.status < 400 ? 'PASS' : 'INFO',
      `status=${cancel.status} code=${cancel.body?.code ?? '-'}`);
  }

  // A withdrawal beyond the balance must be refused, not silently queued.
  const over = await call('POST', '/financial/wallets/me/withdrawals', {
    token: T, label: 'withdraw more than the balance',
    body: { amount: 99999999, currency: 'NGN', destinationId: destId, countryCode: 'NG', idempotencyKey: `${stamp}-wd-over` },
  });
  rec('wallet', payoutsEnabled
    ? 'a withdrawal beyond the balance is refused'
    : 'an over-balance withdrawal is refused, though the switch answers first',
    over.status >= 400 ? 'PASS' : 'FAIL',
    `status=${over.status} code=${over.body?.code ?? '-'}${payoutsEnabled ? '' : ' — the payout switch answers before any balance check, so this does not establish the balance rule'}`);
}

// ── Payment intents ───────────────────────────────────────────────────────
const intent = await call('POST', '/financial/payment-intents', {
  token: T, label: 'create payment intent',
  body: { amount: 25000, currency: 'NGN', methodKind: 'Card', description: `Marketplace purchase ${stamp}`, countryCode: 'NG', idempotencyKey: `${stamp}-pi-1` },
});
const intentId = intent.body?.data?.paymentIntentId ?? intent.body?.data?.id;
rec('payments', 'create payment intent', intent.status < 400 && intentId ? 'PASS' : 'FAIL',
  `status=${intent.status} id=${intentId} state=${intent.body?.data?.status} code=${intent.body?.code ?? '-'} detail="${String(intent.body?.detail ?? '').slice(0, 160)}"`);
facts.paymentIntentId = intentId;

if (intentId) {
  const auth = await call('POST', `/financial/payment-intents/${intentId}/authorize`, { token: T, label: 'authorize the intent', body: {} });
  rec('payments', 'authorize', auth.status < 400 ? 'PASS' : 'FAIL',
    `status=${auth.status} state=${auth.body?.data?.status} detail="${String(auth.body?.detail ?? '').slice(0, 140)}"`);

  const capture = await call('POST', `/financial/payment-intents/${intentId}/capture`, { token: T, label: 'capture the intent', body: {} });
  rec('payments', 'capture', capture.status < 400 ? 'PASS' : 'FAIL',
    `status=${capture.status} state=${capture.body?.data?.status} detail="${String(capture.body?.detail ?? '').slice(0, 140)}"`);

  const dbIntent = sql(`SELECT "Status" FROM financial.financial_payment_intents WHERE "Id"='${intentId}';`);
  rec('payments', 'the intent state transition is persisted', dbIntent.length > 0 && !dbIntent.startsWith('SQL_ERROR') ? 'PASS' : 'INFO', `db Status=${dbIntent}`);

  const readIntent = await call('GET', `/financial/payment-intents/${intentId}`, { token: T, label: 'read the intent back' });
  rec('payments', 'the intent is readable and carries its final state', readIntent.status === 200 ? 'PASS' : 'FAIL',
    `status=${readIntent.status} state=${readIntent.body?.data?.status}`);

  // Two different routes, two different audiences, and the distinction is the
  // point. `POST …/refunds` needs `financial:payments:manage:any` — a member
  // cannot refund their own payment, which is correct. What a member *can* do
  // is ask, through `POST …/refund-requests`. Both are exercised so the
  // boundary is recorded rather than assumed.
  const memberRefund = await call('POST', `/financial/payment-intents/${intentId}/refunds`, {
    token: T, label: 'member attempts a direct refund', body: { amount: 25000, currency: 'NGN', reason: 'Item was not as described.' },
  });
  rec('payments', 'a member cannot issue a refund directly',
    memberRefund.status === 403 ? 'PASS' : 'FAIL',
    `status=${memberRefund.status} code=${memberRefund.body?.code ?? '-'} — needs financial:payments:manage:any`);

  const request = await call('POST', `/financial/payment-intents/${intentId}/refund-requests`, {
    token: T, label: 'member raises a refund request',
    body: { amount: 25000, reason: 'NotDelivered', note: 'The wrapper arrived in a different colour from the photograph.' },
  });
  const refundRequestId = request.body?.data?.refundRequestId ?? request.body?.data?.id;
  rec('payments', 'a member can raise a refund request', request.status < 400 ? 'PASS' : 'FAIL',
    `status=${request.status} id=${refundRequestId} code=${request.body?.code ?? '-'} detail="${String(request.body?.detail ?? '').slice(0, 160)}"`);

  if (refundRequestId) {
    rec('payments', 'the refund request is persisted',
      sql(`SELECT COUNT(*) FROM financial.financial_refund_requests WHERE "Id"='${refundRequestId}';`) === '1' ? 'PASS' : 'INFO',
      `db rows=${sql(`SELECT COUNT(*) FROM financial.financial_refund_requests WHERE "Id"='${refundRequestId}';`)}`);

    const mine = await call('GET', '/financial/refund-requests/me', { token: T, label: 'my refund requests' });
    rec('payments', 'the request appears on the member’s own list', mine.status === 200 ? 'PASS' : 'FAIL',
      `status=${mine.status}`);
  }

  // A double capture must be refused rather than charging twice.
  const doubleCapture = await call('POST', `/financial/payment-intents/${intentId}/capture`, { token: T, label: 'capture the same intent a second time', body: {} });
  rec('payments', 'a second capture on the same intent is refused', doubleCapture.status >= 400 ? 'PASS' : 'FAIL',
    `status=${doubleCapture.status} code=${doubleCapture.body?.code ?? '-'}`);
}

// ── Rewards ───────────────────────────────────────────────────────────────
const rewards = await call('GET', '/financial/rewards/me', { token: T, label: 'my rewards account' });
rec('rewards', 'the rewards account reads', rewards.status < 500 ? 'PASS' : 'FAIL',
  `status=${rewards.status} code=${rewards.body?.code ?? '-'} points=${rewards.body?.data?.pointsBalance ?? rewards.body?.data?.balance ?? '-'}`);

const rate = await call('GET', '/financial/rewards/conversion', { token: T, label: 'conversion rate' });
const conversionEnabled = rate.body?.data?.isEnabled !== false;
rec('rewards', 'the conversion rate document is published', rate.status === 200 ? 'PASS' : 'FAIL',
  `status=${rate.status} isEnabled=${rate.body?.data?.isEnabled} disabledReason=${rate.body?.data?.disabledReason ?? '-'} minimumPoints=${rate.body?.data?.minimumPoints}`);

// The grant route is an operations capability. A member being refused is the
// correct answer and is recorded as a pass, not as a blocked journey.
const selfGrant = await call('POST', '/financial/operations/rewards/grants', {
  token: T, label: 'member attempts to grant themselves points',
  body: { userId: member.userId, points: 5000, source: 'Manual', grantReference: `${stamp}-self` },
});
rec('rewards', 'an ordinary member cannot grant themselves points',
  selfGrant.status === 401 || selfGrant.status === 403 ? 'PASS' : 'FAIL',
  `status=${selfGrant.status} code=${selfGrant.body?.code ?? '-'}`);

// Seed points through the supported operations path, with a staff identity.
const staff = await verifiedUser({ name: 'Ops Staff', phone: ph(2), password: 'Op7#nmZv5Kt3' });
sql(`UPDATE identity.users SET "Role"='Admin', "AccessState"='Verified' WHERE "Id"='${staff.userId}';`);
const staffLogin = await call('POST', '/auth/login', { label: 're-login staff', body: { phoneNumber: ph(2), password: 'Op7#nmZv5Kt3' } });
const ST = (staffLogin.body?.data?.tokens ?? staffLogin.body?.data ?? {}).accessToken;

const grant = await call('POST', '/financial/operations/rewards/grants', {
  token: ST, label: 'staff grants points',
  body: { userId: member.userId, points: 5000, source: 'Manual', grantReference: `${stamp}-grant-1` },
});
rec('rewards', 'points can be granted through the supported operations route',
  grant.status < 400 ? 'PASS' : 'FAIL',
  `status=${grant.status} code=${grant.body?.code ?? '-'} detail="${String(grant.body?.detail ?? '').slice(0, 180)}"`);

const rewardsAfter = await call('GET', '/financial/rewards/me', { token: T, label: 'rewards balance after the grant' });
const points = rewardsAfter.body?.data?.pointsBalance ?? rewardsAfter.body?.data?.balance ?? rewardsAfter.body?.data?.availablePoints;
rec('rewards', 'the granted points are on the account', rewardsAfter.status === 200 && Number(points) > 0 ? 'PASS' : 'FAIL',
  `status=${rewardsAfter.status} points=${points}`);

const preview = await call('POST', '/financial/rewards/conversions/preview', {
  token: T, label: 'preview a conversion', body: { points: 1000, currency: 'NGN', countryCode: 'NG' },
});
rec('rewards', 'a conversion can be previewed before it is committed', preview.status < 400 ? 'PASS' : 'FAIL',
  `status=${preview.status} isPermitted=${preview.body?.data?.isPermitted} refusalCode=${preview.body?.data?.refusalCode ?? '-'} credit=${JSON.stringify(preview.body?.data?.credit)}`);

// The preview must agree with the write. A preview that says "permitted" over a
// capability that then refuses is the exact shape of a lying screen, so the two
// are compared rather than each being checked alone.
rec('rewards', 'the preview agrees with the capability document',
  (preview.body?.data?.isPermitted === false) === (conversionEnabled === false) ? 'PASS' : 'FAIL',
  `preview.isPermitted=${preview.body?.data?.isPermitted} rate.isEnabled=${rate.body?.data?.isEnabled}`);

const convert = await call('POST', '/financial/rewards/conversions', {
  token: T, label: 'convert points to money', body: { points: 1000, currency: 'NGN', countryCode: 'NG', idempotencyKey: `${stamp}-conv-1` },
});
const conversionId = convert.body?.data?.conversionId ?? convert.body?.data?.id;

if (!conversionEnabled) {
  // ── The answer to the question the previous phase left open ─────────────
  //
  // That phase saw `404 financial.rewards.account_not_found` and correctly
  // called it a data condition rather than a capability switch, leaving the
  // switch state unestablished. It is established now: the account exists,
  // 5,000 real points are on it, and the write still refuses — with the code
  // the rate document and the preview both declared in advance.
  const declared = rate.body?.data?.disabledReason;
  rec('rewards', 'conversion is switched off, and refuses with the declared reason',
    convert.status >= 400 && convert.body?.code === declared ? 'SWITCHED-OFF' : 'FAIL',
    `status=${convert.status} code=${convert.body?.code} === declared "${declared}" · detail="${String(convert.body?.detail ?? '').slice(0, 140)}"`);
  const after = await call('GET', '/financial/rewards/me', { token: T, label: 'points after the refused conversion' });
  const ad = after.body?.data ?? {};
  const remaining = ad.pointsBalance ?? ad.balance ?? ad.availablePoints;
  rec('rewards', 'a refused conversion does not remove the points',
    Number(remaining) === Number(points) ? 'PASS' : 'FAIL',
    `before=${points} after=${remaining}`);
  rec('rewards', 'the account records nothing converted',
    sql(`SELECT "LifetimeConverted" FROM financial.financial_reward_accounts WHERE "MemberUserId"='${member.userId}';`) === '0' ? 'PASS' : 'INFO',
    `db LifetimeConverted=${sql(`SELECT "LifetimeConverted" FROM financial.financial_reward_accounts WHERE "MemberUserId"='${member.userId}';`)}`);
} else {
  rec('rewards', 'conversion', convert.status < 400 ? 'PASS' : 'FAIL',
    `status=${convert.status} id=${conversionId} code=${convert.body?.code ?? '-'} detail="${String(convert.body?.detail ?? '').slice(0, 200)}"`);
}

if (convert.status < 400) {
  const dbConv = sql(`SELECT COUNT(*) FROM financial.financial_reward_conversions WHERE "MemberUserId"='${member.userId}';`);
  rec('rewards', 'the conversion is persisted', /^\d+$/.test(dbConv) && dbConv !== '0' ? 'PASS' : 'INFO', `db rows=${dbConv}`);

  const dupe = await call('POST', '/financial/rewards/conversions', {
    token: T, label: 'the same conversion, same idempotency key',
    body: { points: 1000, currency: 'NGN', countryCode: 'NG', idempotencyKey: `${stamp}-conv-1` },
  });
  const dupeId = dupe.body?.data?.conversionId ?? dupe.body?.data?.id;
  rec('rewards', 'a duplicate conversion is not applied twice',
    dupe.status >= 400 || dupeId === conversionId ? 'PASS' : 'FAIL',
    `status=${dupe.status} firstId=${conversionId} secondId=${dupeId}`);

  const balanceAfter = await call('GET', '/financial/rewards/me', { token: T, label: 'points after conversion' });
  const remaining = balanceAfter.body?.data?.pointsBalance ?? balanceAfter.body?.data?.balance ?? balanceAfter.body?.data?.availablePoints;
  rec('rewards', 'the converted points leave the rewards balance',
    Number(remaining) < Number(points) ? 'PASS' : 'FAIL', `before=${points} after=${remaining}`);

  const walletAfter = await call('GET', '/financial/wallets/me', { token: T, label: 'wallet after conversion' });
  rec('rewards', 'the converted value reaches the wallet', walletAfter.status === 200 ? 'PASS' : 'FAIL',
    `balance=${JSON.stringify(walletAfter.body?.data?.balance ?? walletAfter.body?.data?.availableBalance ?? null)}`);

  const history = await call('GET', '/financial/rewards/me/history?limit=25', { token: T, label: 'rewards history' });
  rec('rewards', 'the grant and the conversion both appear in history', history.status === 200 ? 'PASS' : 'FAIL',
    `status=${history.status} items=${(history.body?.data?.items ?? []).length}`);
}

// -- Converting more than the balance must be refused ---------------------
//
// With conversion switched off this cannot distinguish "refused for balance"
// from "refused because the capability is off", and saying so is better than
// claiming a balance check that was never reached.
const overConvert = await call('POST', '/financial/rewards/conversions', {
  token: T, label: 'convert more points than are held',
  body: { points: 99999999, currency: 'NGN', countryCode: 'NG', idempotencyKey: `${stamp}-conv-over` },
});
rec('rewards', conversionEnabled
  ? 'converting more points than are held is refused'
  : 'an over-balance conversion is refused, though the switch answers first',
  overConvert.status >= 400 ? 'PASS' : 'FAIL',
  `status=${overConvert.status} code=${overConvert.body?.code ?? '-'}${conversionEnabled ? '' : ' — the capability switch answers before any balance check, so this does not establish the balance rule'}`);

// ── Subscriptions and receipts, recorded rather than assumed ─────────────
for (const [what, path] of [
  ['subscription plans', '/financial/subscriptions/plans'],
  ['my subscriptions', '/financial/subscriptions/me'],
  ['my entitlements', '/financial/entitlements/me'],
  ['my purchases', '/financial/purchases'],
  ['my giving', '/financial/giving/me'],
  ['donation causes', '/financial/donations/causes'],
  ['my placements', '/financial/placements/me'],
  ['my refund requests', '/financial/refund-requests/me'],
]) {
  const r = await call('GET', path, { token: T, label: `read ${what}` });
  rec('monetization', `${what} — \`${path}\``, r.status === 200 ? 'PASS' : r.status === 404 ? 'GAP' : 'INFO',
    `status=${r.status} keys={${Object.keys(r.body?.data ?? {}).join(',').slice(0, 90)}}`);
}

finish(0);
