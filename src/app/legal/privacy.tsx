// Privacy Policy. Placeholder copy — see `components/legal/LegalDocument`.
//
// Written against what the app actually collects. Diaspora holds a location, a
// verification state, published content, payments it processed and a points
// ledger; it does not hold the money members pay each other, and its analytics
// are largely unbuilt. A policy claiming to explain data flows that do not
// exist yet would be fiction in a document whose whole value is being true.

import React from 'react';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who is responsible for your data',
    body: [
      'Diaspora Platform Ltd, registered in England and Wales, is the controller of the personal data described here.',
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'What you give us: your name, phone number, email address, the country you are from and the place you live now, and anything you choose to put on your profile.',
      'What you publish: guides, updates, listings, reviews, messages to other members, and the organisations you belong to.',
      'Verification: documents and checks you submit to prove identity or residency, and the outcome of those checks.',
      'Payments: what you paid us for, when, the method type, and the reference. We do not store your full card number — that stays with our payment processor.',
      'Where you are: an approximate location, so the app can show what is near you. You choose whether to share precise location, and you can change or clear it at any time from the location banner.',
      'How you use the app: which screens you open and which features you use, so we can tell what is worth building.',
    ],
  },
  {
    heading: 'What we do with it',
    body: [
      '• To run the service — show you listings near you, deliver your messages, take payment for a subscription.',
      '• To keep people safe — verify identity, investigate reports, act on moderation decisions.',
      '• To meet legal obligations — keep records of payments, respond to lawful requests.',
      '• To improve the app — understand which features are used, in aggregate.',
      'We do not sell your personal data, and we do not use your messages to target advertising.',
    ],
  },
  {
    heading: 'Who else sees it',
    body: [
      'Other members see what you publish and what your privacy settings allow. Your verification badges are visible; the documents behind them are not.',
      'Our processors — hosting, payments, identity checks, messaging delivery — see only what they need to do their part, under contract.',
      'Authorities, where we are legally required to disclose something. We will tell you unless we are prohibited from doing so.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Your account data, for as long as your account is open.',
      'Payment records, for as long as tax and accounting law requires — usually six years.',
      'Verification documents, only as long as needed to complete the check and to evidence that it happened.',
      'When you close your account we remove or anonymise what we no longer need. Some things survive: a payment record, and content other members have relied on.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You can ask us for a copy of your data, to correct it, to delete it, to restrict how we use it, or to object to a particular use. You can also ask us to hand it to another service.',
      'Most of this is available directly in the app: Settings has your privacy controls, your devices and sessions, and the log of changes to your account.',
      'If you think we have handled your data badly, tell us first through Help & Support. You can also complain to the Information Commissioner’s Office.',
    ],
  },
  {
    heading: 'Where your data is',
    body: [
      'Primarily in the United Kingdom and the European Economic Area. Where a processor is elsewhere, the transfer is covered by an approved safeguard.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'When this policy changes in a way that matters to you, we will tell you in the app before the change takes effect rather than quietly replacing the page.',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated="Last updated 17 August 2026"
      intro="This explains what Diaspora knows about you, why, who else sees it, and what you can do about it."
      sections={SECTIONS}
    />
  );
}
