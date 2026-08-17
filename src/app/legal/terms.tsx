// Terms of Service. Placeholder copy — see `components/legal/LegalDocument`.
//
// Written against what this app actually does rather than from a generic
// template: it lists, it introduces people to each other, it takes payments for
// promotion and subscriptions, and it does not hold the money that changes
// hands between members. A terms page describing an escrow service Diaspora
// does not operate would be worse than none.

import React from 'react';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who this agreement is between',
    body: [
      'These terms are between you and Diaspora Platform Ltd, a company registered in England and Wales. "Diaspora", "we" and "us" mean that company. "You" means the person using the app.',
      'By creating an account you accept these terms. If you do not accept them, do not create an account.',
    ],
  },
  {
    heading: 'What Diaspora is',
    body: [
      'Diaspora is a directory and a noticeboard for people living away from where they are from. Members publish guides, list rooms, advertise jobs, offer services and sell items. Other members read those listings and get in touch.',
      'We are not a party to what happens next. When you rent a room, take a job, buy an item or hire a provider through Diaspora, that agreement is between you and the other member.',
      'We do not verify that a listing is accurate, that a room exists, or that a job is real. We verify identity and residency where a member asks us to, and we show you what we have verified — nothing more.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You must be 18 or over. One person, one account. You are responsible for what happens under your account, including anything published from it.',
      'Keep your sign-in details to yourself. Tell us promptly if you think somebody else has access.',
      'We may suspend or close an account that breaks these terms or the Community Guidelines. Where we do, we will tell you why and you can appeal.',
    ],
  },
  {
    heading: 'What you publish',
    body: [
      'You keep ownership of everything you publish. You give us permission to show it inside Diaspora, and to include it in search results and recommendations within the app.',
      'You must have the right to publish what you publish. Do not post other people’s photographs, text or documents as your own.',
      'Do not publish anything that is unlawful, misleading, discriminatory, or that puts somebody at risk. The Community Guidelines set this out in plain terms and form part of these terms.',
      'We may remove anything that breaks these rules, and we will tell you when we do.',
    ],
  },
  {
    heading: 'Money',
    body: [
      'Diaspora charges for two things: subscriptions, and promoting a listing. Those payments are to us and are described at the point you make them.',
      'Money that passes between members — rent, deposits, payment for goods — does not pass through Diaspora. We do not hold it, and we cannot return it.',
      '• Refunds for subscriptions and promotions follow the refund window shown on the payment.',
      '• A dispute with another member is between you and them. We can share what we hold about a listing if a court or the police ask us properly.',
    ],
  },
  {
    heading: 'Points and rewards',
    body: [
      'Points are earned for contributing — publishing a guide, writing a review, volunteering time. They have no cash value in themselves and are not property.',
      'Where points can be converted, the rate and the minimum are shown before you convert, and are set by us. We can change them, and we will say so before a change takes effect.',
      'We may remove points earned through activity that breaks these terms.',
    ],
  },
  {
    heading: 'Ending this agreement',
    body: [
      'You can close your account at any time from Settings. Closing an account does not automatically delete what you published — ask us if you want that too, and we will explain what we can remove.',
      'We can end this agreement if you break these terms, or with reasonable notice if we stop operating the service.',
    ],
  },
  {
    heading: 'Our responsibility, and its limits',
    body: [
      'We will provide the service with reasonable skill and care. We do not promise it will always be available or free of faults.',
      'We are not responsible for what other members do, for the accuracy of what they publish, or for anything that happens between you and them offline.',
      'Nothing here limits liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot be limited by law.',
    ],
  },
  {
    heading: 'Changes, and which law applies',
    body: [
      'We may change these terms. Where a change materially affects you, we will tell you in the app before it takes effect.',
      'These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated="Last updated 17 August 2026"
      intro="These terms explain what Diaspora does, what it does not do, and what we each owe the other. They are written to be read."
      sections={SECTIONS}
    />
  );
}
