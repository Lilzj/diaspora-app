// ─────────────────────────────────────────────────────────────────────────────
// A legal document, rendered
//
// Terms and the privacy policy are the same shape — a title, a date, and a run
// of headed sections — so they share a renderer rather than each hand-rolling
// headings and spacing that drift apart.
//
// ── What this is not ─────────────────────────────────────────────────────────
//
// The text these screens carry is **placeholder copy written to be readable and
// structurally correct, not legal advice, and not reviewed by a lawyer**. Every
// document says so at the top. Shipping a plausible-looking privacy policy that
// nobody has checked is worse than shipping an obviously unfinished one,
// because the first invites a member to rely on it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';

export interface LegalSection {
  heading: string;
  /** Each string is a paragraph. Bullet lines start with "• ". */
  body: string[];
}

interface LegalDocumentProps {
  title: string;
  /** "Last updated 17 August 2026" — shown under the title. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export function LegalDocument({ title, updated, intro, sections }: LegalDocumentProps) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1"
      style={{ backgroundColor: tokens.color.surface.background }}
    >
      <ScreenHeader title={title} showBack />

      <ScrollEndScrollView contentContainerStyle={{ padding: 20 }}>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold uppercase tracking-widest"
        >
          {updated}
        </Text>

        {/*
          Said once, at the top, in the member's language rather than in a
          footnote. A draft that does not admit it is a draft is the thing to
          avoid here.
        */}
        <View
          style={{
            backgroundColor: tokens.color.surface.elevated,
            borderColor: tokens.color.primary[500],
          }}
          className="rounded-2xl border px-4 py-3 mt-3"
          accessible
        >
          <Text
            style={{ color: tokens.color.text.brand }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            ⚗️ Draft
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11.5px] font-semibold leading-relaxed"
          >
            This document is placeholder copy for an internal build. It has not been reviewed by a
            lawyer and is not the agreement that will govern your use of Diaspora.
          </Text>
        </View>

        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[13px] font-medium leading-relaxed mt-4"
        >
          {intro}
        </Text>

        {sections.map((section, index) => (
          <View key={section.heading} className={index === 0 ? 'mt-7' : 'mt-6'}>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[15px] font-black tracking-tight mb-2"
              accessibilityRole="header"
            >
              {index + 1}. {section.heading}
            </Text>

            {section.body.map((paragraph) => (
              <Text
                key={paragraph.slice(0, 40)}
                style={{ color: tokens.color.text.secondary }}
                className={`text-[13px] font-medium leading-relaxed ${
                  paragraph.startsWith('• ') ? 'ml-2 mb-1' : 'mb-2.5'
                }`}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium leading-relaxed mt-8"
        >
          Questions about this document can go through Help &amp; Support, under Contact us.
        </Text>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
