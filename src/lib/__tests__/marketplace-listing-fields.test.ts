// ─────────────────────────────────────────────────────────────────────────────
// What each kind of listing asks — Android UAT, 3 Nov 2026
//
// A member posting a buying request ("Any good smartphones", MUR 2,500–5,000)
// was asked "Quantity Available", which means nothing for something they want
// to buy. The wizard asked every field of every kind of listing, and checked
// "not a giveaway" where it meant "has a price", so a donation was offered a
// price, a negotiable box and a price check, then sent 0 regardless.
//
// The budget a buying request gave was never sent at all: the payload read the
// single `price` field, which that form does not show.
// ─────────────────────────────────────────────────────────────────────────────

import { listingFieldsFor, listingPricePayload } from '@/lib/marketplace-listing-fields';

describe('the fields each kind of listing shows', () => {
  it('asks a seller everything', () => {
    expect(listingFieldsFor('Selling')).toEqual({
      price: true, budgetRange: false, negotiable: true, quantity: true, condition: 'item',
    });
  });

  it('asks a buyer for a budget and nothing about stock', () => {
    expect(listingFieldsFor('Buying Request')).toEqual({
      price: false, budgetRange: true, negotiable: false, quantity: false, condition: 'accepted',
    });
  });

  it('asks a giveaway and a donation no price', () => {
    for (const intent of ['Giving Away', 'Donation']) {
      expect(listingFieldsFor(intent)).toEqual({
        price: false, budgetRange: false, negotiable: false, quantity: true, condition: 'item',
      });
    }
  });
});

describe('what each kind of listing sends', () => {
  it("sends a seller's price, whether it is negotiable, and how many", () => {
    expect(listingPricePayload('Selling', { price: '250', maxPrice: '', negotiable: true, quantity: '3' }))
      .toEqual({ price: 250, isNegotiable: true, quantity: 3 });
  });

  it("sends a buyer's highest budget, and no stock", () => {
    expect(listingPricePayload('Buying Request', { price: '', maxPrice: '5000', negotiable: true, quantity: '1' }))
      .toEqual({ price: 5000, isNegotiable: false, quantity: undefined });
  });

  it('sends a giveaway and a donation at nothing, never negotiable', () => {
    for (const intent of ['Giving Away', 'Donation']) {
      expect(listingPricePayload(intent, { price: '40', maxPrice: '', negotiable: true, quantity: '2' }))
        .toEqual({ price: 0, isNegotiable: false, quantity: 2 });
    }
  });

  it('sends one unit when the quantity is blank', () => {
    expect(listingPricePayload('Selling', { price: '10', maxPrice: '', negotiable: false, quantity: '' }).quantity).toBe(1);
  });
});

describe('the wizard reads the field map', () => {
  const fs = require('fs');
  const path = require('path');
  const wizard: string = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'marketplace', 'create.tsx'), 'utf8');

  it('shows Quantity only where the listing has stock', () => {
    expect(wizard).toMatch(/\{fields\.quantity && \(\s*<Input\s+label="Quantity Available"/);
  });

  it('shows the price block only where the listing has a price', () => {
    expect(wizard).not.toContain("{intent !== 'Giving Away' && (");
  });
});
