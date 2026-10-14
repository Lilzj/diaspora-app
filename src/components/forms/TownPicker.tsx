// ─────────────────────────────────────────────────────────────────────────────
// TownPicker — choose a town in the member's country (14 Oct 2026)
//
// The one control every form uses to ask "which town?". Searches the platform's
// place catalogue in the member's country of residence as they type; a town the
// catalogue does not hold yet can still be used as typed, said plainly, so the
// form never blocks on our data.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuthStore } from '@/store/auth';
import { searchTowns, type TownChoice } from '@/lib/town-search';

interface TownPickerProps {
  label?: string;
  /** The town currently chosen, by name. */
  value: string;
  onChange: (town: TownChoice) => void;
  placeholder?: string;
  /** Defaults to the member's country of residence. */
  countryCode?: string | null;
  testID?: string;
}

export function TownPicker({
  label = 'Town or city',
  value,
  onChange,
  placeholder = 'Search for your town',
  countryCode,
  testID,
}: TownPickerProps) {
  const residence = useAuthStore((state) => state.user?.residenceCountry ?? null);
  const country = countryCode ?? residence;

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<TownChoice[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || term.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchTowns(term, country)
        .then((towns) => {
          if (!cancelled) {
            setResults(towns);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open, country]);

  const choose = (town: TownChoice) => {
    onChange(town);
    setOpen(false);
    setTerm('');
  };

  const typed = term.trim();
  const exact = results.some((town) => town.cityName.toLowerCase() === typed.toLowerCase());

  return (
    <View className="mb-4" testID={testID}>
      {label ? <Text className="text-xs font-bold text-content-secondary mb-2">{label}</Text> : null}
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}. Change` : `${label}: choose`}
        className="flex-row items-center justify-between bg-surface-card border border-subtle rounded-2xl px-4 py-3.5"
      >
        <Text className={`text-sm font-bold ${value ? 'text-content-primary' : 'text-content-muted'}`}>
          {value ? `📍 ${value}` : 'Choose a town'}
        </Text>
        <Text className="text-content-faint">{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open ? (
        <View className="bg-surface-card border border-subtle rounded-2xl mt-2 p-2">
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            autoFocus
            autoCapitalize="words"
            className="bg-surface-background rounded-xl px-3 py-2.5 text-sm text-content-primary mb-1"
          />
          {isSearching ? <ActivityIndicator color="#F59300" style={{ marginVertical: 8 }} /> : null}
          {results.map((town) => (
            <TouchableOpacity
              key={`${town.cityName}-${town.areaId ?? ''}`}
              onPress={() => choose(town)}
              accessibilityRole="button"
              className="px-3 py-3 rounded-xl"
            >
              <Text className="text-sm font-semibold text-content-primary">{town.cityName}</Text>
              {town.context ? <Text className="text-[11px] text-content-muted">{town.context}</Text> : null}
            </TouchableOpacity>
          ))}
          {typed.length >= 2 && !isSearching && !exact ? (
            <TouchableOpacity
              onPress={() => choose({ cityName: typed })}
              accessibilityRole="button"
              className="px-3 py-3 rounded-xl"
            >
              <Text className="text-sm font-semibold text-primary-600">Use “{typed}”</Text>
              <Text className="text-[11px] text-content-muted">
                {results.length === 0 ? 'Not in our list of towns yet. ' : ''}It will be saved as you typed it.
              </Text>
            </TouchableOpacity>
          ) : null}
          {failed ? (
            <Text className="text-xs text-error-default px-3 py-2">
              Diaspora could not search towns just now. You can still type the town and use it as typed.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
