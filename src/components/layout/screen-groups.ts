import type { FinancialError } from '@/lib/transport/financial-errors';

/**
 * What a screen's data is doing (FSOLID-005).
 *
 * The three screen shells, `CommunityScreen`, `CreatorScreen` and
 * `AnalyticsScreen`, took these as five flat props apiece, beside a dozen others
 * about the header, the chrome and whether the feature is available at all. A
 * route fills all five from one query, so they travel as one object, and a
 * reader of a shell's props sees one name for one concern.
 */
export interface ScreenLoad {
  /** The first fetch is in flight. */
  isLoading?: boolean;
  /** The fetch failed. The shell shows the error, with `onRetry` to try again. */
  error?: FinancialError | null;
  onRetry?: () => void;
  /** Pull to refresh. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

/**
 * Whether a screen's feature is here at all (FSOLID-005): the backend gap it
 * waits on, and whether this build can reach its data. Each shell adds the
 * access decision in its own terms.
 */
export interface ScreenAvailability {
  /** Names the gap register entry. Renders the notice and the release refusal. */
  gapKey?: string;
  /** Overrides the notice's default sentence. */
  gapDetail?: string;
  /** Whether this build can reach the data at all. */
  isEnabled?: boolean;
}
