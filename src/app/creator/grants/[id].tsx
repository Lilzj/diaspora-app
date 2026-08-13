// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Grant detail and application (Frontend Phase 7, §24)
//
// Detail and application on one screen, because the application form is
// *served* (`GET /grants/{id}/form`) rather than hard-coded, and a served form
// is short enough to sit under the grant it belongs to. Splitting them would
// mean a second fetch and a second screen for four text fields.
//
// The form is rendered from `GrantApplicationField[]`. There is no
// grant-specific component anywhere in this phase: adding a grant with eleven
// questions and a dropdown requires no frontend change.
//
// Validation is deliberately duplicated rather than delegated — required fields
// are checked here *and* on the server. The client check exists so somebody is
// not told at the end that they missed question two; the server check is the
// one that decides, and its refusal renders when it disagrees.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  RequirementList,
} from '@/components/creator-economy';
import { AmountDisplay, FinancialErrorInline } from '@/components/financial';
import {
  useCommunityGrant,
  useCreatorAccess,
  useGrantApplicationActions,
  useGrantApplications,
  useGrantForm,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { presentGrantApplicationState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorRequirement, GrantApplicationField } from '@/types/creator-economy';

export default function GrantDetailScreen() {
  const { showAlert } = useNotification();
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const grantQuery = useCommunityGrant(id);
  const formQuery = useGrantForm(id);
  const applicationsQuery = useGrantApplications();
  const actions = useGrantApplicationActions();
  const access = useCreatorAccess();

  const [isApplying, setApplying] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const grant = grantQuery.grant;
  const form = formQuery.form;

  const application = useMemo(
    () => applicationsQuery.applications.find((item) => item.grantId === id) ?? null,
    [applicationsQuery.applications, id]
  );

  useEffect(() => {
    if (grant) {
      trackCreatorEvent('creator.grant.viewed', {
        grantId: grant.grantId,
        category: grant.category,
      });
    }
  }, [grant?.grantId]);

  // Seed the form from a saved draft, so somebody who left and came back does
  // not start again.
  useEffect(() => {
    if (application?.state === 'Draft' && Object.keys(answers).length === 0) {
      setAnswers(application.answers);
    }
  }, [application]);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const applyRefusal = checkCreatorAccess(CreatorCapabilities.ApplyGrant, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const missing = useMemo(() => {
    if (!form) return [];
    return form.fields
      .filter((field) => field.isRequired && !String(answers[field.key] ?? '').trim())
      .map((field) => field.label);
  }, [answers, form]);

  const allAccepted = form ? form.declarations.every((_, index) => accepted.has(String(index))) : false;
  const canSubmit = missing.length === 0 && allAccepted && !actions.submit.isPending;

  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    if (requirement.actionRoute) router.push(requirement.actionRoute as never);
  }, []);

  const startApplication = useCallback(() => {
    if (!grant) return;
    setApplying(true);
    trackCreatorEvent('creator.grant.application_started', { grantId: grant.grantId });
  }, [grant]);

  const saveDraft = useCallback(() => {
    if (!grant) return;
    actions.saveDraft.mutate(
      { grantId: grant.grantId, answers },
      { onSuccess: () => showAlert({ type: 'success', title: 'Saved', message: 'Your draft is saved. You can come back to it.' }) }
    );
  }, [actions.saveDraft, answers, grant]);

  const submit = useCallback(() => {
    if (!grant || !form) return;

    actions.submit.mutate(
      {
        grantId: grant.grantId,
        answers,
        attachmentIds: [],
        acceptedDeclarations: form.declarations.filter((_, index) => accepted.has(String(index))),
      },
      {
        onSuccess: () => {
          setApplying(false);
          trackCreatorEvent('creator.grant.application_submitted', { grantId: grant.grantId });
        },
      }
    );
  }, [accepted, actions.submit, answers, form, grant]);

  const withdraw = useCallback(() => {
    if (!application) return;
    showAlert({ type: 'error', title: 'Withdraw this application?', message: 'It will not be considered, and you cannot undo this.', buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () =>
            actions.withdraw.mutate(application.applicationId, {
              onSuccess: () =>
                trackCreatorEvent('creator.grant.application_withdrawn', {
                  grantId: application.grantId,
                }),
            }),
        },
      ] });
  }, [actions.withdraw, application]);

  const canApply =
    grant?.isEligible &&
    applyRefusal.allowed &&
    !application &&
    grant.state !== 'Closed' &&
    grant.state !== 'Upcoming';

  return (
    <CreatorScreen
      title={grant?.title ?? 'Grant'}
      subtitle={grant?.category}
      gapKey="grants"
      isEnabled={grantQuery.isEnabled}
      refusal={refusal}
      isLoading={grantQuery.isLoading}
      error={grantQuery.error}
      onRetry={grantQuery.refetch}
      footer={
        isApplying && form ? (
          <>
            <View className="flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save this application as a draft"
                accessibilityState={{ busy: actions.saveDraft.isPending }}
                disabled={actions.saveDraft.isPending}
                onPress={saveDraft}
                style={{ borderColor: tokens.color.border.default }}
                className="flex-1 rounded-full border py-4 items-center mr-2"
              >
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-xs font-black uppercase tracking-wider"
                >
                  {actions.saveDraft.isPending ? 'Saving…' : 'Save draft'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  canSubmit
                    ? 'Submit your grant application'
                    : missing.length > 0
                      ? `Still to answer: ${missing.join(', ')}`
                      : 'Accept every declaration before submitting'
                }
                accessibilityState={{ disabled: !canSubmit, busy: actions.submit.isPending }}
                disabled={!canSubmit}
                onPress={submit}
                style={{
                  backgroundColor: canSubmit ? tokens.color.primary[500] : tokens.color.neutral[200],
                }}
                className="flex-1 rounded-full py-4 items-center"
              >
                <Text
                  style={{ color: canSubmit ? '#FFFFFF' : tokens.color.text.disabled }}
                  className="text-xs font-black uppercase tracking-wider"
                >
                  {actions.submit.isPending ? 'Submitting…' : 'Submit'}
                </Text>
              </Pressable>
            </View>

            {actions.submit.isError ? (
              <View className="mt-2.5">
                <FinancialErrorInline error={actions.submit.error as FinancialError} />
              </View>
            ) : null}
          </>
        ) : canApply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apply for ${grant?.title}`}
            onPress={startApplication}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">Apply</Text>
          </Pressable>
        ) : undefined
      }
    >
      {grant ? (
        <View className="px-5 pt-5">
          {/* ── Funding ──────────────────────────────────────────────────── */}
          <CreatorCard style={{ marginBottom: 20 }}>
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest mb-1"
                >
                  {grant.fundingMinimum ? 'Up to' : 'Funding'}
                </Text>
                <AmountDisplay value={grant.fundingAmount} size="large" />
                {grant.fundingMinimum ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-semibold mt-1"
                  >
                    from {grant.fundingMinimum.symbol ?? ''}
                    {grant.fundingMinimum.amount.toFixed(0)}
                  </Text>
                ) : null}
              </View>

              {grant.deadlineAt ? (
                <View className="items-end">
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-black uppercase tracking-widest mb-1"
                  >
                    Closes
                  </Text>
                  <Text
                    style={{
                      color:
                        grant.state === 'ClosingSoon'
                          ? tokens.color.warning.default
                          : tokens.color.text.primary,
                    }}
                    className="text-[13px] font-black"
                  >
                    {formatRelativeTime(grant.deadlineAt)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[13px] font-medium leading-relaxed"
            >
              {grant.description}
            </Text>

            {grant.applicantCount ? (
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold mt-3"
              >
                {grant.applicantCount.toLocaleString()} people have applied
              </Text>
            ) : null}
          </CreatorCard>

          {/* ── Your application ─────────────────────────────────────────── */}
          {application ? (
            <CreatorSection title="Your application">
              <CreatorCard>
                <CreatorStatusChip presentation={presentGrantApplicationState(application.state)} />

                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[12px] font-semibold mt-2.5 leading-relaxed"
                >
                  {presentGrantApplicationState(application.state).description}
                </Text>

                {application.submittedAt ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-bold mt-2"
                  >
                    Submitted {formatRelativeTime(application.submittedAt)}
                  </Text>
                ) : null}

                {application.informationRequested?.length ? (
                  <View
                    style={{ backgroundColor: tokens.color.warning.surface }}
                    className="rounded-xl p-3 mt-3"
                  >
                    <Text
                      style={{ color: tokens.color.warning.default }}
                      className="text-[10px] font-black uppercase tracking-widest mb-1.5"
                    >
                      The panel needs
                    </Text>
                    {application.informationRequested.map((item, index) => (
                      <Text
                        key={index}
                        style={{ color: tokens.color.text.primary }}
                        className="text-[12px] font-semibold leading-relaxed"
                      >
                        • {item}
                      </Text>
                    ))}
                    {application.respondByAt ? (
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-[11px] font-black mt-2"
                      >
                        Respond by {formatRelativeTime(application.respondByAt)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {application.decisionReason ? (
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[12px] font-semibold mt-3 leading-relaxed"
                  >
                    {application.decisionReason}
                  </Text>
                ) : null}

                {application.canWithdraw ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw this application"
                    accessibilityState={{ busy: actions.withdraw.isPending }}
                    disabled={actions.withdraw.isPending}
                    onPress={withdraw}
                    className="mt-4"
                  >
                    <Text
                      style={{ color: tokens.color.error.default }}
                      className="text-[12px] font-black"
                    >
                      {actions.withdraw.isPending ? 'Withdrawing…' : 'Withdraw application'}
                    </Text>
                  </Pressable>
                ) : null}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Requirements ─────────────────────────────────────────────── */}
          <CreatorSection
            title="Who can apply"
            subtitle="Diaspora decides each of these — the app only shows them"
          >
            <CreatorCard>
              <RequirementList requirements={grant.requirements} onAction={openRequirement} />
            </CreatorCard>
          </CreatorSection>

          {/* ── Deliverables ─────────────────────────────────────────────── */}
          {grant.deliverables.length > 0 ? (
            <CreatorSection title="What you would deliver">
              <CreatorCard>
                {grant.deliverables.map((item, index) => (
                  <View key={index} className="flex-row items-start mb-2 last:mb-0">
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={14}
                      color={tokens.color.text.placeholder}
                      style={{ marginTop: 2 }}
                    />
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-[12px] font-medium flex-1 ml-2 leading-relaxed"
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Not eligible ─────────────────────────────────────────────── */}
          {!grant.isEligible && grant.ineligibleReason ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-4 mb-5 flex-row items-start"
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={tokens.color.warning.default}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                {grant.ineligibleReason}
              </Text>
            </View>
          ) : null}

          {/* ── The form ─────────────────────────────────────────────────── */}
          {isApplying && form ? (
            <>
              <CreatorSection
                title="Your application"
                subtitle="Diaspora sends these questions — they are not built into the app"
              >
                {form.fields.map((field) => (
                  <FormField
                    key={field.key}
                    field={field}
                    value={answers[field.key] ?? ''}
                    onChange={(next) => setAnswers((current) => ({ ...current, [field.key]: next }))}
                  />
                ))}
              </CreatorSection>

              <CreatorSection title="Declarations">
                <CreatorCard padded={false}>
                  {form.declarations.map((declaration, index) => {
                    const key = String(index);
                    const isTicked = accepted.has(key);

                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isTicked }}
                        accessibilityLabel={`Accept: ${declaration}`}
                        onPress={() =>
                          setAccepted((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        style={{
                          borderBottomColor: tokens.color.border.default,
                          borderBottomWidth: index === form.declarations.length - 1 ? 0 : 1,
                        }}
                        className="flex-row items-start px-4 py-3.5"
                      >
                        <View
                          style={{
                            borderColor: isTicked
                              ? tokens.color.primary[500]
                              : tokens.color.border.default,
                            backgroundColor: isTicked ? tokens.color.primary[500] : 'transparent',
                          }}
                          className="w-5 h-5 rounded-md border-2 items-center justify-center mr-3 mt-0.5"
                        >
                          {isTicked ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                        </View>

                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-[12px] font-semibold flex-1 leading-relaxed"
                        >
                          {declaration}
                        </Text>
                      </Pressable>
                    );
                  })}
                </CreatorCard>
              </CreatorSection>

              {missing.length > 0 ? (
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold mb-4 leading-relaxed"
                >
                  Still to answer: {missing.join(', ')}.
                </Text>
              ) : null}
            </>
          ) : null}

          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mb-4 leading-relaxed"
          >
            A panel at Diaspora reviews every application. Nothing about a decision happens on your
            phone.
          </Text>
        </View>
      ) : null}
    </CreatorScreen>
  );
}

/**
 * One question, rendered from its served definition.
 *
 * `kind` decides the input. A `select` renders as a row of choices rather than
 * a native picker: the option sets a grant asks for are short, and a row of
 * buttons is both easier to reach with a screen reader and consistent across
 * the two platforms.
 */
function FormField({
  field,
  value,
  onChange,
}: {
  field: GrantApplicationField;
  value: string;
  onChange: (next: string) => void;
}) {
  const { tokens } = useTheme();
  const isLong = field.kind === 'longText';

  return (
    <View className="mb-4">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-[13px] font-black mb-1"
      >
        {field.label}
        {field.isRequired ? (
          <Text style={{ color: tokens.color.error.default }}> *</Text>
        ) : null}
      </Text>

      {field.helpText ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-medium mb-2 leading-relaxed"
        >
          {field.helpText}
        </Text>
      ) : null}

      {field.kind === 'select' && field.options ? (
        <View className="flex-row flex-wrap">
          {field.options.map((option) => {
            const isActive = value === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${field.label}: ${option.label}`}
                onPress={() => onChange(option.value)}
                style={{
                  backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
                  borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
                }}
                className="rounded-full border px-3.5 py-2 mr-2 mb-2"
              >
                <Text
                  style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                  className="text-[11px] font-black"
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          accessibilityLabel={field.label}
          accessibilityHint={field.helpText ?? undefined}
          value={value}
          onChangeText={onChange}
          multiline={isLong}
          maxLength={field.maxLength ?? undefined}
          keyboardType={field.kind === 'number' ? 'number-pad' : 'default'}
          placeholder={isLong ? 'Take as much space as you need.' : ''}
          placeholderTextColor={tokens.color.text.disabled}
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
            color: tokens.color.text.primary,
            minHeight: isLong ? 110 : undefined,
          }}
          className="rounded-2xl border px-4 py-3.5 text-sm font-medium leading-6"
          textAlignVertical={isLong ? 'top' : 'center'}
        />
      )}

      {field.maxLength && field.kind !== 'select' ? (
        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-bold text-right mt-1"
        >
          {field.maxLength - value.length} left
        </Text>
      ) : null}
    </View>
  );
}
