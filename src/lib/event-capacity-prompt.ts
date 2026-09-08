import { Alert, Platform } from 'react-native';

/**
 * Asks an organiser how many places an event has.
 *
 * **Its own module because the parsing is the interesting part, not the
 * prompt.** `parseInt('twelve')` is `NaN` and `parseInt('12.9')` is `12`; both
 * would set a limit nobody typed, and the second silently. A capacity is a
 * count of seats, so anything that is not a positive whole number is refused
 * rather than coerced into one.
 *
 * **Uncapped is offered as a choice, not as a blank.** Null and zero are
 * different answers — no limit, versus an event nobody may join — and an empty
 * box would have to guess which one somebody meant.
 */
export function parseCapacity(input: string): number | null | 'invalid' {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return 'invalid';
  }

  // Whole digits only. Not a regex on the parsed value: `Number('12abc')` is
  // NaN but `parseInt` would take the 12, and " 12 " should still be twelve.
  if (!/^\d+$/.test(trimmed)) {
    return 'invalid';
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value) || value <= 0) {
    // Zero is refused here rather than treated as uncapped. An organiser who
    // wants nobody to come cancels the event; one who types 0 has made a
    // mistake, and reading it as "unlimited" is the worst possible guess.
    return 'invalid';
  }

  return value;
}

/**
 * Prompts, and calls back with the chosen capacity. Never calls back on cancel.
 *
 * `Alert.prompt` is iOS-only, so Android and web get the two answers that do
 * not need typing — keep the current limit, or remove it — rather than a dialog
 * that silently does nothing. A number input for those platforms belongs on a
 * screen, and this stays honest about what it can ask for until there is one.
 */
export function promptForCapacity(
  current: number | null,
  onChosen: (capacity: number | null) => void
): void {
  if (Platform.OS === 'ios') {
    Alert.prompt(
      'How many places?',
      'Leave it uncapped, or set a limit. People who arrive after it is full join the waitlist.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'No limit', onPress: () => onChosen(null) },
        {
          text: 'Set',
          onPress: (value?: string) => {
            const parsed = parseCapacity(value ?? '');

            if (parsed === 'invalid') {
              Alert.alert(
                'That is not a number of places',
                'Enter a whole number greater than zero, or choose No limit.'
              );

              return;
            }

            onChosen(parsed);
          },
        },
      ],
      'plain-text',
      current == null ? '' : String(current),
      'number-pad'
    );

    return;
  }

  Alert.alert(
    'How many places?',
    current == null
      ? 'This event has no limit. Removing a limit is the only change available here on this device.'
      : `This event is limited to ${current} places.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'No limit', onPress: () => onChosen(null) },
    ]
  );
}
