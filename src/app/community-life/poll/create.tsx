// ─────────────────────────────────────────────────────────────────────────────
// Create a poll (§23)
//
// Question, options, voting type, audience, anonymity, whether votes can be
// changed, open and close dates, preview, publish.
//
// §23 also says: do not allow editing after voting if backend rules prohibit it.
// That rule belongs to the server, so this screen does not offer an editor for a
// poll with responses at all — the poll screen's manage section offers close and
// publish-results instead, which are the operations that remain legal.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  Section,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import { useCreatePoll, useMyOrganizations } from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { PollAudience, PollVotingType } from '@/types/community-advanced';
import type { FinancialError } from '@/lib/financial-errors';

const VOTING_TYPES: { value: PollVotingType; label: string }[] = [
  { value: 'SingleChoice', label: 'Choose one' },
  { value: 'MultipleChoice', label: 'Choose several' },
  { value: 'OpenResponse', label: 'Written answer' },
];

const AUDIENCES: { value: PollAudience; label: string }[] = [
  { value: 'OrganizationMembers', label: 'Our members' },
  { value: 'Public', label: 'Anyone' },
  { value: 'Neighborhood', label: 'The neighbourhood' },
  { value: 'Country', label: 'The country' },
];

export default function CreatePollScreen() {
  const { tokens } = useTheme();
  const { data: organizations, isLoading: isLoadingOrgs } = useMyOrganizations();
  const create = useCreatePoll();

  const [organizationId, setOrganizationId] = useState('');
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [votingType, setVotingType] = useState<PollVotingType>('SingleChoice');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [maxSelections, setMaxSelections] = useState('2');
  const [audience, setAudience] = useState<PollAudience>('OrganizationMembers');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowsChange, setAllowsChange] = useState(true);
  const [closesAt, setClosesAt] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (!organizationId && organizations.length > 0) {
      setOrganizationId(organizations[0].organizationId);
    }
  }, [organizations, organizationId]);

  const filledOptions = options.map((option) => option.trim()).filter(Boolean);
  const needsOptions = votingType !== 'OpenResponse';

  const missing = [
    !question.trim() && 'a question',
    needsOptions && filledOptions.length < 2 && 'at least two options',
  ].filter(Boolean) as string[];

  const submit = (publish: boolean) => {
    if (missing.length > 0) {
      setShowValidation(true);
      return;
    }

    trackCommunityEvent('community.poll.created', {
      organizationId: organizationId || undefined,
      votingType,
      audience,
      optionCount: filledOptions.length,
      isAnonymous,
    });

    create.mutate(
      {
        question: question.trim(),
        description: description.trim() || undefined,
        votingType,
        options: needsOptions ? filledOptions.map((label) => ({ label })) : [],
        maxSelections:
          votingType === 'MultipleChoice' ? Number(maxSelections) || filledOptions.length : undefined,
        audience,
        organizationId: organizationId || undefined,
        isAnonymous,
        allowsChange,
        closesAt: closesAt.trim() || undefined,
        publish,
      },
      { onSuccess: (poll) => router.replace(`/community-life/poll/${poll.pollId}` as never) }
    );
  };

  return (
    <CommunityScreen
      title="Ask a question"
      subtitle="Let your community decide"
      gapKey="polls"
      isLoading={isLoadingOrgs}
      footer={
        organizations.length > 0 ? (
          <View>
            {create.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={create.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label="Open the poll"
              icon="megaphone-outline"
              busy={create.isPending}
              disabled={create.isPending}
              accessibilityHint={
                missing.length > 0 ? `Still needs ${missing.join(' and ')}` : 'Opens it for voting'
              }
              onPress={() => submit(true)}
            />
            <View className="mt-2.5">
              <SecondaryButton
                label="Save as a draft"
                disabled={create.isPending}
                onPress={() => submit(false)}
              />
            </View>
          </View>
        ) : null
      }
    >
      {organizations.length === 0 && !isLoadingOrgs ? (
        <EmptyState
          icon="business-outline"
          title="You need an organisation"
          body="Polls are asked by an organisation, so their audience is somebody's members rather than nobody in particular."
          action="Register an organisation"
          onAction={() => router.push('/community-life/org/create')}
        />
      ) : (
        <View className="px-5 pt-4">
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold mb-2">
            Asking as
          </Text>
          <ChipRow
            accessibilityLabel="Which organisation is asking"
            options={organizations.map((organization) => ({
              value: organization.organizationId,
              label: organization.name,
            }))}
            value={organizationId}
            onChange={setOrganizationId}
          />

          <View className="h-4" />

          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-bold mb-1"
            nativeID="poll-question"
          >
            Your question *
          </Text>
          <TextInput
            accessibilityLabel="Your question, required"
            value={question}
            onChangeText={setQuestion}
            multiline
            numberOfLines={2}
            maxLength={180}
            placeholder="Which date works best for the Independence Day celebration?"
            placeholderTextColor={tokens.color.text.placeholder}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor:
                showValidation && !question.trim()
                  ? tokens.color.border.error
                  : tokens.color.border.default,
              color: tokens.color.text.primary,
              minHeight: 72,
              textAlignVertical: 'top',
            }}
            className="rounded-xl border px-4 py-3 text-sm font-semibold"
          />

          <View className="h-4" />

          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-bold mb-1"
            nativeID="poll-description"
          >
            Anything else they should know? (optional)
          </Text>
          <TextInput
            accessibilityLabel="Extra context, optional"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            placeholder="The park is available on three Saturdays."
            placeholderTextColor={tokens.color.text.placeholder}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
              color: tokens.color.text.primary,
              minHeight: 80,
              textAlignVertical: 'top',
            }}
            className="rounded-xl border px-4 py-3 text-sm font-semibold"
          />

          <Section title="How they answer" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <ChipRow
                accessibilityLabel="How people answer"
                options={VOTING_TYPES}
                value={votingType}
                onChange={setVotingType}
              />

              {needsOptions ? (
                <View className="mt-3">
                  {options.map((option, index) => (
                    <View key={index} className="flex-row items-center mb-2.5">
                      <Ionicons
                        name={
                          votingType === 'MultipleChoice' ? 'square-outline' : 'radio-button-off'
                        }
                        size={20}
                        color={tokens.color.text.placeholder}
                      />
                      <TextInput
                        accessibilityLabel={`Option ${index + 1}`}
                        value={option}
                        onChangeText={(text) =>
                          setOptions(options.map((item, i) => (i === index ? text : item)))
                        }
                        placeholder={`Option ${index + 1}`}
                        placeholderTextColor={tokens.color.text.placeholder}
                        style={{
                          backgroundColor: tokens.color.surface.card,
                          borderColor:
                            showValidation && filledOptions.length < 2
                              ? tokens.color.border.error
                              : tokens.color.border.default,
                          color: tokens.color.text.primary,
                          minHeight: 48,
                        }}
                        className="flex-1 rounded-xl border px-3 ml-2.5 text-sm font-semibold"
                      />
                      {options.length > 2 ? (
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color={tokens.color.text.placeholder}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove option ${index + 1}`}
                          style={{ marginLeft: 8 }}
                          onPress={() => setOptions(options.filter((_, i) => i !== index))}
                        />
                      ) : null}
                    </View>
                  ))}

                  <SecondaryButton
                    label="Add an option"
                    icon="add"
                    onPress={() => setOptions([...options, ''])}
                  />

                  {votingType === 'MultipleChoice' ? (
                    <View className="flex-row items-center mt-4">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-xs font-bold flex-1"
                        nativeID="poll-max"
                      >
                        How many can they pick?
                      </Text>
                      <TextInput
                        accessibilityLabel="Maximum selections"
                        keyboardType="number-pad"
                        value={maxSelections}
                        onChangeText={setMaxSelections}
                        style={{
                          backgroundColor: tokens.color.surface.card,
                          borderColor: tokens.color.border.default,
                          color: tokens.color.text.primary,
                          width: 64,
                          minHeight: 44,
                        }}
                        className="rounded-xl border px-3 text-sm font-bold text-center"
                      />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="mt-3">
                  <InlineRefusal
                    icon="create-outline"
                    reason="People write their answer in their own words. There are no options to set."
                  />
                </View>
              )}
            </View>
          </Section>

          <Section title="Who can vote" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <ChipRow
                accessibilityLabel="Who can vote"
                options={AUDIENCES}
                value={audience}
                onChange={setAudience}
              />
              <View className="mt-2">
                <InlineRefusal
                  icon="shield-outline"
                  reason="Diaspora checks the audience before showing anybody the poll — a members-only poll is never returned to somebody who is not a member."
                />
              </View>
            </View>
          </Section>

          <Section title="Rules" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <View className="flex-row items-center justify-between py-1">
                  <View className="flex-1 pr-3">
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                      Anonymous voting
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                    >
                      You will see the totals but not who voted for what.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Anonymous voting"
                    value={isAnonymous}
                    onValueChange={setIsAnonymous}
                    trackColor={{
                      false: tokens.color.surface.elevated,
                      true: tokens.color.primary[500],
                    }}
                  />
                </View>

                <View
                  className="flex-row items-center justify-between py-1 mt-3 pt-3"
                  style={{ borderTopWidth: 1, borderTopColor: tokens.color.border.default }}
                >
                  <View className="flex-1 pr-3">
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                      Let people change their vote
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                    >
                      Off means one vote each, final, and results stay hidden until the poll closes.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Let people change their vote"
                    value={allowsChange}
                    onValueChange={setAllowsChange}
                    trackColor={{
                      false: tokens.color.surface.elevated,
                      true: tokens.color.primary[500],
                    }}
                  />
                </View>
              </Card>

              <View className="mt-4">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xs font-bold mb-1"
                  nativeID="poll-closes"
                >
                  Closes on (optional)
                </Text>
                <TextInput
                  accessibilityLabel="Closing date, optional"
                  accessibilityHint="Type a date as year, month, day"
                  value={closesAt}
                  onChangeText={setClosesAt}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={tokens.color.text.placeholder}
                  style={{
                    backgroundColor: tokens.color.surface.card,
                    borderColor: tokens.color.border.default,
                    color: tokens.color.text.primary,
                    minHeight: 48,
                  }}
                  className="rounded-xl border px-4 text-sm font-semibold"
                />
              </View>
            </View>
          </Section>

          {/* Preview — §23 asks for one */}
          <Section title="Preview" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-sm font-black tracking-tight leading-snug"
                >
                  {question.trim() || 'Your question will appear here'}
                </Text>
                {description.trim() ? (
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-xs font-semibold mt-1.5 leading-relaxed"
                  >
                    {description.trim()}
                  </Text>
                ) : null}
                <View className="mt-3">
                  {needsOptions ? (
                    filledOptions.map((option, index) => (
                      <View key={index} className="flex-row items-center mb-2">
                        <Ionicons
                          name={
                            votingType === 'MultipleChoice' ? 'square-outline' : 'radio-button-off'
                          }
                          size={16}
                          color={tokens.color.text.placeholder}
                        />
                        <Text
                          style={{ color: tokens.color.text.secondary }}
                          className="text-xs font-semibold ml-2"
                        >
                          {option}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-xs font-semibold italic"
                    >
                      A box for people to write in
                    </Text>
                  )}
                </View>
              </Card>
            </View>
          </Section>
        </View>
      )}
    </CommunityScreen>
  );
}
