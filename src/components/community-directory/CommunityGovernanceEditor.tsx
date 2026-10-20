// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Writing a community's rules and notices (20 Oct 2026)
//
// `POST/PUT/DELETE /communities/{idOrSlug}/rules` and `/notices` are served by
// CommunityProgramme since backend d07a707. The server decides who may write:
// `canManageRules` for rules, `canPublishNotice` for a new notice, and a notice's
// own `canEdit` for revising or removing it. This file only decides whether to
// draw a control, from those same answers — and draws none for anybody else.
//
// Two rules from the rest of the app, kept here although this is a component
// rather than a screen under `src/app`:
//
//   * The form refuses while a required field is empty, and says which one,
//     before anybody presses anything (title and text, both required server-side).
//   * Unanswered is not no. A write whose answer never arrived may have been
//     applied, so it says that, and the list is refetched either way.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/design-system';
import type { CommunityId, CommunityNotice, CommunityRule } from '@/types/community-directory';
import { useCommunityGovernanceMutations } from '@/hooks/communities';
import type { FinancialError } from '@/lib/financial-errors';

/** What a failed write says. The server's own sentence where it sent one. */
export function governanceWriteError(error: unknown): string | null {
  if (!error) return null;
  const failure = error as Partial<FinancialError>;

  if (failure.isIndeterminate) {
    return 'We could not confirm that change. It may have been saved — the list has been refreshed to show what is there now.';
  }

  return typeof failure.message === 'string' && failure.message.length > 0
    ? failure.message
    : 'That change was not saved.';
}

/** The required fields still empty, named for the member. */
export function missingGovernanceFields(title: string, body: string, bodyName: string): string[] {
  const missing: string[] = [];
  if (!title.trim()) missing.push('a title');
  if (!body.trim()) missing.push(bodyName);
  return missing;
}

interface DraftFormProps {
  heading: string;
  bodyName: string;
  bodyPlaceholder: string;
  submitLabel: string;
  initial?: { title: string; body: string; consequence?: string | null; isPinned?: boolean };
  withConsequence?: boolean;
  withPin?: boolean;
  isPending: boolean;
  error: string | null;
  onSubmit: (draft: { title: string; body: string; consequence: string; isPinned: boolean }) => void;
  onCancel: () => void;
}

function DraftForm({
  heading,
  bodyName,
  bodyPlaceholder,
  submitLabel,
  initial,
  withConsequence,
  withPin,
  isPending,
  error,
  onSubmit,
  onCancel,
}: DraftFormProps) {
  const { tokens } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [consequence, setConsequence] = useState(initial?.consequence ?? '');
  const [isPinned, setIsPinned] = useState(initial?.isPinned ?? false);

  const missing = missingGovernanceFields(title, body, bodyName);
  const inputStyle = {
    color: tokens.color.text.primary,
    borderColor: tokens.color.border.default,
    backgroundColor: tokens.color.surface.background,
  };

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-3 mb-3"
    >
      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black mb-2">
        {heading}
      </Text>

      <TextInput
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder="Title"
        placeholderTextColor={tokens.color.text.placeholder}
        style={inputStyle}
        className="rounded-xl border px-3 py-2.5 text-xs font-bold mb-2"
      />
      <TextInput
        accessibilityLabel={bodyName}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        placeholder={bodyPlaceholder}
        placeholderTextColor={tokens.color.text.placeholder}
        style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
        className="rounded-xl border px-3 py-2.5 text-xs font-semibold mb-2"
      />
      {withConsequence ? (
        <TextInput
          accessibilityLabel="What happens if it is broken (optional)"
          value={consequence ?? ''}
          onChangeText={setConsequence}
          maxLength={500}
          placeholder="What happens if it is broken (optional)"
          placeholderTextColor={tokens.color.text.placeholder}
          style={inputStyle}
          className="rounded-xl border px-3 py-2.5 text-xs font-semibold mb-2"
        />
      ) : null}
      {withPin ? (
        <View className="flex-row items-center justify-between mb-2">
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
            Pin to the top of the community
          </Text>
          <Switch
            accessibilityLabel="Pin this notice"
            value={isPinned}
            onValueChange={setIsPinned}
          />
        </View>
      ) : null}

      {missing.length > 0 ? (
        <Text
          testID="governance-form-missing"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mb-2"
        >
          Still needed: {missing.join(' and ')}.
        </Text>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tokens.color.error.default }}
          className="text-[10px] font-bold mb-2"
        >
          {error}
        </Text>
      ) : null}

      <View className="flex-row">
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: missing.length > 0 || isPending, busy: isPending }}
          disabled={missing.length > 0 || isPending}
          onPress={() => onSubmit({ title: title.trim(), body: body.trim(), consequence: (consequence ?? '').trim(), isPinned })}
          activeOpacity={0.85}
          style={{
            backgroundColor: tokens.color.primary[500],
            opacity: missing.length > 0 || isPending ? 0.5 : 1,
          }}
          className="flex-1 rounded-xl py-2.5 items-center mr-2"
        >
          {isPending ? (
            <ActivityIndicator size="small" color={tokens.color.text.inverse} />
          ) : (
            <Text style={{ color: tokens.color.text.inverse }} className="text-[11px] font-black">
              {submitLabel}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
          activeOpacity={0.8}
          style={{ borderColor: tokens.color.border.default }}
          className="rounded-xl border px-4 py-2.5 items-center"
        >
          <Text style={{ color: tokens.color.text.secondary }} className="text-[11px] font-bold">
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SmallAction({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone = 'default',
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const { tokens } = useTheme();
  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={{ borderColor: tokens.color.border.default, opacity: disabled ? 0.5 : 1 }}
      className="rounded-full border px-2.5 py-1 mr-1.5"
    >
      <Text
        style={{ color: tone === 'danger' ? tokens.color.error.default : tokens.color.text.secondary }}
        className="text-[10px] font-bold"
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Edit and remove controls for one rule. Drawn only for `canManageRules`. */
export function CommunityRuleControls({
  communityId,
  rule,
}: {
  communityId: CommunityId;
  rule: CommunityRule;
}) {
  const { updateRule, removeRule } = useCommunityGovernanceMutations(communityId);
  const [editing, setEditing] = useState(false);
  const { tokens } = useTheme();

  if (editing) {
    return (
      <DraftForm
        heading={`Edit rule ${rule.position}`}
        bodyName="the rule itself"
        bodyPlaceholder="What the rule asks of members"
        submitLabel="Save rule"
        initial={rule}
        withConsequence
        isPending={updateRule.isPending}
        error={governanceWriteError(updateRule.error)}
        onSubmit={(draft) =>
          updateRule.mutate(
            {
              ruleId: rule.id,
              input: {
                title: draft.title,
                body: draft.body,
                consequence: draft.consequence || null,
                position: rule.position,
              },
            },
            { onSuccess: () => setEditing(false) }
          )
        }
        onCancel={() => {
          updateRule.reset();
          setEditing(false);
        }}
      />
    );
  }

  const removeError = governanceWriteError(removeRule.error);

  return (
    <View className="mb-3 -mt-1">
      <View className="flex-row">
        <SmallAction
          label="Edit"
          accessibilityLabel={`Edit rule ${rule.position}`}
          onPress={() => setEditing(true)}
        />
        <SmallAction
          label={removeRule.isPending ? 'Removing…' : 'Remove'}
          accessibilityLabel={`Remove rule ${rule.position}`}
          tone="danger"
          disabled={removeRule.isPending}
          onPress={() => removeRule.mutate(rule.id)}
        />
      </View>
      {removeError ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tokens.color.error.default }}
          className="text-[10px] font-bold mt-1"
        >
          {removeError}
        </Text>
      ) : null}
    </View>
  );
}

/** Edit and remove controls for one notice. Drawn only where the server said `canEdit`. */
export function CommunityNoticeControls({
  communityId,
  notice,
}: {
  communityId: CommunityId;
  notice: CommunityNotice;
}) {
  const { updateNotice, removeNotice } = useCommunityGovernanceMutations(communityId);
  const [editing, setEditing] = useState(false);
  const { tokens } = useTheme();

  if (!notice.canEdit) return null;

  if (editing) {
    return (
      <DraftForm
        heading="Edit notice"
        bodyName="the notice itself"
        bodyPlaceholder="What members need to know"
        submitLabel="Save notice"
        initial={notice}
        withPin
        isPending={updateNotice.isPending}
        error={governanceWriteError(updateNotice.error)}
        onSubmit={(draft) =>
          updateNotice.mutate(
            {
              noticeId: notice.id,
              input: {
                title: draft.title,
                body: draft.body,
                isPinned: draft.isPinned,
                expiresAt: notice.expiresAt ?? null,
              },
            },
            { onSuccess: () => setEditing(false) }
          )
        }
        onCancel={() => {
          updateNotice.reset();
          setEditing(false);
        }}
      />
    );
  }

  const removeError = governanceWriteError(removeNotice.error);

  return (
    <View className="mb-3 -mt-1">
      <View className="flex-row">
        <SmallAction
          label="Edit"
          accessibilityLabel={`Edit the notice ${notice.title}`}
          onPress={() => setEditing(true)}
        />
        <SmallAction
          label={removeNotice.isPending ? 'Removing…' : 'Remove'}
          accessibilityLabel={`Remove the notice ${notice.title}`}
          tone="danger"
          disabled={removeNotice.isPending}
          onPress={() => removeNotice.mutate(notice.id)}
        />
      </View>
      {removeError ? (
        <Text
          accessibilityRole="alert"
          style={{ color: tokens.color.error.default }}
          className="text-[10px] font-bold mt-1"
        >
          {removeError}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * "Add a rule" and "Post a notice", each behind the capability the server
 * reported. Nothing at all for a member holding neither.
 */
export function CommunityGovernanceComposer({
  communityId,
  canManageRules,
  canPublishNotice,
}: {
  communityId: CommunityId;
  canManageRules: boolean;
  canPublishNotice: boolean;
}) {
  const { tokens } = useTheme();
  const { createRule, publishNotice } = useCommunityGovernanceMutations(communityId);
  const [open, setOpen] = useState<'rule' | 'notice' | null>(null);

  if (!canManageRules && !canPublishNotice) return null;

  if (open === 'rule') {
    return (
      <DraftForm
        heading="Add a rule"
        bodyName="the rule itself"
        bodyPlaceholder="What the rule asks of members"
        submitLabel="Add rule"
        withConsequence
        isPending={createRule.isPending}
        error={governanceWriteError(createRule.error)}
        onSubmit={(draft) =>
          createRule.mutate(
            { title: draft.title, body: draft.body, consequence: draft.consequence || null },
            { onSuccess: () => setOpen(null) }
          )
        }
        onCancel={() => {
          createRule.reset();
          setOpen(null);
        }}
      />
    );
  }

  if (open === 'notice') {
    return (
      <DraftForm
        heading="Post a notice"
        bodyName="the notice itself"
        bodyPlaceholder="What members need to know"
        submitLabel="Post notice"
        withPin
        isPending={publishNotice.isPending}
        error={governanceWriteError(publishNotice.error)}
        onSubmit={(draft) =>
          publishNotice.mutate(
            { title: draft.title, body: draft.body, isPinned: draft.isPinned },
            { onSuccess: () => setOpen(null) }
          )
        }
        onCancel={() => {
          publishNotice.reset();
          setOpen(null);
        }}
      />
    );
  }

  return (
    <View className="flex-row mb-4" testID="community-governance-composer">
      {canManageRules ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Add a rule"
          onPress={() => setOpen('rule')}
          activeOpacity={0.8}
          style={{ borderColor: tokens.color.border.default }}
          className="flex-1 rounded-xl border border-dashed py-2.5 items-center mr-2"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
            Add a rule
          </Text>
        </TouchableOpacity>
      ) : null}
      {canPublishNotice ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Post a notice"
          onPress={() => setOpen('notice')}
          activeOpacity={0.8}
          style={{ borderColor: tokens.color.border.default }}
          className="flex-1 rounded-xl border border-dashed py-2.5 items-center"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-[11px] font-bold">
            Post a notice
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
