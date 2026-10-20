// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — analytics dimension labels
//
// The lower-case noun a dimension is called in a sentence: "Views by content
// type", "Filter by neighbourhood". Lived in `mocks/analytics-data.ts` until 20 Oct
// 2026, which pulled the development dataset fixture into every production
// bundle through `AnalyticsControls`. It is a label table, not a fixture.
// ─────────────────────────────────────────────────────────────────────────────

import type { AnalyticsDimensionKey } from '@/types/analytics';

export function dimensionLabel(dimension: AnalyticsDimensionKey): string {
  switch (dimension) {
    case 'date':
      return 'date';
    case 'country':
      return 'country';
    case 'community':
      return 'community';
    case 'neighborhood':
      return 'neighbourhood';
    case 'category':
      return 'category';
    case 'contentType':
      return 'content type';
    case 'source':
      return 'traffic source';
    case 'surface':
      return 'surface';
    case 'placement':
      return 'placement';
    case 'plan':
      return 'plan';
    case 'status':
      return 'status';
    case 'language':
      return 'language';
    case 'platform':
      return 'platform';
  }
}
