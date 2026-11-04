// ─────────────────────────────────────────────────────────────────────────────
// Post or edit a grant — administrators only (since 4 Nov 2026)
//
// `?id=` edits that grant; without it the form posts a new one. What a grant
// offers, in which currency, where, when and to whom. The application form is
// the server's standard one and an edit leaves it alone, so an application in
// progress keeps the questions it started with. See `grants/index.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useTheme } from '@/design-system';
import { useNotification } from '@/providers/notification-provider';
import { useAdminGrants, useGrantAdminActions } from '@/hooks/grant-admin';
import { isGrantAdminRefusal } from '@/lib/creator/grant-admin-api';
import {
  emptyGrantForm,
  GRANT_STATUS_THRESHOLDS,
  grantFormFrom,
  grantFormProblems,
  toSaveGrantRequest,
  type GrantForm,
} from '@/lib/creator/grant-admin-form';
import { backOr } from '@/lib/navigation';

function Field({
  label,
  hint,
  value,
  onChangeText,
  multiline = false,
  keyboardType,
  autoCapitalize,
  placeholder,
  testID,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'characters' | 'sentences';
  placeholder?: string;
  testID?: string;
}) {
  const { tokens } = useTheme();
  return (
    <View className="mb-4">
      <Text className="text-xs font-bold text-content-primary mb-1.5">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.text.placeholder}
        style={{ color: tokens.color.text.primary, minHeight: multiline ? 88 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
        className="bg-surface-card border border-subtle rounded-xl px-3.5 py-3 text-sm"
      />
      {hint ? <Text className="text-[11px] text-content-muted mt-1">{hint}</Text> : null}
    </View>
  );
}

export default function GrantEditScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { grants, isLoading } = useAdminGrants();
  const { save } = useGrantAdminActions();

  const existing = useMemo(() => (id ? grants.find((grant) => grant.grantId === id) : undefined), [grants, id]);
  const [form, setForm] = useState<GrantForm>(emptyGrantForm);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  // Opened once from the grant, so a refetch does not overwrite what is being typed.
  useEffect(() => {
    if (existing && loadedFor !== existing.grantId) {
      setForm(grantFormFrom(existing));
      setLoadedFor(existing.grantId);
    }
  }, [existing, loadedFor]);

  const set = <K extends keyof GrantForm>(key: K, value: GrantForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (publish: boolean) => {
    const found = grantFormProblems(form);
    setProblems(found);
    if (found.length > 0) return;

    save.mutate(
      { grantId: existing?.grantId, request: toSaveGrantRequest(form, { publish }) },
      {
        onSuccess: () => router.replace('/moderation/grants' as never),
        onError: (cause) =>
          showAlert({
            type: 'error',
            title: 'Not saved',
            message: isGrantAdminRefusal(cause)
              ? 'Posting grants is for the platform’s administrators.'
              : 'The grant could not be saved. Check the details and try again.',
          }),
      },
    );
  };

  if (id && isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="Edit grant" />
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={existing ? 'Edit grant' : 'New grant'} />
      <ScrollEndScrollView
        className="flex-1 px-5 pt-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      >
        <Field label="Title" value={form.title} onChangeText={(text) => set('title', text)} testID="grant-title" />
        <Field
          label="In a line"
          hint="Shown on the grant's card."
          value={form.summary}
          onChangeText={(text) => set('summary', text)}
        />
        <Field
          label="Who it is for and what it funds"
          value={form.description}
          onChangeText={(text) => set('description', text)}
          multiline
        />
        <Field
          label="Category"
          hint="One word or two, such as community or creators."
          value={form.category}
          onChangeText={(text) => set('category', text)}
          autoCapitalize="none"
        />
        <Field
          label="Currency"
          hint="The three-letter code: NGN, GHS, KES, GBP, USD…"
          value={form.currency}
          onChangeText={(text) => set('currency', text.toUpperCase())}
          autoCapitalize="characters"
          testID="grant-currency"
        />
        <Field
          label="Most it awards"
          value={form.amount}
          onChangeText={(text) => set('amount', text)}
          keyboardType="numeric"
          testID="grant-amount"
        />
        <Field
          label="Least an applicant may ask for"
          hint="Leave empty for one fixed amount."
          value={form.minimumAmount}
          onChangeText={(text) => set('minimumAmount', text)}
          keyboardType="numeric"
        />
        <Field
          label="Countries"
          hint="Two-letter codes, such as NG, GH. Leave empty for everywhere."
          value={form.countries}
          onChangeText={(text) => set('countries', text.toUpperCase())}
          autoCapitalize="characters"
        />
        <Field
          label="Opens"
          hint="A date such as 2026-11-30. Leave empty to open when it is published."
          value={form.opens}
          onChangeText={(text) => set('opens', text)}
          autoCapitalize="none"
        />
        <Field
          label="Deadline"
          hint="A date such as 2026-12-31: it closes at the end of that day."
          value={form.deadline}
          onChangeText={(text) => set('deadline', text)}
          autoCapitalize="none"
        />

        <Text className="text-xs font-bold text-content-primary mb-2">Who may apply</Text>
        <View className="flex-row flex-wrap mb-3">
          {GRANT_STATUS_THRESHOLDS.map((option) => {
            const isOn = form.minimumStatus === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => set('minimumStatus', option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                className={`border rounded-full px-3 py-1.5 mr-2 mb-2 ${
                  isOn ? 'bg-surface-muted border-primary-500' : 'border-subtle'
                }`}
              >
                <Text className={`text-[11px] font-bold ${isOn ? 'text-primary-600' : 'text-content-secondary'}`}>
                  {option.value === 'NotACreator' ? option.label : `${option.label} or above`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row items-center justify-between bg-surface-card border border-subtle rounded-xl px-3.5 py-3 mb-5">
          <Text className="text-xs font-bold text-content-primary flex-1 mr-3">
            Only creators who passed creator verification
          </Text>
          <Switch
            value={form.requiresVerifiedCreator}
            onValueChange={(value) => set('requiresVerifiedCreator', value)}
          />
        </View>

        {problems.length > 0 ? (
          <View className="bg-surface-card border border-subtle rounded-xl p-3.5 mb-4" accessibilityRole="alert">
            {problems.map((problem) => (
              <Text key={problem} className="text-xs text-error-default mb-0.5">
                {problem}
              </Text>
            ))}
          </View>
        ) : null}

        {existing ? (
          <TouchableOpacity
            onPress={() => submit(existing.isPublished)}
            disabled={save.isPending}
            accessibilityRole="button"
            className="bg-primary-600 rounded-2xl py-3.5 items-center mb-3"
          >
            <Text className="text-white text-sm font-black">{save.isPending ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => submit(true)}
              disabled={save.isPending}
              accessibilityRole="button"
              testID="grant-publish"
              className="bg-primary-600 rounded-2xl py-3.5 items-center mb-3"
            >
              <Text className="text-white text-sm font-black">{save.isPending ? 'Posting…' : 'Post grant'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => submit(false)}
              disabled={save.isPending}
              accessibilityRole="button"
              className="border border-subtle rounded-2xl py-3.5 items-center mb-3"
            >
              <Text className="text-sm font-bold text-content-secondary">Save without publishing</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => backOr('/moderation/grants' as never)} accessibilityRole="button" className="items-center py-2">
          <Text className="text-xs font-bold text-content-muted">Cancel</Text>
        </TouchableOpacity>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}
