// What members are told about trading safely.
//
// Decided 7 Oct 2026 (Phase 11): Diaspora does not hold money between buyers and
// sellers, so there is no escrow and no buyer protection to lean on. Instead the
// app tells people how to deal with each other: in person, and when paying
// through the app. One source, so the full page, the inline notes and the
// conversation card never say different things.

import type { TrustTier } from '@/types/trust';

export const TRADING_SAFETY_ROUTE = '/safety/trading';

export interface SafetyTip {
  icon: string;
  title: string;
  body: string;
}

/** Cash, hand to hand, or any deal done face to face. */
export const IN_PERSON_TIPS: SafetyTip[] = [
  {
    icon: '☀️',
    title: 'Meet during the day',
    body: 'Arrange to meet in daylight. If the other person will only meet late at night, that is a reason to walk away.',
  },
  {
    icon: '🏬',
    title: 'Choose a busy public place',
    body: 'A shopping centre, a café or outside a police station. Never at your home or theirs for a first meeting, and never somewhere isolated.',
  },
  {
    icon: '👥',
    title: 'Bring someone, and tell someone',
    body: 'Go with a friend if you can. Tell somebody where you are going, who you are meeting and when you expect to be back.',
  },
  {
    icon: '🔍',
    title: 'Check before you pay',
    body: 'Look at the item properly, switch it on, try it. For a room or a home, see it in person before any money changes hands.',
  },
  {
    icon: '💵',
    title: 'Keep cash safe',
    body: 'Carry only the agreed amount, count it out in the open, and do not hand it over until you have the item.',
  },
];

/** Paying another member with Diaspora. */
export const IN_APP_TIPS: SafetyTip[] = [
  {
    icon: '🤝',
    title: 'Only pay someone you know or trust',
    body: 'A payment made with Diaspora goes straight to the other person. Diaspora does not hold it for you and does not release it when the item arrives.',
  },
  {
    icon: '🛡️',
    title: 'Check their trust level first',
    body: 'Every member shows a trust level, whether they are verified, how long they have been a member and their reviews. Be careful with a new account that has none of these.',
  },
  {
    icon: '👀',
    title: 'Never pay for something you have not seen',
    body: 'Especially a deposit for a room. Meet, view and agree first; pay once you are sure.',
  },
  {
    icon: '💬',
    title: 'Keep the conversation in Diaspora',
    body: 'If somebody pushes you to pay outside the app, to a different account, or in a hurry, stop. Report them.',
  },
  {
    icon: '🚩',
    title: 'Report anything that feels wrong',
    body: 'Use “Report” on the listing or in the conversation. Diaspora staff review every report.',
  },
];

/** The one line shown beside contact and pay actions. */
export const SAFETY_LINE =
  'Meeting in person? Do it by day, in a busy public place. Paying in the app? Only pay someone you know or trust.';

/** What each trust level means, in a member's words. */
export const TRUST_TIER_LABEL: Record<TrustTier, string> = {
  Untrusted: 'Not trusted yet',
  Basic: 'New member',
  Provisional: 'Getting established',
  Verified: 'Verified member',
  Trusted: 'Trusted member',
  Steward: 'Community steward',
};

/** Whether a level is low enough to deserve a caution beside it. */
export function isLowTrust(tier: TrustTier | null | undefined): boolean {
  return !tier || tier === 'Untrusted' || tier === 'Basic' || tier === 'Provisional';
}
