// ─────────────────────────────────────────────────────────────────────────────
// Frequently asked questions
//
// Written from what this app actually does, and in particular from the things
// it does *not* do that a member would reasonably assume it does — Diaspora
// does not hold money that passes between members, does not check that a
// listing is true, and cannot see the contents of a verification document after
// a check completes. Those are the questions that cause the most trouble when
// nobody answers them.
//
// Grouped, because a flat list of twenty questions is a list nobody reads. The
// groups match how somebody would describe their problem: getting started,
// money, safety, and their own content.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';
import {
  CREDIT_IS_ONE_WAY,
  POINTS_ARE_NOT_XP,
  POINTS_CAN_CONVERT,
  XP_IS_NOT_MONEY,
} from '@/lib/reward-copy';

interface Question {
  q: string;
  a: string;
}

interface Group {
  title: string;
  questions: Question[];
}

const GROUPS: Group[] = [
  {
    title: 'Getting started',
    questions: [
      {
        q: 'What is Diaspora for?',
        a: 'Finding the practical things you need after moving somewhere new — a room, a job, a provider who speaks your language, a guide written by somebody who has already done it — and the community around them.',
      },
      {
        q: 'Why does it ask for my location?',
        a: 'So it can show what is near you rather than everything everywhere. You can set it by hand from the banner on Discover, change it whenever you like, or turn on Travel Mode to browse somewhere you are visiting. It is never required.',
      },
      {
        q: 'What does the verified badge mean?',
        a: 'That we have checked something specific — your phone, your identity document, or that you live where you say you do. The badge names which. It is not a judgement about whether somebody is trustworthy, and it says nothing about their listings.',
      },
      {
        q: 'Do I have to verify to use Diaspora?',
        a: 'No. Verification unlocks publishing and some community features, because those are the places where being sure who somebody is matters most. Browsing, saving and messaging do not need it.',
      },
    ],
  },
  {
    title: 'Money',
    questions: [
      {
        q: 'Does Diaspora hold my money?',
        a: 'No. When you pay another member, in cash or with a Pay button in the app, the money goes straight to them. Diaspora does not hold it for you and does not release it when the item arrives, so only pay someone you know or trust. If a payment made in the app goes wrong, report it and Diaspora staff will review it. The money Diaspora keeps is only what you pay Diaspora itself: a subscription, or promoting a listing.',
      },
      {
        q: 'Then what is the Wallet for?',
        // It said "a record, not a balance", while the convert screen said credit
        // "can be spent on the platform". The wallet does hold credit; what that
        // credit can be used for is decision D-7, so this does not say.
        a: `What you have paid Diaspora, what you have given to causes through it, any credit you hold, your points, and your statement. It is not a balance you can pay other members with. ${CREDIT_IS_ONE_WAY}`,
      },
      {
        q: 'Can I get a refund?',
        a: 'For a subscription or a promotion, yes, within the refund window shown on the payment itself. Open the payment from your statement and it will tell you what is still refundable.',
      },
      {
        q: 'How do I stop paying for a plan?',
        a: 'Profile → Grow → Plans. You can move to the free plan or cancel outright, and the screen tells you what happens to the time you have already paid for before you confirm.',
      },
      {
        // It said points are "earned by contributing — publishing a guide,
        // writing a review, volunteering". No content activity grants points
        // (rewards audit §4.2); those earn XP, which is the next question.
        q: 'What are points worth?',
        a: `${POINTS_ARE_NOT_XP} ${POINTS_CAN_CONVERT} They are not a currency and have no value outside Diaspora.`,
      },
      {
        q: 'What is XP?',
        a: `${XP_IS_NOT_MONEY} It goes up when you publish guides, verify who you are and where you live, and when the community confirms what you share, and down when moderation upholds a violation or removes your content. Your reputation page shows what each part is made of.`,
      },
    ],
  },
  {
    title: 'Staying safe',
    questions: [
      {
        q: 'Does Diaspora check that listings are real?',
        a: 'No, and this is the most important thing on this page. We verify people, not listings. A verified member can still post a room that does not exist. Visit before you pay, never send a deposit for something you have not seen, and be wary of anybody who will not meet or video call.',
      },
      {
        q: 'Somebody is asking me to pay outside the app. Is that normal?',
        a: 'For rent or goods, yes — those payments were always between the two of you. What is not normal is pressure: a deadline, a story about why they cannot meet, or a request to move to another app immediately. Report it.',
      },
      {
        q: 'How do I report someone?',
        a: 'Every listing, guide and profile has a report control. Tell us what happened in your own words. Reports are read by people, and you can see the outcome and appeal it from Settings.',
      },
      {
        q: 'Who can see my profile and my location?',
        a: 'Settings → Privacy controls each of these separately: whether you appear in the member directory, who sees your activity, and how precisely your location is shown. The default is the more private option.',
      },
      {
        q: 'What happens to my verification documents?',
        a: 'They are used to complete the check and then kept only as evidence that the check happened. Other members never see them — they see the badge, not what is behind it.',
      },
    ],
  },
  {
    title: 'Your content',
    questions: [
      {
        q: 'Where is everything I have published?',
        a: 'Profile → Creator Studio → Workspace. Everything you have published, your drafts and your archive, with filters by type.',
      },
      {
        q: 'Can I publish as an organisation instead of myself?',
        a: 'Yes, if you hold a role in one. Creator Studio → Organisations has a "Publishing as" switch, and anything you publish while an organisation is selected is attributed to it.',
      },
      {
        q: 'Why can I not edit a post after publishing it?',
        a: 'Organisation announcements cannot be edited or deleted yet — the service behind them only supports publishing and listing. Guides and listings can be edited from Workspace.',
      },
      {
        q: 'Some figures say "development data". What does that mean?',
        a: 'That the number comes from a stand-in rather than a measurement, because Diaspora does not record that thing yet. Anywhere it appears, the app says so rather than showing you an invented figure as though it were real. Counts of things that exist — your guides, your listings, your payments — are always real.',
      },
    ],
  },
];

export default function FaqScreen() {
  const { tokens } = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1"
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader title="FAQ" showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20 }}>
        {GROUPS.map((group) => (
          <View key={group.title} className="mb-6">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest mb-2.5"
              accessibilityRole="header"
            >
              {group.title}
            </Text>

            {group.questions.map((item) => {
              const isOpen = open === item.q;
              return (
                <Pressable
                  key={item.q}
                  onPress={() => setOpen(isOpen ? null : item.q)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={item.q}
                  accessibilityHint={isOpen ? 'Collapses the answer' : 'Shows the answer'}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                  }}
                  className="rounded-2xl border p-4 mb-2"
                >
                  <View className="flex-row items-start">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-black flex-1 mr-3 leading-snug"
                    >
                      {item.q}
                    </Text>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={tokens.color.text.placeholder}
                    />
                  </View>

                  {isOpen ? (
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[12.5px] font-medium leading-relaxed mt-2.5"
                    >
                      {item.a}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed"
        >
          Not answered here? Help &amp; Support has Contact us, which reaches a person.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
