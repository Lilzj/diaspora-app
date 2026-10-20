// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country analytics (Frontend Phase 15, §11 · §65)
//
// A country is a country. §65 forbids treating it as a community, and this screen
// does not: its breakdown dimensions include `community` as a *dimension of* the
// country, and the header links to the community dashboard rather than pretending
// to be one.
//
// Real, since 20 Oct 2026. The job, housing, listing, provider, event and
// organisation counts come from the certified list routes, which take a country
// filter and return a genuine `totalCount`. How the country's official
// information is used — notice views, read completion, searches, alerts
// followed — comes from `GET /intelligence/countries/{cc}/analytics`, which
// answers intelligence editors; for anybody else those figures are named as
// unavailable. Population, growth and active members are counted by no route
// and are named as unavailable too. Nothing is simulated.
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
      gapDetail="The counts of what exists in this country — jobs, housing, listings, providers, events and organisations — are real figures from Diaspora's own routes. How the country's official information is used is shown to its editors. Member population and growth are not recorded."
    />
  );
}
