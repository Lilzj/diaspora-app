// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation detail (Frontend Phase 18, §34 · §40 · §44 · §51)
//
// One automation: what it does, whether it can run, what it has done, and the
// controls to pause, resume, test and delete it.
//
// ── §44 and §40, and the number that has to be honest ────────────────────────
//
// Pausing an automation may cancel executions that were already pending, and
// §40 asks that to be handled rather than glossed. The count comes from the
// **server's** response, never from a client-side guess — and in this build it
// is always zero, because nothing is scheduled, which the confirmation says
// plainly rather than pretending there was something to cancel.
//
// ── §51, and why the audit trail is here rather than on its own screen ───────
//
// An audit trail nobody opens is an audit trail nobody checks. It sits at the
// bottom of the automation it belongs to, and every entry carries its
// provenance: a change this device just made reads "on this device" until the
// server confirms it, visually distinct from a server-confirmed entry. §51
// forbids the frontend fabricating audit records, and mixing local optimism
// with server truth would be worse than having no trail at all.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  useAutomation,
  useAutomationAudit,
  useAutomationMutations,
  useAutomationPreview,
  useAutomationRuns,
  useAutomationSimulation,
  usePersonalScope,
} from '@/hooks/automation';
import {
  AutomationErrorNotice,
  AutomationPreviewCard,
  AutomationStatusBadge,
  RunRow,
  SimulationResult,
} from '@/components/automation';
import { anyReachesOtherPeople } from '@/lib/automation/actions';
import { trackAutomationEvent } from '@/lib/automation/events';
import { AutomationError } from '@/lib/automation/errors';
import { useBottomInset } from '@/components/layout/bottom-inset';
import type {
  AutomationDefinition,
  AutomationDraft,
  AutomationScope,
  AutomationSimulation,
} from '@/types/automation';

export default function AutomationDetailScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { showAlert } = useNotification();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const automationId = params.id ?? null;

  // The automation's **own** scope, not the viewer's. A community automation
  // previewed under a personal scope would fetch the wrong audience — "only
  // you" for something that reaches a thousand people — which is the most
  // dangerous possible misreading of this screen. Falls back to personal only
  // while the record is loading.
  const personal = usePersonalScope();
  const { automation, isLoading, error } = useAutomation(automationId);
  const scope = automation?.scope ?? personal;
  const { runs } = useAutomationRuns(automationId);
  const { audit } = useAutomationAudit(automationId);
  const mutations = useAutomationMutations(scope);
  const simulator = useAutomationSimulation(scope);

  const [simulation, setSimulation] = useState<AutomationSimulation | null>(null);
  const [actionError, setActionError] = useState<AutomationError | null>(null);

  const draft = useMemo<AutomationDraft | null>(
    () => (automation ? toDraft(automation) : null),
    [automation]
  );

  const handlePause = useCallback(async () => {
    if (!automation) return;
    setActionError(null);

    try {
      const result = await mutations.setStatus.mutateAsync({
        automationId: automation.id,
        status: 'PAUSED',
      });

      // §40: the count is the server's, and zero is said honestly rather than
      // being hidden. "Nothing was waiting to run" is a true and useful thing
      // to know when the platform has no scheduler.
      if (result.cancelledRuns > 0) {
        showAlert({ type: 'info', title: 'Paused', message: `${result.cancelledRuns} ${result.cancelledRuns === 1 ? 'run that was' : 'runs that were'} waiting to happen ${result.cancelledRuns === 1 ? 'has' : 'have'} been cancelled.` });
      }
    } catch (cause) {
      setActionError(cause instanceof AutomationError ? cause : null);
    }
  }, [automation, mutations]);

  const handleResume = useCallback(async () => {
    if (!automation) return;
    setActionError(null);

    try {
      await mutations.setStatus.mutateAsync({
        automationId: automation.id,
        status: 'ACTIVE',
      });
    } catch (cause) {
      setActionError(cause instanceof AutomationError ? cause : null);
    }
  }, [automation, mutations]);

  const handleDelete = useCallback(() => {
    if (!automation) return;

    showAlert({ type: 'error', title: 'Delete this automation?', message: 'It will stop running and cannot be brought back. Anything it has already done stays as it is.', buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mutations.remove.mutateAsync(automation.id);
              router.back();
            } catch (cause) {
              setActionError(cause instanceof AutomationError ? cause : null);
            }
          },
        },
      ] });
  }, [automation, mutations]);

  const handleTest = useCallback(async () => {
    if (!draft) return;
    const result = await simulator.mutateAsync(draft);
    setSimulation(result);
  }, [draft, simulator]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Automation" showBack />
        <View className="py-16 items-center">
          <ActivityIndicator color={tokens.color.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !automation || !draft) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
        <ScreenHeader title="Automation" showBack />
        <View className="px-4 pt-4">
          <AutomationErrorNotice
            /* Was: "Diaspora cannot store automations yet". It can; the
               registry serves this automation by id. A platform blame is a
               fault on this request, and saying otherwise told a member their
               saved automation did not exist. */
            message={
              error?.blame === 'platform'
                ? 'This automation could not be loaded'
                : (error?.message ?? 'That automation could not be found.')
            }
            hint={
              error?.blame === 'platform'
                ? (error?.recoveryHint
                  ?? 'This is on the platform rather than on your setup. The automation itself is untouched.')
                : error?.recoveryHint
            }
            blame={error?.blame ?? 'member'}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title={automation.name} showBack />

      <ScrollEndScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="flex-row items-center mt-2 mb-4">
          <AutomationStatusBadge
            status={automation.status}
            isSimulated={automation.isSimulated}
          />
        </View>

        {automation.attentionReason ? (
          <View className="mb-4">
            <AutomationErrorNotice
              message={automation.attentionReason}
              hint="Fix this and the automation will start working again."
              blame="member"
              onAction={() => router.push('/settings/integrations' as never)}
              actionLabel="Open connections"
            />
          </View>
        ) : null}

        {actionError ? (
          <View className="mb-4">
            <AutomationErrorNotice
              message={actionError.message}
              hint={actionError.recoveryHint}
              blame={actionError.blame}
            />
          </View>
        ) : null}

        <PreviewSection draft={draft} scope={scope} />

        {simulation ? (
          <View className="mb-6">
            <SectionHeading title="Test result" />
            <SimulationResult simulation={simulation} />
          </View>
        ) : null}

        <View className="mb-6">
          <SectionHeading
            title="Recent runs"
            action={
              runs.length > 0
                ? {
                    label: 'See all',
                    onPress: () =>
                      router.push(`/automation/history?automationId=${automation.id}` as never),
                  }
                : undefined
            }
          />

          {runs.length === 0 ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-medium leading-relaxed"
            >
              {/* Not "never run". In this build nothing runs, and a bare "never
                  run" would read as a fault rather than as the platform's
                  state — which the preview above already explains. */}
              Nothing yet.
            </Text>
          ) : (
            runs
              .slice(0, 3)
              .map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  showAutomationName={false}
                  onPress={() =>
                    router.push(
                      `/automation/run/${run.id}?automationId=${automation.id}` as never
                    )
                  }
                />
              ))
          )}
        </View>

        {audit.length > 0 ? (
          <View className="mb-6">
            <SectionHeading title="History of changes" />
            {audit.map((entry, index) => (
              <View
                key={`${entry.action}-${entry.at}-${index}`}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${entry.action} by ${entry.actorLabel}${entry.provenance === 'local' ? ', on this device, not yet confirmed' : ''}`}
                className="flex-row items-center py-2"
              >
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={
                    // §51: a locally-known change is visually distinct until
                    // the server confirms it. Mixing the two would make the
                    // trail worse than useless.
                    entry.provenance === 'local'
                      ? tokens.color.text.placeholder
                      : tokens.color.primary[500]
                  }
                />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[11px] font-bold ml-2.5 capitalize"
                >
                  {entry.action}
                </Text>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-[11px] font-medium ml-1.5"
                >
                  by {entry.actorLabel}
                </Text>
                {entry.provenance === 'local' ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold ml-1.5"
                  >
                    · on this device
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View className="mt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this automation"
            onPress={handleDelete}
            className="py-3"
          >
            <Text
              style={{ color: tokens.color.error.default }}
              className="text-xs font-black text-center"
            >
              Delete this automation
            </Text>
          </Pressable>
        </View>
      </ScrollEndScrollView>

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderTopColor: tokens.color.surface.border,
        }}
        className="border-t px-4 pt-3 pb-6 flex-row"
      >
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={automation.status === 'ACTIVE' ? 'Pause this automation' : 'Turn this automation on'}
          accessibilityState={{ disabled: mutations.setStatus.isPending }}
          disabled={mutations.setStatus.isPending}
          onPress={automation.status === 'ACTIVE' ? handlePause : handleResume}
          style={{
            backgroundColor:
              automation.status === 'ACTIVE'
                ? tokens.color.surface.background
                : tokens.color.primary[500],
            borderColor: tokens.color.surface.border,
          }}
          className="flex-1 rounded-2xl border py-3.5 items-center justify-center"
        >
          {mutations.setStatus.isPending ? (
            <ActivityIndicator
              size="small"
              color={
                automation.status === 'ACTIVE'
                  ? tokens.color.text.primary
                  : tokens.color.text.inverse
              }
            />
          ) : (
            <Text
              style={{
                color:
                  automation.status === 'ACTIVE'
                    ? tokens.color.text.primary
                    : tokens.color.text.inverse,
              }}
              className="text-sm font-black"
            >
              {automation.status === 'ACTIVE' ? 'Pause' : 'Turn on'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * The preview, for a saved automation.
 *
 * Split into its own component so the hook that builds it — which fetches an
 * audience — is not called until there is a draft. Calling it above the
 * loading guard would fire an audience request for an automation that has not
 * loaded.
 */
function PreviewSection({ draft, scope }: { draft: AutomationDraft; scope: AutomationScope }) {
  const preview = useAutomationPreview(draft, scope);
  const reachesOthers = anyReachesOtherPeople(draft.actions.map((action) => action.key));

  return (
    <View className="mb-6">
      <AutomationPreviewCard
        preview={preview}
        onNavigate={(route) => router.push(route as never)}
        showAudience={reachesOthers}
      />
    </View>
  );
}

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center justify-between mb-2">
      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {title}
      </Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-black">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A saved automation, as the shape the builder and the preview take. */
function toDraft(automation: AutomationDefinition): AutomationDraft {
  return {
    id: automation.id,
    name: automation.name,
    description: automation.description,
    scope: automation.scope,
    source: automation.source,
    templateId: automation.templateId,
    trigger: automation.trigger,
    conditions: automation.conditions,
    actions: automation.actions,
    schedule: automation.schedule,
  };
}
