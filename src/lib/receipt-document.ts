// ─────────────────────────────────────────────────────────────────────────────
// A receipt a member can keep
//
// ── Why a PDF and not a screenshot ───────────────────────────────────────────
//
// The app already shares in five places, all through React Native's `Share`,
// which carries a string. That is right for a listing — the thing being shared
// is a link. It is wrong for a receipt, because the thing being shared *is* the
// document: a landlord asking for proof of a deposit will not accept a URL to
// an app they cannot open.
//
// `expo-print` renders HTML to a real PDF and `expo-sharing` hands it to the
// system sheet, so it lands in Files, Drive, WhatsApp or an email exactly like
// any other attachment.
//
// ── Why the HTML is built here and not in the screen ─────────────────────────
//
// Two screens show a payment — `wallet/payments/[id]` and
// `wallet/receipts/[reference]` — and a receipt that disagrees with itself
// depending on which screen produced it is worse than no receipt. One builder,
// one layout, both call it.
//
// ── What this promises ───────────────────────────────────────────────────────
//
// Only what the payment record says. Every figure is passed in already
// formatted by the caller, because money formatting in this app belongs to
// `lib/money` and a receipt is the last place to re-derive it. Nothing here
// computes a total, a tax line or a balance.
// ─────────────────────────────────────────────────────────────────────────────

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface ReceiptLine {
  label: string;
  value: string;
  /** Rendered heavier — used for the amount actually taken. */
  emphasis?: boolean;
}

export interface ReceiptDocument {
  /** "Receipt" or "Payment receipt" — the heading on the page. */
  title: string;
  /** The headline amount, already formatted. */
  amount: string;
  /** What the payment was for. */
  subtitle?: string;
  /** "Paid", "Refunded", "Pending" — the state, in the member's words. */
  status: string;
  lines: ReceiptLine[];
  /** The reference somebody would quote in a dispute. */
  reference: string;
  /** Shown at the foot, so a recipient knows what produced this. */
  issuedAt: string;
}

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The receipt as a standalone HTML page.
 *
 * Deliberately not themed. A receipt is read outside the app — printed,
 * attached to an email, opened in a PDF viewer — and a dark-mode receipt is a
 * page that wastes a cartridge and reads badly on paper.
 */
export function renderReceiptHtml(doc: ReceiptDocument): string {
  const rows = doc.lines
    .map(
      (line) => `
        <tr>
          <td class="label">${escape(line.label)}</td>
          <td class="value${line.emphasis ? ' strong' : ''}">${escape(line.value)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #0F1117;
        margin: 0;
        padding: 40px 36px;
        font-size: 13px;
        line-height: 1.5;
      }
      .brand {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: #8A5000;
      }
      h1 { font-size: 19px; margin: 4px 0 0; letter-spacing: -.01em; }
      .amount {
        font-size: 38px;
        font-weight: 800;
        letter-spacing: -.02em;
        margin: 22px 0 2px;
      }
      .subtitle { color: #3A3D4A; margin: 0 0 18px; }
      .status {
        display: inline-block;
        border: 1px solid #0D7C66;
        color: #0D7C66;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 700;
      }
      table { width: 100%; border-collapse: collapse; margin-top: 26px; }
      td { padding: 10px 0; border-bottom: 1px solid #E5E7EF; vertical-align: top; }
      .label { color: #6B7280; width: 45%; }
      .value { text-align: right; font-weight: 600; }
      .value.strong { font-weight: 800; }
      .reference {
        margin-top: 26px;
        padding: 14px 16px;
        background: #F8F9FC;
        border: 1px solid #E5E7EF;
        border-radius: 10px;
      }
      .reference .label { display: block; width: auto; color: #6B7280; font-size: 11px; }
      .reference .code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
        font-weight: 700;
        word-break: break-all;
      }
      footer {
        margin-top: 30px;
        color: #6B7280;
        font-size: 11px;
        border-top: 1px solid #E5E7EF;
        padding-top: 14px;
      }
    </style>
  </head>
  <body>
    <div class="brand">Diaspora</div>
    <h1>${escape(doc.title)}</h1>

    <div class="amount">${escape(doc.amount)}</div>
    ${doc.subtitle ? `<p class="subtitle">${escape(doc.subtitle)}</p>` : ''}
    <span class="status">${escape(doc.status)}</span>

    <table>${rows}</table>

    <div class="reference">
      <span class="label">Reference</span>
      <span class="code">${escape(doc.reference)}</span>
    </div>

    <footer>
      Issued ${escape(doc.issuedAt)} by Diaspora. Quote the reference above in any
      question about this payment.
    </footer>
  </body>
</html>`;
}

export type ReceiptShareOutcome =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed' };

/**
 * Render the receipt to a PDF and open the system share sheet.
 *
 * `isAvailableAsync` is checked rather than assumed: sharing is unavailable on
 * some Android configurations and in the simulator, and a button that silently
 * does nothing is worse than one that says why.
 */
export async function shareReceipt(doc: ReceiptDocument): Promise<ReceiptShareOutcome> {
  return shareHtmlAsPdf(renderReceiptHtml(doc), doc.title);
}

/**
 * Print a finished HTML document to a PDF and open the system share sheet.
 *
 * For a document the **server** produced — an invoice — rather than one built
 * here. The HTML is passed through untouched: re-rendering the server's figures
 * on the device would be a second invoice that could disagree with the first.
 */
export async function shareHtmlAsPdf(html: string, title: string): Promise<ReceiptShareOutcome> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'unavailable' };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    });

    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
