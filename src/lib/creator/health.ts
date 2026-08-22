// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — content health, applied from the platform's own rubric
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `UnifiedContentItem` has carried `healthScore`, `healthStatus` and
// `healthRecommendations` since the type was written, and **every value that
// ever filled them came from `mocks/creator-data.ts`.** When the fixtures were
// removed the fields were left undefined and the cards rendered "Health not
// measured" — honest, and a holding position. `workspace.ts`'s own header said
// why nothing filled them:
//
//   > **No health score.** … They are left undefined here rather than derived
//   > from view counts, because a number invented in this file is the same
//   > fabrication that was removed from the store — moved one layer down.
//
// That warning is exactly right and this file does not violate it, because
// **the rule is not in this file.** `GET /creators/content-health/rubric`
// serves the criteria, their weights and the thresholds; this applies them.
//
// ── Why the server publishes a rubric rather than a score ────────────────────
//
// The obvious design is a server-side scorer. It cannot be built: the Creator
// module references Financial and Community and **not** Guides, Marketplace,
// Housing or CommunityLife, so a scorer that read the items would give Creator a
// dependency on four content modules — the same coupling that made BG-10 a
// defect, acquired to compute a percentage.
//
// So the rule ships from the server and the evaluation happens where the data
// already is. This client fans out over the `/mine` routes for the workspace
// anyway. It does not decide what health means; it cannot, because the meaning
// arrives over HTTP and a weight changed on the server changes every client
// without a release.
//
// ── What it measures, and what it deliberately does not ──────────────────────
//
// **Completeness only.** Not freshness — a finished listing would silently decay
// while its author did nothing wrong. Not engagement — views and saves measure
// market demand rather than authoring quality, so a good listing for an
// unpopular item would read as unhealthy and the member could not act on it.
//
// Every point lost names a field the member can go and fill in, which is the
// property that made completeness the choice.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import type {
  HealthRecommendation,
  HealthStatusLevel,
  UnifiedContentItem,
} from '@/types/creator';

/** One thing an item either has or has not. Mirrors the served contract. */
export interface HealthCriterion {
  key: string;
  /** The field on the item that satisfies it. */
  field: string;
  /** Relative weight. Scores are normalised over the criteria that apply. */
  weight: number;
  /** What the member should do about it. Rendered verbatim — the server's words. */
  hint: string;
  /** Content types it applies to. Empty means all of them. */
  appliesTo: string[];
}

export interface HealthRubric {
  version: number;
  healthyAtOrAbove: number;
  needsWorkBelow: number;
  criteria: HealthCriterion[];
}

/**
 * The rubric, or null when the platform did not serve one.
 *
 * **Null is a real answer and the caller must handle it.** A deployment that has
 * not shipped BG-08, or a request that failed, means health is *not measured* —
 * and the honest render for that is the same "Health not measured" the cards
 * showed before, not a score computed from a rubric this file made up as a
 * fallback. There is deliberately no default rubric in this module.
 */
export async function fetchHealthRubric(): Promise<HealthRubric | null> {
  try {
    const { data } = await apiClient.get('/creators/content-health/rubric');
    const rubric = data?.data ?? data;

    return Array.isArray(rubric?.criteria) && rubric.criteria.length > 0
      ? (rubric as HealthRubric)
      : null;
  } catch {
    return null;
  }
}

/** What one item scored, and why. */
export interface HealthAssessment {
  score: number;
  status: HealthStatusLevel;
  /** One per unmet criterion, in the rubric's own order. */
  recommendations: HealthRecommendation[];
}

/**
 * Whether an item satisfies one criterion.
 *
 * Keyed on the rubric's `field` rather than a per-type branch, so adding a
 * criterion server-side needs no change here — which is the point of publishing
 * the rule rather than the score.
 *
 * **A whitespace-only string is absent.** A description of `" "` satisfies a
 * truthiness check and satisfies nobody reading the listing.
 */
/**
 * The rubric's field names, in the client's own vocabulary.
 *
 * **This map is the fix for a defect a device found and nothing else could.** The rubric is written
 * in the platform's field names — `coverImage`, `categoryKey` — and `UnifiedContentItem` uses the
 * client's — `thumbnail`, `category`. Looked up raw, neither ever resolved, so **65 of the 100
 * available points were unsatisfiable on every item** and a complete marketplace listing rendered
 * `ACTION REQUIRED 18%` beside the member's own name.
 *
 * That is FD-02 exactly: a health score that reads as a failing grade for content that is fine. It
 * survived `tsc`, the unit suite and the runtime probe, because every one of those checks the rubric
 * and the item **separately** and the mismatch only exists between them.
 *
 * Mapping here rather than renaming the rubric: the rubric is the platform's contract and another
 * client may hold a different shape. Knowing its own field names is this client's job.
 */
const FIELD_ALIAS: Record<string, string> = {
  coverImage: 'thumbnail',
  categoryKey: 'category',
};

function satisfies(item: UnifiedContentItem, field: string): boolean {
  const value = (item as unknown as Record<string, unknown>)[FIELD_ALIAS[field] ?? field];

  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);

  return true;
}

/**
 * Whether a criterion applies to this item at all.
 *
 * An empty `appliesTo` means every type. This is what stops a guide being marked
 * down for having no price and an event for having no rent — an item is never
 * penalised for lacking a field its own vertical does not have.
 */
function applies(criterion: HealthCriterion, item: UnifiedContentItem): boolean {
  if (criterion.appliesTo.length === 0) return true;

  // Case-insensitively, because the two vocabularies genuinely differ: the
  // rubric is served in the platform's lower-case subject names (`marketplace`,
  // `housing`) and `ContentType` is the client's capitalised union (`Marketplace`,
  // `Housing`). Comparing them raw silently matched nothing, which would have
  // made every criterion apply to every type and marked a guide down for having
  // no rent.
  // Defensive, and not idly: a row arriving without a content type must not
  // throw inside a workspace render. An item whose type is unknown gets every
  // criterion, which marks it down rather than silently scoring it 100 — the
  // safe direction when the alternative is claiming an unknown thing is fine.
  const type = item.contentType?.toLowerCase();

  if (!type) return true;

  return criterion.appliesTo.some((candidate) => candidate.toLowerCase() === type);
}

/** The rubric's `field` mapped to the recommendation shape the cards already render. */
const ACTION_FOR_FIELD: Record<string, HealthRecommendation['type']> = {
  coverImage: 'photo',
  price: 'pricing',
  summary: 'content_refresh',
  categoryKey: 'general',
  location: 'general',
  startsAt: 'general',
  tags: 'general',
};

const ACTION_TYPE_FOR_FIELD: Record<string, HealthRecommendation['actionType']> = {
  coverImage: 'photos',
  price: 'edit',
  summary: 'edit',
  categoryKey: 'edit',
  location: 'edit',
  startsAt: 'edit',
  tags: 'edit',
};

/**
 * Scores one item against the rubric.
 *
 * **Normalised over the criteria that apply**, not over the whole rubric. An
 * event has no price criterion, so its denominator excludes that weight and a
 * complete event scores 100 rather than 90. Dividing by the full total would
 * mark every vertical down for the fields belonging to the others — which is the
 * same arithmetic error as FD-02, where an average over `items.length` rather
 * than `assessed` rendered every unmeasured item as a failing grade.
 */
export function assess(item: UnifiedContentItem, rubric: HealthRubric): HealthAssessment {
  const applicable = rubric.criteria.filter((criterion) => applies(criterion, item));
  const total = applicable.reduce((sum, criterion) => sum + criterion.weight, 0);

  // No criterion applies to this type. Not a zero — a zero would render in rose
  // beside the member's name for an item nothing was asked of.
  if (total === 0) {
    return { score: 100, status: 'healthy', recommendations: [] };
  }

  const unmet = applicable.filter((criterion) => !satisfies(item, criterion.field));
  const lost = unmet.reduce((sum, criterion) => sum + criterion.weight, 0);
  const score = Math.round(((total - lost) / total) * 100);

  return {
    score,
    status: statusFor(score, rubric),
    recommendations: unmet.map((criterion) => ({
      id: `${item.id}:${criterion.key}`,
      type: ACTION_FOR_FIELD[criterion.field] ?? 'general',
      title: criterion.hint,

      // The server's sentence is the whole message. Restating it here in other
      // words is how two descriptions of one rule start to disagree.
      description: criterion.hint,
      actionText: 'Edit',
      actionType: ACTION_TYPE_FOR_FIELD[criterion.field] ?? 'edit',
    })),
  };
}

function statusFor(score: number, rubric: HealthRubric): HealthStatusLevel {
  if (score >= rubric.healthyAtOrAbove) return 'healthy';
  if (score < rubric.needsWorkBelow) return 'action_required';
  return 'needs_attention';
}

/**
 * Applies the rubric to a whole workspace list.
 *
 * **A null rubric returns the items untouched**, with `healthScore` and the rest
 * still undefined, so the cards go on rendering "Health not measured". That is
 * the honest state when the platform did not serve a rule, and it is the reason
 * this function returns items rather than throwing.
 */
export function assessAll(
  items: UnifiedContentItem[],
  rubric: HealthRubric | null,
): UnifiedContentItem[] {
  if (!rubric) return items;

  return items.map((item) => {
    const { score, status, recommendations } = assess(item, rubric);

    return {
      ...item,
      healthScore: score,
      healthStatus: status,
      healthRecommendations: recommendations,
    };
  });
}
