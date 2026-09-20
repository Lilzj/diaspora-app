/**
 * The field a platform error code arrives in — 20 Sep 2026.
 *
 * `toFinancialError` looked the member-facing copy up by `problem.errorCode`.
 * The platform writes the code in exactly one place — `PlatformProblem.Enrich`,
 * `problem.Extensions["code"] = code` — and nothing in it has ever written
 * `errorCode`. So the lookup missed on every error the app has ever shown, and
 * all 53 entries in `CODE_COPY` were unreachable: a wallet that does not exist
 * and a payment the bank refused both fell through to the same generic line for
 * their status.
 *
 * It had been seen before, narrowly. `community-entity-api.ts` carries a note
 * saying the backend "never sends" `errorCode` and works around it for
 * `communities.*` codes only, deferring the platform-wide fix because reading
 * `code` changes retry and terminal behaviour for every coded error. It does,
 * and that is the point — the entries carry `terminal` for a reason.
 *
 * The mocks sent `errorCode` too, so mocked runs agreed with the defect rather
 * than exposing it.
 */
import { AxiosError, AxiosHeaders } from 'axios';

import { FinancialErrorCodes, toFinancialError } from '../financial-errors';

function refusal(status: number, body: Record<string, unknown>): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');

  error.response = {
    status,
    statusText: 'Refused',
    data: body,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };

  return error;
}

describe('reading the platform error code', () => {
  it('reads the code from `code`, which is the field the platform writes', () => {
    const error = toFinancialError(
      refusal(404, { code: FinancialErrorCodes.AccountNotFound, detail: 'No wallet.' }),
      'read'
    );

    expect(error.code).toBe(FinancialErrorCodes.AccountNotFound);
    expect(error.message).toBe('You do not have a Diaspora wallet yet.');
  });

  /**
   * The defect, as an assertion. A body carrying only `errorCode` is a body no
   * deployment produces, and it must not resolve copy — otherwise this test
   * passes whichever field the lookup reads.
   */
  it('does not resolve copy from `errorCode`, which nothing sends', () => {
    const error = toFinancialError(
      refusal(404, { errorCode: FinancialErrorCodes.AccountNotFound, detail: 'No wallet.' }),
      'read'
    );

    expect(error.message).not.toBe('You do not have a Diaspora wallet yet.');
  });

  /**
   * Two different refusals with the same status. Before the fix these were the
   * same sentence, which is the member-visible shape of the bug.
   */
  it('tells two refusals of the same status apart', () => {
    const noWallet = toFinancialError(
      refusal(404, { code: FinancialErrorCodes.AccountNotFound }),
      'read'
    );

    const generic = toFinancialError(refusal(404, {}), 'read');

    expect(noWallet.message).not.toBe(generic.message);
  });

  /**
   * The behaviour change the earlier note flagged, pinned rather than left to be
   * discovered: a coded error carries its own terminal flag now, so the app
   * stops retrying things that will never succeed.
   */
  it('carries the terminal flag the code declares', () => {
    const terminal = toFinancialError(
      refusal(403, { code: FinancialErrorCodes.Forbidden }),
      'mutating'
    );

    expect(terminal.isTerminal).toBe(true);
  });

  /**
   * An unknown code is not an error in itself — the platform has 229 financial
   * codes and the app writes copy for the ones a member can act on. The rest
   * fall back to the status, which is what the fallback is for.
   */
  it('falls back to the status when the code has no copy', () => {
    const error = toFinancialError(
      refusal(409, { code: 'financial.some.code.nobody.wrote.copy.for' }),
      'read'
    );

    expect(error.message.length).toBeGreaterThan(0);
  });
});
