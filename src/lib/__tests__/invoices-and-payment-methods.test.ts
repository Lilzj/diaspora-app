// ─────────────────────────────────────────────────────────────────────────────
// Invoices and saved payment methods, after the gaps closed — 20 Oct 2026
// (backend 9d0caaf).
//
// The app reached both through simulated prefixes (`/monetization-gap/v0`,
// `/integrations-gap/v0`), which no deployment serves, so a release build
// showed "not available" while the platform served them. These pin:
//
//   1. The real `/financial` paths, never a gap prefix.
//   2. The invoice list pages by invoice **number** (`before`), not an id.
//   3. The document is fetched as text through the API client — it is
//      owner-only and needs the bearer token, so it cannot be opened as a link.
//   4. An empty payment-method list passes through as empty: the platform keeps
//      none, and the client invents none.
//   5. A refused removal is reported as refused, with the server's code.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  fetchInvoice,
  fetchInvoiceDocument,
  fetchMyInvoices,
  fetchSavedPaymentMethods,
  forgetSavedPaymentMethod,
} from '../financial-api';
import { describeInvoiceKind, presentInvoiceStatus } from '../financial-status';
import type { Invoice, Money } from '@/types/financial';

const gbp = (minorUnits: number): Money => ({
  amount: minorUnits / 100,
  currency: 'GBP',
  minorUnits,
  exponent: 2,
  symbol: '£',
});

const INVOICE: Invoice = {
  invoiceId: '7f0c2a52-1b7e-4d0e-9f53-5d2b8f3e9a10',
  number: 'DSP-2026-000124',
  status: 'Paid',
  kind: 'Purchase',
  periodStart: '2026-10-19T10:00:00Z',
  periodEnd: '2026-10-19T10:00:00Z',
  lines: [
    {
      description: '£25 credit bundle',
      quantity: 1,
      unitPrice: gbp(2500),
      total: gbp(2500),
      subjectType: 'Member',
      subjectId: '0c9b7f0e-6a55-4c1c-9a3f-1e7d2b9c4f11',
    },
  ],
  subtotal: gbp(2500),
  tax: gbp(0),
  taxLabel: null,
  taxLines: [],
  total: gbp(2500),
  refunded: gbp(0),
  issuedAt: '2026-10-19T10:00:05Z',
  paidAt: '2026-10-19T10:00:00Z',
  paymentIntentId: '2d7e9a41-8c3b-4f6a-b1d2-7e5c9f0a3b64',
  documentUrl: '/api/v1/financial/invoices/7f0c2a52-1b7e-4d0e-9f53-5d2b8f3e9a10/document',
};

describe('invoices and payment methods read the served /financial routes', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mock.onAny(/-gap\/v0/).reply(() => {
      throw new Error('a real read reached a simulated prefix');
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('lists invoices from /financial/invoices/me, paging below an invoice number', async () => {
    mock.onGet('/financial/invoices/me').reply((config) => {
      expect(config.params).toEqual({ take: 25, before: 'DSP-2026-000125' });
      return [200, { data: [INVOICE] }];
    });

    const invoices = await fetchMyInvoices({ take: 25, before: 'DSP-2026-000125' });

    expect(invoices).toHaveLength(1);
    expect(invoices[0].number).toBe('DSP-2026-000124');
    // No tax was recorded, and the client does not name one.
    expect(invoices[0].taxLabel).toBeNull();
    expect(invoices[0].taxLines).toEqual([]);
  });

  it('reads one invoice by id, and reports someone else’s as not found', async () => {
    mock.onGet(`/financial/invoices/${INVOICE.invoiceId}`).reply(200, { data: INVOICE });
    mock.onGet('/financial/invoices/00000000-0000-0000-0000-000000000000').reply(404, {
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'financial.invoice.not_found',
    });

    await expect(fetchInvoice(INVOICE.invoiceId)).resolves.toMatchObject({ number: INVOICE.number });
    await expect(fetchInvoice('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('fetches the printable document as HTML through the API client', async () => {
    const html = '<!doctype html><html><body>DSP-2026-000124 &#163;25.00</body></html>';
    mock.onGet(`/financial/invoices/${INVOICE.invoiceId}/document`).reply((config) => {
      expect(config.responseType).toBe('text');
      return [200, html, { 'content-type': 'text/html; charset=utf-8' }];
    });

    await expect(fetchInvoiceDocument(INVOICE.invoiceId)).resolves.toBe(html);
  });

  it('passes an empty payment-method list through as empty — nothing is kept', async () => {
    mock.onGet('/financial/payment-methods/me').reply(200, { data: [] });

    await expect(fetchSavedPaymentMethods()).resolves.toEqual([]);
  });

  it('reports a refused removal as refused', async () => {
    mock.onDelete('/financial/payment-methods/pm-1').reply(404, {
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'financial.payment_method.not_found',
    });

    await expect(forgetSavedPaymentMethod('pm-1')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('presenting an invoice', () => {
  it('names the three statuses the server sends', () => {
    expect(presentInvoiceStatus('Paid').label).toBe('Paid');
    expect(presentInvoiceStatus('PartiallyRefunded').label).toBe('Part refunded');
    expect(presentInvoiceStatus('Refunded').label).toBe('Refunded');
  });

  it('shows a status it does not know as the server wrote it, not as "in progress"', () => {
    const status = presentInvoiceStatus('Voided');
    expect(status.label).toBe('Voided');
    expect(status.tone).toBe('neutral');
  });

  it('describes what an invoice was drawn from', () => {
    expect(describeInvoiceKind('Subscription')).toBe('Plan subscription');
    expect(describeInvoiceKind('SomethingNew')).toBe('SomethingNew');
  });
});
