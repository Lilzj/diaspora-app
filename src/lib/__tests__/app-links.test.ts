// App Links rewrite, 5 Oct 2026. Every shape Expo Router may hand over (full URL,
// host without scheme, bare path) lands on the same screen; foreign links pass through.

import { rewriteAppLink } from '@/lib/app-links';

describe('rewriteAppLink', () => {
  it.each([
    'https://diaspora-api.fly.dev/payments/checkout/complete',
    'diaspora-api.fly.dev/payments/checkout/complete',
    '/payments/checkout/complete',
    // What Expo Router really hands over for a verified https link (seen on the device).
    'diaspora://payments/checkout/complete',
    'diaspora:///payments/checkout/complete',
    'https://DIASPORA-API.fly.dev/Payments/Checkout/Complete/',
  ])('sends a completed checkout to the wallet: %s', (incoming) => {
    expect(rewriteAppLink(incoming)).toBe('/wallet?checkout=complete');
  });

  it('sends a cancelled checkout to the wallet', () => {
    expect(rewriteAppLink('https://diaspora-api.fly.dev/payments/checkout/cancelled')).toBe(
      '/wallet?checkout=cancelled'
    );
  });

  it('carries a verification token to the email screen, re-encoded', () => {
    const token = 'YWJj-ZGVm_Z2hp';
    expect(rewriteAppLink(`https://diaspora-api.fly.dev/email/confirm?token=${token}`)).toBe(
      `/settings/integrations/email?confirmToken=${token}`
    );
  });

  it('reads the token from the app-scheme form Expo Router passes', () => {
    expect(rewriteAppLink('diaspora://email/confirm?token=abc')).toBe(
      '/settings/integrations/email?confirmToken=abc'
    );
  });

  it("keeps the app's own deep links working", () => {
    expect(rewriteAppLink('diaspora://wallet')).toBe('diaspora://wallet');
    expect(rewriteAppLink('diaspora://settings/integrations/email')).toBe('diaspora://settings/integrations/email');
  });

  it('opens the email screen without a token when the link has none', () => {
    expect(rewriteAppLink('https://diaspora-api.fly.dev/email/confirm')).toBe('/settings/integrations/email');
    expect(rewriteAppLink('https://diaspora-api.fly.dev/email/confirm?token=')).toBe('/settings/integrations/email');
  });

  it('does not crash on a malformed escape', () => {
    expect(rewriteAppLink('https://diaspora-api.fly.dev/email/confirm?token=%E0%A4%A')).toBe(
      '/settings/integrations/email'
    );
  });

  // CS-C3: the referral programme shares `/join/CODE`. It opens sign-up with
  // the code filled in.
  it('opens sign-up with the code from an invitation link', () => {
    expect(rewriteAppLink('diaspora://join/AB12CD34')).toBe('/register?ref=AB12CD34');
    expect(rewriteAppLink('https://diaspora-api.fly.dev/join/AB12CD34?utm=share')).toBe('/register?ref=AB12CD34');
  });

  it('opens sign-up without a code when the invitation link has none', () => {
    expect(rewriteAppLink('diaspora://join/')).toBe('/register');
  });

  it.each([
    '/discover',
    'https://example.com/payments/checkout/complete',
    'https://diaspora-api.fly.dev.evil.example/email/confirm?token=x',
    '',
  ])('leaves anything else alone: %s', (incoming) => {
    expect(rewriteAppLink(incoming)).toBe(incoming);
  });
});
