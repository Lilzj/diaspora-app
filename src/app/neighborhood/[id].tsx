// ─────────────────────────────────────────────────────────────────────────────
// Retired: the catalogue neighbourhood hub (14 Oct 2026)
//
// The platform's own place catalogue is retired, and with it the named
// neighbourhood this screen read from GET /housing/neighborhoods/{idOrSlug}. A
// neighbourhood is now the area around a point, at `/map/area`, with members'
// insights on the same page.
//
// The route stays so that an old link (a recommendation card, a notification, a
// shared URL) lands somewhere useful rather than on "not found". The id it
// carries is a catalogue slug with no coordinates, so it cannot be turned into
// a point; the area screen opens on the member's own location instead.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Redirect } from 'expo-router';

export default function RetiredNeighborhoodHub() {
  return <Redirect href="/map/area" />;
}
