/**
 * The platform's Content Health rubric, for tests.
 *
 * A hand copy of `Diaspora.Modules.Creator/Domain/ContentHealth/ContentHealthRubric.cs`
 * as `GET /creators/content-health/rubric` serves it: the same keys, fields,
 * weights, hints and `AppliesTo`. The client holds no rubric of its own, so a
 * test of what the Content Health Center says has to serve this one. When the
 * backend's rubric changes, change this with it.
 *
 * Version 2 (24 Nov 2026): tags apply only to the types whose list cards carry
 * them. Events and homes cannot have tags, and version 1 told every one of them
 * to add some.
 */
import type { HealthRubric } from '../../creator/health';

export const HINT = {
  cover: 'Add a photograph. Members scroll past items they cannot see.',
  summary: 'Write a summary. It is what appears in search results.',
  category: 'Choose a category, so it appears where members look for it.',
  price: 'Say what it costs. Members filter on price, and an undisclosed one is skipped.',
  location: 'Add a city. Most members search their own first.',
  schedule: 'Set a date and time.',
  tags: 'Add a tag or two. They are how related items find each other.',
} as const;

export const PLATFORM_RUBRIC: HealthRubric = {
  version: 2,
  healthyAtOrAbove: 80,
  needsWorkBelow: 50,
  criteria: [
    { key: 'cover', field: 'coverImage', weight: 25, hint: HINT.cover, appliesTo: [] },
    { key: 'summary', field: 'summary', weight: 40, hint: HINT.summary, appliesTo: [] },
    { key: 'category', field: 'categoryKey', weight: 15, hint: HINT.category, appliesTo: [] },
    { key: 'price', field: 'price', weight: 10, hint: HINT.price, appliesTo: ['marketplace', 'housing'] },
    { key: 'location', field: 'location', weight: 10, hint: HINT.location, appliesTo: ['marketplace', 'housing', 'event', 'guide'] },
    { key: 'schedule', field: 'startsAt', weight: 10, hint: HINT.schedule, appliesTo: ['event'] },
    { key: 'tags', field: 'tags', weight: 10, hint: HINT.tags, appliesTo: ['marketplace', 'guide', 'provider', 'job'] },
  ],
};
