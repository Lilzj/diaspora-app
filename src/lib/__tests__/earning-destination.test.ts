// ─────────────────────────────────────────────────────────────────────────────
// Where an earning row goes
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// The revenue screen opened `/wallet/transactions/{earning.transactionId}`, and
// on a device every row answered:
//
//   "We could not find that transaction.
//    It may be older than the transactions this screen can reach."
//
// Not a lookup bug. A donation capture posts two legs — the clearing wallet to
// platform revenue — and the person who earned from it owns neither, nor did
// they initiate the payment. `GET /financial/transactions/{id}` answers 404
// rather than 403 in that case on purpose, so an identifier cannot be used to
// discover that a transaction exists. The link was unopenable by design, and
// the contract described it as "resolvable".
//
// Nothing in 4,726 client tests or 4,849 backend tests could see it: the wire
// carried a well-formed uuid, the screen gated the tap on its presence, and
// both halves were individually right. It took a tap on a device.
//
// ── What replaced it ────────────────────────────────────────────────────────
//
// The subject — the thing that produced the money, which the earner does own.
// `earningDestination` is the single place a subject becomes a route, and the
// assertions below are mostly about what it refuses: a subject with no route
// must answer null so the caller leaves the row unpressable, rather than
// pushing something that fails on arrival.
// ─────────────────────────────────────────────────────────────────────────────

import { earningDestination } from '../creator-economy';

const ID = 'c9d8e7f6-0000-4000-8000-000000000004';

describe('a subject the client can open', () => {
  it.each([
    ['campaign', `/community-life/campaign/${ID}`],
    ['event', `/community-life/event/${ID}`],
    ['listing', `/marketplace/${ID}`],
    ['housing', `/housing/${ID}`],
    ['job', `/job/${ID}`],
    ['guide', `/guide/${ID}`],
  ])('routes %s to its own screen', (subjectType, expected) => {
    expect(earningDestination({ subjectType, subjectId: ID })).toBe(expected);
  });
});

describe('a subject the client cannot open', () => {
  it('refuses a donation, which belongs to the donor', () => {
    // The case that matters. A beneficiary opening their own earning is not the
    // person who gave, and `GET /financial/donations/{id}` answers that person.
    // This is the subject a campaign donation used to carry.
    expect(earningDestination({ subjectType: 'donation', subjectId: ID })).toBeNull();
  });

  it('refuses a subject type it has not been taught', () => {
    // The server can add one before the client learns it. An unpressable row is
    // a smaller failure than a tap that 404s.
    expect(earningDestination({ subjectType: 'sponsorship', subjectId: ID })).toBeNull();
  });

  it('refuses a subject with no identifier behind it', () => {
    expect(earningDestination({ subjectType: 'campaign', subjectId: null })).toBeNull();
    expect(earningDestination({ subjectType: 'campaign' })).toBeNull();
  });

  it('refuses an earning with no subject at all', () => {
    // A referral bonus. Nothing produced it that a member can look at.
    expect(earningDestination({})).toBeNull();
    expect(earningDestination({ subjectType: null, subjectId: null })).toBeNull();
  });
});

describe('what it must not do', () => {
  it('never routes to the ledger transaction screen', () => {
    // The whole defect, pinned as a rule rather than as a value. Any subject
    // reaching `/wallet/transactions/...` is the dead tap coming back.
    const everySubject = [
      'campaign', 'event', 'listing', 'housing', 'job', 'guide',
      'donation', 'transaction', 'payment', 'unknown',
    ];

    for (const subjectType of everySubject) {
      expect(earningDestination({ subjectType, subjectId: ID }) ?? '')
        .not.toContain('/wallet/transactions/');
    }
  });
});
