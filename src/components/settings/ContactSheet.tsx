// ─────────────────────────────────────────────────────────────────────────────
// Contact us, and Report a problem
//
// One sheet, two configurations. They are the same form — a category, a
// message, a send — and the only differences are the wording and the list of
// categories. Two components would drift, and this app has already paid for
// that twice: two organisation models, two badge systems.
//
// ── The category list always ends in "Something else" ────────────────────────
//
// A fixed list of categories with no escape hatch forces somebody with an
// unusual problem to pick the nearest wrong one, which is worse than no
// category at all: it routes them to the wrong place *and* loses the
// information that their problem did not fit.
//
// ── There is no backend ──────────────────────────────────────────────────────
//
// Nothing receives these messages yet. The sheet says so before you type rather
// than after you press send, because a form that accepts a report about a
// safety problem and quietly discards it is the worst possible version of this
// screen. See `Support-Backend-Gaps.md`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/overlays/AppModal';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';

export type ContactKind = 'contact' | 'report';

const CONFIG: Record<
  ContactKind,
  { title: string; subtitle: string; placeholder: string; categories: string[] }
> = {
  contact: {
    title: 'Contact us',
    subtitle: 'A person reads these. Tell us what you need in your own words.',
    placeholder: 'What can we help with?',
    categories: [
      'My account',
      'Payments and refunds',
      'Verification',
      'Publishing and listings',
      'Points and rewards',
      'A suggestion',
      'Something else',
    ],
  },
  report: {
    title: 'Report a problem',
    subtitle: 'Tell us what happened. Include anything that would help us find it.',
    placeholder: 'What went wrong, and where?',
    categories: [
      'Something is broken',
      'A listing looks fake',
      'Someone is behaving badly',
      'A payment went wrong',
      'Wrong or misleading information',
      'Privacy concern',
      'Something else',
    ],
  },
};

interface ContactSheetProps {
  kind: ContactKind;
  visible: boolean;
  onClose: () => void;
}

export function ContactSheet({ kind, visible, onClose }: ContactSheetProps) {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const config = CONFIG[kind];

  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const isValid = Boolean(category) && message.trim().length >= 10;

  const reset = () => {
    setCategory(null);
    setMessage('');
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title={config.title}
      subtitle={config.subtitle}
      height="88%"
      testID={`contact-sheet-${kind}`}
    >
      {/*
        Said before the form, not after. Somebody typing out a safety problem
        deserves to know it is not going anywhere yet *while they decide whether
        to type it*.
      */}
      <View
        style={{
          backgroundColor: tokens.color.surface.elevated,
          borderColor: tokens.color.primary[500],
        }}
        className="rounded-2xl border px-4 py-3 mb-4"
        accessible
      >
        <Text
          style={{ color: tokens.color.text.brand }}
          className="text-[10px] font-black uppercase tracking-widest mb-1"
        >
          ⚗️ Not connected yet
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11.5px] font-semibold leading-relaxed"
        >
          Diaspora has no support inbox in this build, so nothing is sent. If this is urgent,
          report it from the listing or profile it concerns — those reports do reach moderation.
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-2.5"
      >
        What is it about?
      </Text>

      <View className="flex-row flex-wrap mb-4">
        {config.categories.map((option) => {
          const isActive = category === option;
          return (
            <Pressable
              key={option}
              onPress={() => setCategory(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={option}
              style={{
                backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.background,
                borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="rounded-xl border px-3 py-2 mr-2 mb-2"
            >
              <Text
                style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                className="text-[11.5px] font-bold"
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest mb-2"
      >
        Your message
      </Text>

      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={config.placeholder}
        placeholderTextColor={tokens.color.text.placeholder}
        accessibilityLabel="Your message"
        multiline
        numberOfLines={6}
        style={{
          color: tokens.color.text.primary,
          backgroundColor: tokens.color.surface.background,
          borderColor: tokens.color.border.default,
          minHeight: 130,
          textAlignVertical: 'top',
        }}
        className="rounded-2xl border px-3.5 py-3 text-[13px] font-medium mb-2"
      />

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10.5px] font-medium mb-4"
      >
        {message.trim().length < 10
          ? 'A sentence or two is enough — enough for somebody to act on.'
          : `${message.trim().length} characters`}
      </Text>

      <Button
        label="Send"
        variant="primary"
        disabled={!isValid}
        onPress={() => {
          // Deliberately not a success toast. Nothing was sent, and telling
          // somebody their report is on its way when it is not is the failure
          // this whole notice exists to avoid.
          showAlert({
            type: 'info',
            title: 'Not sent',
            message:
              'There is no support inbox behind this yet, so your message has not gone anywhere. It has not been saved either — nothing here would survive closing the sheet.',
            buttons: [
              {
                text: 'Close',
                style: 'cancel',
                onPress: () => {
                  reset();
                  onClose();
                },
              },
            ],
          });
        }}
      />
    </Sheet>
  );
}
