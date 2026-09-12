// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation builder (Frontend Phase 18, §7 · §33 · §34 · §35)
//
// The WHEN / IF / THEN experience, at `/automation/create`.
//
// ── §7's shape, and why the steps are not a wizard ───────────────────────────
//
// §7 asks for WHEN → IF → THEN and §33 asks for add/remove/preview/test/save.
// The obvious implementation is a five-screen wizard. It is wrong for this
// product for one reason: **most people arrive from a template**, with the
// trigger and actions already chosen and one question to answer. A wizard makes
// them walk through four screens confirming decisions somebody else made.
//
// So this is one scrolling screen with the steps as sections. A member from a
// template sees their question near the top and a Save button; a member
// building from scratch works down the page. Both use the same screen, and
// neither is optimised at the other's expense.
//
// ── §34 and §35 are both here, and both before Save ──────────────────────────
//
// The preview is not a separate screen either — it updates live as the rule
// changes, which is what makes "WHEN a job is posted IF country is Mauritius
// THEN tell me" legible while it is being assembled rather than after.
//
// "Test this" sits next to Save. §35's guarantee is structural — the simulator
// imports nothing that could dispatch — so the button is safe to offer at any
// point, including before the automation exists.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { TestSubjectPicker } from '@/components/automation';
import { useTheme } from '@/design-system';
import {
  useAutomationAccess,
  useAutomationCatalog,
  useAutomationMutations,
  useAutomationPreview,
  useAutomationSimulation,
  useAutomationSupport,
  useScopeFor,
} from '@/hooks/automation';
import {
  ActionPicker,
  AutomationErrorNotice,
  AutomationPreviewCard,
  ConditionEditor,
  CountryValueEditor,
  ScheduleEditor,
  SimulationResult,
  TriggerPicker,
} from '@/components/automation';
import { triggerDefinition, triggersForOwner } from '@/lib/automation/triggers';
import { conditionDefinition, conditionsForTrigger } from '@/lib/automation/conditions';
import { actionDefinition, actionsForTrigger, anyReachesOtherPeople } from '@/lib/automation/actions';
import { canUseAction, canUseTrigger } from '@/lib/automation/access';
import { servedToOwner } from '@/lib/automation/served-support';
import { applyTemplateField, draftFromTemplate, templateById } from '@/lib/automation/templates';
import {
  nameForDraft,
  withActionToggled,
  withConditionAdded,
} from '@/lib/automation/builder-draft';
import { defaultSchedule, previewNextOccurrence } from '@/lib/automation/schedule';
import { canSaveDraft, issuesForStep, validateDraft } from '@/lib/automation/validation';
import { canSimulate } from '@/lib/automation/simulation';
import { trackAutomationEvent } from '@/lib/automation/events';
import { AutomationError, toAutomationError } from '@/lib/automation/errors';
import type {
  AutomationDraft,
  AutomationOwnerKind,
  AutomationSimulation,
  AutomationTemplate,
} from '@/types/automation';

/**
 * Whether a route parameter names a scope this build knows.
 *
 * A deep link carrying an unknown or invented scope falls back to `user`
 * rather than being trusted — §49: the client never treats a request parameter
 * as an authorization, and `platform` is deliberately not in this list even
 * though it is a valid `AutomationOwnerKind`, so a hand-typed
 * `?scope=platform` cannot reach the builder.
 */
const OWNER_KINDS: AutomationOwnerKind[] = [
  'user',
  'creator',
  'community',
  'organization',
  'provider',
  'employer',
  'landlord',
  'seller',
];

function isOwnerKind(value: string | undefined): value is AutomationOwnerKind {
  return !!value && (OWNER_KINDS as string[]).includes(value);
}

export default function AutomationBuilderScreen() {
  const { showAlert } = useNotification();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ template?: string; scope?: string }>();

  // The scope the member chose on the way in. §45: an automation names its
  // owner, and the builder is not the place to guess one — defaulting to
  // `user` when the parameter is absent is the safe reading, because a
  // personal automation reaches nobody but its owner.
  const ownerKind = useMemo<AutomationOwnerKind>(
    () => (isOwnerKind(params.scope) ? params.scope : 'user'),
    [params.scope]
  );

  const scope = useScopeFor(ownerKind);
  const { access } = useAutomationAccess(scope);
  const { support } = useAutomationSupport();

  const template = useMemo(
    () => (params.template ? templateById(params.template) : undefined),
    [params.template]
  );

  const [draft, setDraft] = useState<AutomationDraft>(() =>
    template
      ? draftFromTemplate(template, scope)
      : {
          id: null,
          name: '',
          description: '',
          scope,
          source: 'builder',
          templateId: null,
          trigger: null,
          conditions: [],
          actions: [],
          schedule: null,
        }
  );

  // ── The draft's owner follows the screen's ────────────────────────────────
  //
  // `draft.scope` is set in the initialiser above and was then frozen for the
  // life of the screen, which is wrong whenever the scope is not known at the
  // first render — and on a deep link it never is. Opening
  // `/automation/create?scope=community` mounts once with `params.scope`
  // undefined, so `ownerKind` defaults to `user` and the draft keeps a personal
  // scope for ever. A render later the parameter arrives, the screen's scope
  // becomes the community, and the two disagree:
  //
  //   the trigger list   filters on the screen's scope   → community triggers
  //   the needs panel    checks `draft.scope.ownerKind`  → refuses every one
  //
  // On the device that read "You do not have permission to use this trigger" to
  // the community's own owner, and a save would have written `ownerKind: 'user'`
  // under a trigger only a community may own — refused by the platform, which is
  // how the organisation scope was dead before Phase 5 as well.
  //
  // Compared field by field rather than by identity, and returning `current`
  // unchanged when they agree, so this cannot loop.
  useEffect(() => {
    setDraft((current) =>
      current.scope.ownerKind === scope.ownerKind && current.scope.ownerId === scope.ownerId
        ? current
        : { ...current, scope }
    );
  }, [scope]);

  const [simulation, setSimulation] = useState<AutomationSimulation | null>(null);

  // Phase 5. Which real subject the dry run is checked against. Null is the
  // ordinary case and the test still runs — it simply says which conditions it
  // could not check, rather than blaming the trigger for not carrying them.
  const [testSubjectId, setTestSubjectId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<AutomationError | null>(null);
  const [testError, setTestError] = useState<AutomationError | null>(null);

  const preview = useAutomationPreview(draft, scope);
  const mutations = useAutomationMutations(scope);
  const simulator = useAutomationSimulation(scope);

  // Phase 5. What this deployment says it can actually observe and do, rather
  // than what this build was compiled believing. Measured 11 Sep 2026: 43 of the
  // 49 triggers here are declared `BACKEND_GAP` by the app and served by the
  // platform, and every one of them carried a "not connected" badge in this
  // picker. The answer had been fetched since Wave C-06 and read only by the
  // template gallery.
  const { lookup: servedSupport, owners: servedOwners } = useAutomationCatalog();

  // Captured once per render rather than read inside each helper: two reads in
  // one frame could straddle a minute boundary and make a schedule warning
  // flicker.
  const now = useMemo(() => new Date(), []);
  const issues = useMemo(() => validateDraft(draft, now), [draft, now]);
  const canSave = canSaveDraft(issues);

  useEffect(() => {
    trackAutomationEvent('automation.builder.started', {
      templateId: template?.id,
      source: template ? 'template' : 'builder',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trigger = draft.trigger ? triggerDefinition(draft.trigger.key) : undefined;

  // Who may use a part is the deployment's to say, and it says so in the
  // catalogue. This build's own table stays the answer only for a part the
  // deployment does not name — see `servedToOwner`.
  const availableTriggers = useMemo(
    () =>
      triggersForOwner(scope.ownerKind).filter(
        (entry) =>
          canUseTrigger(entry, scope.ownerKind, access) &&
          servedToOwner(servedOwners, 'trigger', entry.key, scope.ownerKind)
      ),
    [scope.ownerKind, access, servedOwners]
  );

  const availableConditions = useMemo(
    () => (trigger ? conditionsForTrigger(trigger.supportedConditions) : []),
    [trigger]
  );

  const availableActions = useMemo(
    () =>
      trigger
        ? actionsForTrigger(trigger.supportedActions).filter(
            (entry) =>
              canUseAction(entry, scope.ownerKind, access) &&
              servedToOwner(servedOwners, 'action', entry.key, scope.ownerKind)
          )
        : [],
    [trigger, scope.ownerKind, access, servedOwners]
  );

  /**
   * Changing the trigger clears conditions and actions.
   *
   * They are trigger-specific — "wallet balance" makes no sense on "a guide was
   * published" — so keeping them would leave a draft that fails validation with
   * errors pointing at choices the member did not make. Clearing is the
   * honest behaviour and the confirmation below is why it does not surprise.
   */
  const selectTrigger = useCallback(
    (key: string) => {
      const definition = triggerDefinition(key);
      const hasWork = draft.conditions.length > 0 || draft.actions.length > 0;

      const apply = () => {
        setDraft((current) => ({
          ...current,
          trigger: { key, parameters: {} },
          conditions: [],
          actions: [],
          schedule: definition?.delivery === 'schedule' ? defaultSchedule('daily') : null,
        }));
        trackAutomationEvent('automation.trigger.selected', { triggerKey: key });
      };

      if (hasWork && draft.trigger?.key !== key) {
        showAlert({ type: 'warning', title: 'Change what starts this?', message: 'Your conditions and actions will be cleared, because they belong to the current trigger.', buttons: [
            { text: 'Keep as it is', style: 'cancel' },
            { text: 'Change it', style: 'destructive', onPress: apply },
          ] });
        return;
      }

      apply();
    },
    [draft.conditions.length, draft.actions.length, draft.trigger?.key]
  );

  const addCondition = useCallback((key: string) => {
    if (!conditionDefinition(key)) return;

    setDraft((current) => withConditionAdded(current, key) ?? current);
    trackAutomationEvent('automation.condition.added', { conditionKey: key });
  }, []);

  const toggleAction = useCallback((key: string) => {
    setDraft((current) => {
      if (!current.actions.some((action) => action.key === key)) {
        trackAutomationEvent('automation.action.added', { actionKey: key });
      }

      return withActionToggled(current, key);
    });
  }, []);

  const handleSave = useCallback(
    async (activate: boolean) => {
      setSaveError(null);
      try {
        const created = await mutations.create.mutateAsync({
          ...draft,
          name: nameForDraft(draft, trigger?.label),
        });

        if (activate && preview.canActivate) {
          await mutations.setStatus.mutateAsync({
            automationId: created.id,
            status: 'ACTIVE',
          });
        }

        router.replace(`/automation/${created.id}` as never);
      } catch (cause) {
        setSaveError(cause instanceof AutomationError ? cause : null);
      }
    },
    [draft, trigger, mutations, preview.canActivate]
  );

  const handleTest = useCallback(async () => {
    setTestError(null);

    try {
      const result = await simulator.mutateAsync({ draft, sampleSubjectId: testSubjectId });
      setSimulation(result);
    } catch (cause) {
      // The hook only throws when the phone cannot stand in — a chosen event,
      // or a rule the platform refused. Either way the old result is not an
      // answer to this test, so it goes.
      setSimulation(null);
      setTestError(toAutomationError(cause));
    }
  }, [draft, simulator, testSubjectId]);

  const nextOccurrence = useMemo(
    () => (draft.schedule ? previewNextOccurrence(draft.schedule, now) : null),
    [draft.schedule, now]
  );

  const reachesOthers = anyReachesOtherPeople(draft.actions.map((action) => action.key));

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title={template ? template.name : 'New automation'} showBack />

      <KeyboardAwareScrollView className="flex-1 px-4" extraBottomInset={116}>
        {/* A template's questions come first, because for most people they are
            the only thing on this screen that needs an answer. */}
        {template && template.fields.length > 0 ? (
          <TemplateFields template={template} draft={draft} onChange={setDraft} />
        ) : null}

        <Section title="Name">
          <TextInput
            accessibilityLabel="Name for this automation"
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            placeholder={trigger?.label ?? 'My automation'}
            placeholderTextColor={tokens.color.text.placeholder}
            maxLength={80}
            style={{
              color: tokens.color.text.primary,
              borderColor: tokens.color.surface.border,
              backgroundColor: tokens.color.surface.card,
            }}
            className="rounded-xl border px-3.5 py-3 text-[13px] font-semibold"
          />
          {/* What it will be called if the member leaves this alone — the name
              that is actually sent. The box shows the same words as placeholder
              text, which reads like a name already filled in, and the builder
              used to refuse to save underneath it. */}
          {draft.name.trim().length === 0 ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold mt-1.5 leading-relaxed"
            >
              Leave this blank and it will be called “{nameForDraft(draft, trigger?.label)}”.
            </Text>
          ) : null}
          <IssueList issues={issuesForStep(issues, 'name')} />
        </Section>

        {/* WHEN — §7 */}
        <Section title="When" subtitle="What sets this off">
          <TriggerPicker
            triggers={availableTriggers}
            selectedKey={draft.trigger?.key ?? null}
            onSelect={selectTrigger}
            servedSupport={servedSupport}
          />
          <IssueList issues={issuesForStep(issues, 'trigger')} />
        </Section>

        {/* IF — §7 */}
        {trigger && availableConditions.length > 0 ? (
          <Section title="If" subtitle="Narrow it down (optional)">
            {draft.conditions.map((condition) => {
              const definition = conditionDefinition(condition.key);
              if (!definition) return null;

              return (
                <ConditionEditor
                  key={condition.id}
                  condition={condition}
                  definition={definition}
                  onChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      conditions: current.conditions.map((entry) =>
                        entry.id === next.id ? next : entry
                      ),
                    }))
                  }
                  onRemove={() =>
                    setDraft((current) => ({
                      ...current,
                      conditions: current.conditions.filter((entry) => entry.id !== condition.id),
                    }))
                  }
                />
              );
            })}

            <AddConditionMenu
              conditions={availableConditions.filter(
                (definition) => !draft.conditions.some((entry) => entry.key === definition.key)
              )}
              onAdd={addCondition}
            />

            <IssueList issues={issuesForStep(issues, 'conditions')} />
          </Section>
        ) : null}

        {/* THEN — §7 */}
        <Section title="Then" subtitle="What should happen">
          <ActionPicker
            actions={availableActions}
            selectedKeys={draft.actions.map((action) => action.key)}
            onToggle={toggleAction}
            enabledChannels={support?.enabledChannels ?? ['InApp']}
            servedSupport={servedSupport}
          />
          <IssueList issues={issuesForStep(issues, 'actions')} />
        </Section>

        {draft.schedule ? (
          <Section title="When it runs">
            <ScheduleEditor
              schedule={draft.schedule}
              onChange={(schedule) => setDraft((current) => ({ ...current, schedule }))}
              nextOccurrenceLabel={
                nextOccurrence?.instant
                  ? nextOccurrence.label
                  : (nextOccurrence?.unavailableReason ?? null)
              }
              // Always false: §41 — the client's estimate is never presented as
              // the schedule. When GAP-003 ships this reads the server's value.
              isAuthoritative={false}
            />
            <IssueList issues={issuesForStep(issues, 'schedule')} />
          </Section>
        ) : null}

        {/* §34 — live, not a separate screen. */}
        {draft.trigger ? (
          <Section title="Before you turn it on">
            <AutomationPreviewCard
              preview={preview}
              onNavigate={(route) => router.push(route as never)}
              showAudience={reachesOthers}
            />
          </Section>
        ) : null}

        {/* Phase 5. Above the result rather than beside the button: the choice
            is part of what the test *means*, and a member who has just read a
            result showing unchecked conditions should find the reason directly
            under it. Renders nothing for a trigger with no pickable subject. */}
        {draft.trigger ? (
          <TestSubjectPicker
            triggerKey={draft.trigger.key}
            subjectId={testSubjectId}
            onChange={setTestSubjectId}
          />
        ) : null}

        {testError ? (
          <Section title="Test result">
            <AutomationErrorNotice
              message={testError.message}
              hint={testError.recoveryHint}
              blame={testError.blame}
            />
          </Section>
        ) : simulation ? (
          <Section title="Test result">
            <SimulationResult simulation={simulation} />
          </Section>
        ) : null}

        {saveError ? (
          <View className="mb-4">
            <AutomationErrorNotice
              message={saveError.message}
              hint={saveError.recoveryHint}
              blame={saveError.blame}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderTopColor: tokens.color.surface.border,
        }}
        className="border-t px-4 pt-3 pb-6"
      >
        {mutations.isOffline ? (
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[11px] font-black text-center mb-2"
          >
            {/* §61: never claim a server-side automation was activated offline. */}
            You are offline. Nothing can be saved to Diaspora right now.
          </Text>
        ) : null}

        <View className="flex-row">
          {canSimulate(draft) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Test this automation"
              accessibilityHint="Shows what would happen. Nothing is actually sent."
              onPress={handleTest}
              disabled={simulator.isPending}
              style={{ borderColor: tokens.color.surface.border }}
              className="rounded-2xl border px-4 py-3.5 mr-2 flex-row items-center"
            >
              {simulator.isPending ? (
                <ActivityIndicator size="small" color={tokens.color.text.primary} />
              ) : (
                <Ionicons name="flask-outline" size={16} color={tokens.color.text.primary} />
              )}
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black ml-1.5">
                Test
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={preview.canActivate ? 'Save and turn on' : 'Save as a draft'}
            accessibilityState={{ disabled: !canSave || mutations.create.isPending }}
            disabled={!canSave || mutations.create.isPending}
            onPress={() => handleSave(preview.canActivate)}
            style={{
              backgroundColor:
                canSave && !mutations.create.isPending
                  ? tokens.color.primary[500]
                  : tokens.color.text.disabled,
            }}
            className="flex-1 rounded-2xl py-3.5 items-center justify-center"
          >
            {mutations.create.isPending ? (
              <ActivityIndicator size="small" color={tokens.color.text.inverse} />
            ) : (
              <Text style={{ color: tokens.color.text.inverse }} className="text-sm font-black">
                {/* The label tells the truth about what the button does. A
                    draft with an unmet dependency saves without activating, and
                    a button that said "Turn on" would be promising otherwise. */}
                {preview.canActivate ? 'Save and turn on' : 'Save as a draft'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-6 mt-2">
      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.primary[600] }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-semibold mt-0.5 mb-2.5"
        >
          {subtitle}
        </Text>
      ) : (
        <View className="mb-2.5" />
      )}
      {children}
    </View>
  );
}

/**
 * The issues for one step.
 *
 * Rendered next to the control they belong to rather than collected at the
 * bottom — a message about a field three screens up is the failure mode every
 * long form has, and §33's step field exists to avoid it.
 */
function IssueList({ issues }: { issues: ReturnType<typeof validateDraft> }) {
  const { tokens } = useTheme();

  if (issues.length === 0) return null;

  return (
    <View className="mt-2">
      {issues.map((issue, index) => (
        <View
          key={`${issue.message}-${index}`}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${issue.severity === 'error' ? 'Needs fixing' : 'Worth knowing'}. ${issue.message}`}
          className="flex-row items-start py-1"
        >
          <Ionicons
            name={issue.severity === 'error' ? 'alert-circle' : 'information-circle-outline'}
            size={14}
            color={
              issue.severity === 'error' ? tokens.color.error.default : tokens.color.warning.default
            }
            style={{ marginTop: 1 }}
          />
          <Text
            style={{
              color:
                issue.severity === 'error'
                  ? tokens.color.error.default
                  : tokens.color.text.secondary,
            }}
            className="text-[11px] font-semibold ml-1.5 flex-1 leading-relaxed"
          >
            {issue.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AddConditionMenu({
  conditions,
  onAdd,
}: {
  conditions: ReturnType<typeof conditionsForTrigger>;
  onAdd: (key: string) => void;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);

  if (conditions.length === 0) return null;

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a condition"
        onPress={() => setOpen(true)}
        style={{ borderColor: tokens.color.surface.border }}
        className="rounded-2xl border border-dashed p-3.5 flex-row items-center justify-center"
      >
        <Ionicons name="add" size={16} color={tokens.color.text.secondary} />
        <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-black ml-1">
          Add a condition
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.surface.border,
      }}
      className="rounded-2xl border p-3"
    >
      {conditions.map((definition) => (
        <Pressable
          key={definition.key}
          accessibilityRole="button"
          accessibilityLabel={definition.label}
          accessibilityHint={definition.description}
          onPress={() => {
            onAdd(definition.key);
            setOpen(false);
          }}
          className="py-2.5"
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
            {definition.label}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-medium mt-0.5"
          >
            {definition.description}
          </Text>
        </Pressable>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={() => setOpen(false)}
        className="pt-2"
      >
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-black text-center"
        >
          Cancel
        </Text>
      </Pressable>
    </View>
  );
}

/** A template's questions — the two or three decisions genuinely the member's. */
function TemplateFields({
  template,
  draft,
  onChange,
}: {
  template: AutomationTemplate;
  draft: AutomationDraft;
  onChange: (draft: AutomationDraft) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View className="mt-3">
      {template.fields.map((field, index) => {
        const currentValue = readFieldValue(draft, field);

        return (
          <View key={`${field.target}-${field.targetId ?? field.key}-${index}`} className="mb-4">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black mb-1"
            >
              {field.label}
            </Text>
            {field.helpText ? (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[11px] font-medium mb-2 leading-relaxed"
              >
                {field.helpText}
              </Text>
            ) : null}

            {field.choices ? (
              <View className="flex-row flex-wrap">
                {field.choices.map((choice) => {
                  const selected = String(currentValue ?? '') === choice.value;
                  return (
                    <Pressable
                      key={choice.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={choice.label}
                      onPress={() => onChange(applyTemplateField(draft, field, choice.value))}
                      style={{
                        backgroundColor: selected
                          ? tokens.color.primary[500]
                          : tokens.color.surface.card,
                        borderColor: selected
                          ? tokens.color.primary[500]
                          : tokens.color.surface.border,
                      }}
                      className="rounded-full border px-3.5 py-2 mr-1.5 mb-1.5"
                    >
                      <Text
                        style={{
                          color: selected
                            ? tokens.color.text.inverse
                            : tokens.color.text.secondary,
                        }}
                        className="text-[11px] font-black"
                      >
                        {choice.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : field.valueKind === 'country' ? (
              // The code the platform compares, chosen by name — see
              // `CountryValueEditor`. A text box here asked for "Mauritius" and
              // the platform compares `MU`.
              <CountryValueEditor
                value={(currentValue ?? null) as AutomationDraft['conditions'][number]['value']}
                isList={false}
                onChange={(next) => onChange(applyTemplateField(draft, field, next))}
              />
            ) : (
              <TextInput
                accessibilityLabel={field.label}
                value={currentValue === null || currentValue === undefined ? '' : String(currentValue)}
                onChangeText={(text) =>
                  onChange(
                    applyTemplateField(
                      draft,
                      field,
                      field.valueKind === 'money' || field.valueKind === 'number'
                        ? text === ''
                          ? null
                          : Number(text)
                        : text
                    )
                  )
                }
                keyboardType={
                  field.valueKind === 'money' || field.valueKind === 'number' ? 'numeric' : 'default'
                }
                placeholderTextColor={tokens.color.text.placeholder}
                style={{
                  color: tokens.color.text.primary,
                  borderColor: tokens.color.surface.border,
                  backgroundColor: tokens.color.surface.card,
                }}
                className="rounded-xl border px-3.5 py-3 text-[13px] font-semibold"
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function readFieldValue(
  draft: AutomationDraft,
  field: AutomationTemplate['fields'][number]
): unknown {
  if (field.target === 'trigger') return draft.trigger?.parameters[field.key];
  if (field.target === 'condition') {
    return draft.conditions.find((condition) => condition.id === field.targetId)?.value;
  }
  return draft.actions.find((action) => action.id === field.targetId)?.parameters[field.key];
}
