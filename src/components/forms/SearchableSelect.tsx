// ─────────────────────────────────────────────────────────────────────────────
// SearchableSelect — a dropdown with search, for every category in the app
//
// Added 14 Oct 2026 so that choosing a category looks and works the same in
// every form: one field showing the choice, which opens a list the member can
// filter by typing. Category chips scattered across the screen were the norm,
// and each form drew them differently.
//
// Single choice by default; `multiple` keeps a list (the business wizard files
// under its first choice and tags the rest). Options come from the caller,
// which gets them from the server.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

export interface SelectOption {
  key: string;
  label: string;
  /** An emoji shown before the label, if the caller has one. */
  icon?: string | null;
  /** A second line, e.g. the parent category. */
  hint?: string | null;
}

interface BaseProps {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  /** Shown instead of the list when the options could not be loaded. */
  unavailableMessage?: string | null;
  testID?: string;
  /**
   * Opens the list each time it changes to a new non-zero number. A screen that
   * sends the member to this field ("Edit profile" on a requirement) opens it
   * rather than leaving them to find the toggle.
   */
  openRequest?: number;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string | null | undefined;
  onChange: (key: string) => void;
}

interface MultipleProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (keys: string[]) => void;
}

export function SearchableSelect(props: SingleProps | MultipleProps) {
  const {
    label,
    options,
    placeholder = 'Choose a category',
    searchPlaceholder = 'Search',
    isLoading,
    unavailableMessage,
    testID,
    openRequest,
  } = props;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  const [term, setTerm] = useState('');

  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, term]);

  const summary = selected
    .map((key) => options.find((option) => option.key === key))
    .filter((option): option is SelectOption => !!option)
    .map((option) => `${option.icon ? `${option.icon} ` : ''}${option.label}`)
    .join(', ');

  const pick = (key: string) => {
    if (props.multiple) {
      props.onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
      return;
    }
    props.onChange(key);
    setOpen(false);
    setTerm('');
  };

  return (
    <View className="mb-4" testID={testID}>
      {label ? <Text className="text-xs font-bold text-content-secondary mb-2">{label}</Text> : null}
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={summary ? `${label ?? 'Category'}: ${summary}. Change` : `${label ?? 'Category'}: ${placeholder}`}
        className="flex-row items-center justify-between bg-surface-card border border-subtle rounded-2xl px-4 py-3.5"
      >
        <Text className={`flex-1 text-sm font-bold ${summary ? 'text-content-primary' : 'text-content-muted'}`} numberOfLines={2}>
          {summary || placeholder}
        </Text>
        <Text className="text-content-faint ml-2">{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open ? (
        <View className="bg-surface-card border border-subtle rounded-2xl mt-2 p-2">
          {isLoading ? (
            <ActivityIndicator color="#F59300" style={{ marginVertical: 12 }} />
          ) : unavailableMessage && options.length === 0 ? (
            <Text className="text-xs text-content-muted px-3 py-3">{unavailableMessage}</Text>
          ) : (
            <>
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder={searchPlaceholder}
                placeholderTextColor="#9CA3AF"
                className="bg-surface-background rounded-xl px-3 py-2.5 text-sm text-content-primary mb-1"
              />
              {visible.map((option) => {
                const isOn = selected.includes(option.key);
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => pick(option.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOn }}
                    // Marked by its border as well as its text: in dark mode the
                    // muted and card surfaces are the same colour.
                    className={`flex-row items-center px-3 py-3 rounded-xl border ${isOn ? 'bg-surface-muted border-primary-500' : 'border-transparent'}`}
                  >
                    <View className="flex-1">
                      <Text className={`text-sm ${isOn ? 'font-black text-primary-600' : 'font-semibold text-content-secondary'}`}>
                        {option.icon ? `${option.icon} ` : ''}
                        {option.label}
                      </Text>
                      {option.hint ? <Text className="text-[11px] text-content-muted">{option.hint}</Text> : null}
                    </View>
                    {isOn ? <Text className="text-primary-600 font-black">✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
              {visible.length === 0 ? (
                <Text className="text-xs text-content-muted px-3 py-3">Nothing matches “{term.trim()}”.</Text>
              ) : null}
              {props.multiple ? (
                <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" className="items-center py-2">
                  <Text className="text-xs font-black text-primary-600">Done</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
