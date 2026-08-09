// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country analytics (Frontend Phase 15, §11 · §65)
//
// A country is a country. §65 forbids treating it as a community, and this screen
// does not: its breakdown dimensions include `community` as a *dimension of* the
// country, and the header links to the community dashboard rather than pretending
// to be one.
//
// Hybrid. The provider, guide, job, housing, listing and event counts are **real**
// — the certified list routes accept a country filter and return a genuine
// `totalCount`. The population, growth and engagement figures come from the
// development provider. Each card says which it is.
//
// §11's warning about sensitive country-level information is honoured through the
// capability set: population is an administrative metric, so a member without
// `canViewAdministrative` sees the inventory counts and not the demographics. For
// a country with few diaspora members on the platform, a population figure plus a
// neighbourhood breakdown approaches naming individuals.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { allCountries } from '@/mocks/countries';
import { SubjectDashboard } from '@/components/analytics';

export default function CountryAnalyticsScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const country = allCountries.find(
    (entry) => entry.code?.toUpperCase() === (code ?? '').toUpperCase()
  );

  return (
    <SubjectDashboard
      subject={{ type: 'country', id: (code ?? '').toUpperCase(), label: country?.name ?? null }}
      title={country?.name ?? code ?? 'Country'}
      subtitle="Activity and content in this country"
      breakdowns={['community', 'neighborhood', 'category', 'contentType']}
      gapDetail="The counts of what exists in this country — providers, guides, jobs, housing, listings and events — are real figures from Diaspora's own routes. The member population, growth and engagement figures are not recorded yet and come from a development adapter."
    />
  );
}
