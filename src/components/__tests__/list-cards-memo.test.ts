/**
 * The five cards the audit named are memoised (FARCH-004, 27 Nov 2026).
 *
 * `JobCard`, `HousingCard`, `MarketplaceCard`, `GuideResultCard` and
 * `ProviderCard` are each drawn once per row of a long list. The app stabilised
 * hundreds of callbacks and memoised almost no component, so the stabilising
 * bought nothing. A memoised card is not drawn again when its list re-renders
 * and hands it the same props.
 */
import { memo } from 'react';
import { JobCard } from '../JobCard';
import { HousingCard } from '../HousingCard';
import { MarketplaceCard } from '../MarketplaceCard';
import { GuideResultCard } from '../guides/GuideResultCard';
import { ProviderCard } from '../ProviderCard';

const MEMO = (memo(function Probe() { return null; }) as unknown as { $$typeof: symbol }).$$typeof;

it.each([
  ['JobCard', JobCard],
  ['HousingCard', HousingCard],
  ['MarketplaceCard', MarketplaceCard],
  ['GuideResultCard', GuideResultCard],
  ['ProviderCard', ProviderCard],
])('%s is a memoised component', (_name, card) => {
  expect((card as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO);
});
