// ─────────────────────────────────────────────────────────────────────────────
// BG-08 — content health, and the defect that lived between two correct things
//
// The rubric was right. `UnifiedContentItem` was right. `tsc` was clean, the unit
// suite was green and the runtime probe passed — because every one of those
// checks the two **separately**, and the defect only existed in the join:
//
//   rubric says   coverImage        item has   thumbnail
//   rubric says   categoryKey       item has   category
//   rubric says   description       item has   nothing at all
//
// So 65 of the 100 available points could never be satisfied, and a complete
// marketplace listing rendered **ACTION REQUIRED · 18%** beside its owner's name
// on a release build. That is FD-02 again — a health score that reads as a
// failing grade for content that is fine.
//
// It took a device to find. These tests are what mean it does not take one twice.
// ─────────────────────────────────────────────────────────────────────────────

import { assess, assessAll, type HealthRubric } from '../health';
import type { UnifiedContentItem } from '@/types/creator';

/** The rubric as the platform serves it. Field names are the PLATFORM's. */
const RUBRIC: HealthRubric = {
  version: 1,
  healthyAtOrAbove: 80,
  needsWorkBelow: 50,
  criteria: [
    { key: 'cover', field: 'coverImage', weight: 25, hint: 'Add a photograph.', appliesTo: [] },
    { key: 'summary', field: 'summary', weight: 40, hint: 'Write a summary.', appliesTo: [] },
    { key: 'category', field: 'categoryKey', weight: 15, hint: 'Choose a category.', appliesTo: [] },
    { key: 'price', field: 'price', weight: 10, hint: 'Say what it costs.', appliesTo: ['marketplace', 'housing'] },
    { key: 'location', field: 'location', weight: 10, hint: 'Add a city.', appliesTo: ['marketplace', 'housing', 'event', 'guide'] },
    { key: 'tags', field: 'tags', weight: 10, hint: 'Add a tag or two.', appliesTo: [] },
  ],
};

/** A listing with every field a member can fill in, filled in. */
function completeListing(): UnifiedContentItem {
  return {
    id: '01a024c8-4a06-7982-9766-93ae3b3fc39a',
    title: 'Refurbished laptop',
    contentType: 'Marketplace',
    currentStatus: 'Published',
    createdDate: '', lastUpdated: '',
    views: 0, bookmarks: 0, commentsCount: 0, messagesCount: 0, unreadMessagesCount: 0,
    publishingIdentity: {
      id: 'u1', name: 'A member', type: 'personal', avatar: '', handle: '',
      verified: false, followerCount: 0,
    },

    // The client's OWN field names. This is the whole point of the test.
    thumbnail: '04094716-f9fc-4c18-8098-0a86eca6cca2',
    summary: 'A refurbished machine with a new battery.',
    category: 'electronics',
    price: 'NGN 185,000',
    location: 'Lagos',
    tags: ['laptop'],
  };
}

describe('the rubric is evaluated against the shape the client actually holds', () => {
  it('scores a complete listing 100, not 18', () => {
    // The regression, stated as the number that shipped. Every criterion is
    // satisfied by a differently-named field, so a raw lookup scores 10.
    expect(assess(completeListing(), RUBRIC).score).toBe(100);
  });

  it('resolves every criterion the rubric declares to a field on the item', () => {
    // The structural version of the test above, and the one that catches a
    // criterion ADDED to the rubric later that the client cannot see. A field
    // the evaluator cannot read is not a measurement — it is a permanent
    // penalty, which is exactly what `description` was.
    // Blank EVERY field on the item in turn; each criterion must be knocked out
    // by exactly one of them. A criterion no blanking can move is one the
    // evaluator cannot see — which is what `description` was, and what
    // `coverImage` and `categoryKey` were before the alias map.
    const complete = completeListing();

    // `contentType` is excluded because it is not a scorable field — it decides
    // which criteria APPLY. Blanking it changes the applicable set rather than
    // the score, which is a different question from the one this test asks.
    const fields = Object.keys(complete).filter((f) => f !== 'contentType');

    const unreadable = RUBRIC.criteria.filter((criterion) => {
      const applies = criterion.appliesTo.length === 0
        || criterion.appliesTo.some((t) => t.toLowerCase() === complete.contentType.toLowerCase());

      if (!applies) return false;

      return !fields.some((field) => {
        const blanked = { ...complete, [field]: undefined } as UnifiedContentItem;
        return assess(blanked, RUBRIC).recommendations.some((r) => r.title === criterion.hint);
      });
    });

    expect(unreadable.map((c) => c.key)).toEqual([]);
  });

  it('marks down only what is actually missing, and says which', () => {
    const noPhoto = { ...completeListing(), thumbnail: undefined };
    const { score, status, recommendations } = assess(noPhoto, RUBRIC);

    // 85 of 110 — the applicable weights for a marketplace item total 110, not
    // 100. Scores are normalised over what applies, not over the whole rubric.
    expect(score).toBe(77);
    expect(status).toBe('needs_attention');
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].title).toBe('Add a photograph.');
  });

  it('does not mark a guide down for having no price', () => {
    // `appliesTo` excludes it, so the denominator excludes its weight too. A
    // guide with everything a guide can have scores 100, not 90.
    const guide: UnifiedContentItem = {
      ...completeListing(),
      contentType: 'Guide',
      price: undefined,
    };

    expect(assess(guide, RUBRIC).score).toBe(100);
  });

  it('matches appliesTo case-insensitively', () => {
    // The rubric is served in the platform's lower-case subject names and
    // `ContentType` is the client's capitalised union. Compared raw, `appliesTo`
    // matched nothing — which made every criterion apply to every type and would
    // have marked the guide above down for having no rent.
    const housing: UnifiedContentItem = { ...completeListing(), contentType: 'Housing' };

    expect(assess(housing, RUBRIC).score).toBe(100);
  });

  it('treats a whitespace-only summary as absent', () => {
    const blank = { ...completeListing(), summary: '   ' };

    expect(assess(blank, RUBRIC).score).toBe(64); // 70 of 110
  });

  it('leaves every item untouched when the platform served no rubric', () => {
    // Null is a real answer: a deployment that has not shipped BG-08. The cards
    // go on rendering "Health not measured" rather than a score from a rubric
    // this client made up, which is the fabrication the fan-out was written to
    // remove.
    const items = [completeListing()];
    const [item] = assessAll(items, null);

    expect(item.healthScore).toBeUndefined();
    expect(item.healthStatus).toBeUndefined();
    expect(item.healthRecommendations).toBeUndefined();
  });
});
