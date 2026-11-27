import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/design-system';

/**
 * Title and sentence read out as one. A title that already ends a sentence is not
 * given a second full stop: "Your invoices could not be loaded.. Check your
 * connection" is what a screen reader said until it was.
 */
function spoken(title: string, message?: string | null): string {
  if (!message) return title;
  return /[.!?…]$/.test(title) ? `${title} ${message}` : `${title}. ${message}`;
}

/** Something a list says in place of its rows, in the screen's own words. */
export interface ListMessage {
  /** An Ionicons glyph: "calendar-outline". */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  /** The sentence under the title. For an error, the server's own where it gave one. */
  message?: string | null;
  /** A next step: "Post a job", "Clear filters". */
  action?: { label: string; onPress: () => void };
  /** For a test that finds this message by id, as the area components it replaces were found. */
  testID?: string;
}

/**
 * An empty list, said in the screen's words.
 *
 * The look the community, creator and analytics areas had each arrived at on
 * their own: a glyph in a soft circle, a short heavy title, one sentence, and
 * a next step where there is one. Read out as one sentence, title and body.
 */
export function ListEmpty({ icon = 'albums-outline', title, message, action, testID }: ListMessage) {
  const { tokens } = useTheme();

  return (
    <View className="items-center px-8 py-12">
      {/* One sentence to a screen reader; the action below stays reachable on its own. */}
      <View
        accessible
        accessibilityLabel={spoken(title, message)}
        className="items-center"
        testID={testID}
      >
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-14 h-14 rounded-full items-center justify-center mb-3"
        >
          <Ionicons name={icon} size={24} color={tokens.color.text.placeholder} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black tracking-tight text-center"
        >
          {title}
        </Text>
        {message ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-xs font-semibold text-center mt-1.5 leading-relaxed"
          >
            {message}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-5 py-3 mt-5"
        >
          <Text className="text-white text-xs font-black">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A list that could not be read. Never drawn as empty: "nothing here" after a
 * failed read is a claim about the list that nobody checked.
 */
export function ListError({
  icon = 'cloud-offline-outline',
  title,
  message,
  action,
  testID,
  onRetry,
}: ListMessage & { onRetry?: () => void }) {
  const { tokens } = useTheme();

  return (
    <View className="items-center px-8 py-12">
      {/* Announced as one alert; the buttons below stay reachable on their own. */}
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={spoken(title, message)}
        className="items-center"
        testID={testID}
      >
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-14 h-14 rounded-full items-center justify-center mb-3"
        >
          <Ionicons name={icon} size={24} color={tokens.color.text.placeholder} />
        </View>
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black tracking-tight text-center"
        >
          {title}
        </Text>
        {message ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-xs font-semibold text-center mt-1.5 leading-relaxed"
          >
            {message}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={{ borderColor: tokens.color.border.default }}
          className="rounded-full border px-5 py-3 mt-5"
        >
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-black">
            Try again
          </Text>
        </Pressable>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="rounded-full px-5 py-3 mt-3"
        >
          <Text className="text-white text-xs font-black">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A list still being read, with nothing to show yet. Says so to a screen reader. */
export function ListLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} className="items-center py-12">
      <ActivityIndicator color="#F59300" />
    </View>
  );
}

interface ListStateProps {
  /** The first read, with nothing yet to show. Nothing else is drawn while it lasts. */
  loading?: boolean;
  /** What a screen reader says while loading: "Loading guides". */
  loadingLabel?: string;
  /** Stands in for the spinner: the rows' skeleton, where a screen has one. */
  skeleton?: React.ReactNode;
  /**
   * The list could not be read. A message is drawn in the shared look; an
   * element is drawn as given, for an area's error that does more than say so
   * (FinancialErrorView offers Sign in, or Start verification). Pass it only
   * when there is nothing to show instead: rows already on screen stay there
   * when a refresh fails.
   */
  error?: ListMessage | React.ReactElement | null | false;
  /** Offered with a message error. A failed read with no way to try again is a dead end. */
  onRetry?: () => void;
  /** The list was read, and is empty. */
  isEmpty?: boolean;
  /** What an empty list says. A list empty for a reason (a filter) says the reason. */
  empty?: ListMessage;
  /** The rows. */
  children?: React.ReactNode;
}

/**
 * The three things a list says before it has rows: that it is loading, that it
 * could not load, and that there is nothing there. In that order, and only one.
 *
 * One component since 27 Nov 2026 (FARCH-007). List screens drew these
 * themselves, and the order drifted with the drawing: about forty lists said
 * "nothing here" when the read had failed, because the empty branch was the
 * only one there was, and others said it while the read was still in flight.
 * What differs on purpose between screens is the words; they come from each.
 */
export function ListState({
  loading,
  loadingLabel,
  skeleton,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
}: ListStateProps) {
  if (loading) return skeleton ? <>{skeleton}</> : <ListLoading label={loadingLabel} />;

  if (error) {
    return React.isValidElement(error) ? error : <ListError {...error} onRetry={onRetry} />;
  }

  if (isEmpty && empty) return <ListEmpty {...empty} />;

  return <>{children}</>;
}
