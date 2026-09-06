// ─────────────────────────────────────────────────────────────────────────────
// A payout's state has to read differently from every other payout's state
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// `GET /financial/wallets/me/withdrawals` has been served since B15 landed.
// `fetchWithdrawals` and `useWithdrawals` have both existed the whole time. No
// screen in the application called either, so a member could raise a withdrawal
// and then had nowhere at all to see what became of it — and `financial-status`
// had eight presenters with withdrawal not among them.
//
// The revenue dashboard renders them now, which is where the risk starts.
//
// ── The failure this is written against ─────────────────────────────────────
//
// There are two `StatusTone` unions in this codebase and they do not overlap.
// `financial-status` speaks `positive`/`pending`/`negative`/`neutral`/`warning`;
// the creator components' `useToneColours` speaks
// `success`/`warning`/`error`/`info`/`brand` and returns **grey for every word
// it does not recognise**. Rendering a withdrawal through the creator helper
// gives a paid payout and a failed payout the same colour, the same weight and
// no visible difference at all.
//
// The compiler catches the crossed types. It cannot catch the other half: a
// status the presenter has no entry for falls through to `UNKNOWN`, which reads
// "In progress" in a pending tone. On a *terminal* state that is worse than
// unhelpful — a member whose payout bounced would be told it is still on its
// way, indefinitely, and would keep waiting for money that is back in their
// balance.
// ─────────────────────────────────────────────────────────────────────────────

import { WITHDRAWAL_STATUSES } from '@/types/financial';
import { presentWithdrawalStatus } from '../financial-status';

declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

describe('every withdrawal state is presented deliberately', () => {
  it('has an entry for each, and none falls through to the unknown state', () => {
    for (const status of WITHDRAWAL_STATUSES) {
      const presented = presentWithdrawalStatus(status);

      // `UNKNOWN`'s label. A state reaching it is a state nobody wrote a line
      // for, and on `Failed` or `Reversed` it tells somebody their money is
      // still coming when it is already back in their balance.
      expect(presented.label).not.toBe('In progress');
      expect(presented.description.length).toBeGreaterThan(20);
      expect(presented.icon).toBeTruthy();
    }
  });

  it('still answers for a state the deployment gained and this app has not', () => {
    // The union is open on purpose: a client that threw on an unrecognised
    // status would break the screen rather than the badge.
    expect(presentWithdrawalStatus('SomethingNewer' as never).label).toBe('In progress');
  });

  it('calls only Completed settled', () => {
    // `Reversed` money moved and came back. Reading it as settled shows a member
    // a payout they no longer have — the one distinction on this screen where
    // being wrong costs somebody a wrong belief about their own balance.
    const settled = WITHDRAWAL_STATUSES.filter(
      (status) => presentWithdrawalStatus(status).isSettled
    );

    expect(settled).toEqual(['Completed']);
  });

  it('treats every state that cannot change again as terminal', () => {
    const terminal = WITHDRAWAL_STATUSES.filter(
      (status) => presentWithdrawalStatus(status).isTerminal
    );

    expect([...terminal].sort()).toEqual(['Cancelled', 'Completed', 'Failed', 'Reversed']);
  });

  it('keeps reconciling only while the answer can still change', () => {
    // Polling a terminal state is a request that can never return news; not
    // polling a live one leaves a member watching a stale badge.
    for (const status of WITHDRAWAL_STATUSES) {
      const presented = presentWithdrawalStatus(status);
      expect(presented.needsReconciliation).toBe(!presented.isTerminal);
    }
  });

  it('gives the two live states and the two bad endings different tones', () => {
    // Not a style preference. These are the four a member most needs to tell
    // apart at a glance, and the grey-fallthrough defect makes all four look
    // the same while every assertion above still passes.
    const tone = (status: string) => presentWithdrawalStatus(status).tone;

    expect(tone('Completed')).toBe('positive');
    expect(tone('Failed')).toBe('negative');
    expect(tone('Reversed')).toBe('warning');
    expect(tone('Cancelled')).toBe('neutral');
    expect(new Set([tone('Requested'), tone('Processing')])).toEqual(new Set(['pending']));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// And the vocabulary itself, against the server's enum
// ─────────────────────────────────────────────────────────────────────────────

function resolveBackendSourceRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  const sourceRoot = join(candidate, 'src');
  return existsSync(sourceRoot) ? sourceRoot : null;
}

const BACKEND_SOURCE_ROOT = resolveBackendSourceRoot();

const ENUM_FILE = BACKEND_SOURCE_ROOT
  ? join(BACKEND_SOURCE_ROOT, 'Diaspora.Modules.Financial', 'Domain', 'Enums', 'WithdrawalStatus.cs')
  : null;

const describeWhenBackendPresent = ENUM_FILE && existsSync(ENUM_FILE) ? describe : describe.skip;

describeWhenBackendPresent('the withdrawal vocabulary matches the server', () => {
  const source = readFileSync(ENUM_FILE as string, 'utf8');

  function enumMembers(name: string): string[] {
    const body = new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
    if (!body) return [];

    return body[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('/'))
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)\s*(=|,|$)/.exec(line)?.[1])
      .filter((member): member is string => Boolean(member));
  }

  it('parses the enum at all', () => {
    // Guards the guard. An empty list makes the equality below true by vacuity,
    // which is how a drift check goes blind after a file move on the other side.
    expect(enumMembers('WithdrawalStatus').length).toBeGreaterThan(4);
  });

  it('agrees on every state, in both directions', () => {
    // This union has been wrong before: it carried `Pending` and `Rejected`,
    // neither of which the server has ever had. A client naming a state the
    // platform cannot produce is a filter that comes back empty for ever; a
    // client missing one the platform does produce renders it as nothing.
    expect([...WITHDRAWAL_STATUSES].sort()).toEqual([...enumMembers('WithdrawalStatus')].sort());
  });
});
