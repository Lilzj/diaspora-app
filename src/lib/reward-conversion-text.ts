/**
 * A member's sentence for the server's reason a conversion is refused.
 *
 * The server sends a code (`financial.rewards.conversion_not_supported`), not a
 * sentence; two screens showed it verbatim (20 Oct 2026). Unknown codes get a
 * plain fallback; a reason that is already a sentence is shown as it is.
 */
export function conversionReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case 'financial.rewards.conversion_not_supported':
      return 'Turning points into wallet credit is not switched on yet.';
    case 'financial.rewards.conversion_rate_missing':
      return 'Diaspora has not set a rate for turning points into credit yet.';
    case null:
    case undefined:
    case '':
      return 'Conversion is not available on your account.';
    default:
      return /^[a-z0-9_.-]+$/i.test(reason) && reason.includes('.')
        ? 'Conversion is not available on your account right now.'
        : reason;
  }
}
