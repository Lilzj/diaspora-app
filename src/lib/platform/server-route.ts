// ─────────────────────────────────────────────────────────────────────────────
// A route the server sends, as a screen the app has
//
// Creator recommendations, requirements, challenge tasks and lesson buttons
// carry an `actionRoute` the app pushes as it is. Three never matched a screen
// (UAT, 3 Nov 2026): `/knowledge/create` (the guide writer is `/guide/create`),
// `/community-life/events/create` (the event form is `.../event/create`) and
// `/community/report`, which no screen answers. The server sends the app's
// routes since 4 Nov 2026, but rows it stored before keep the old ones, so
// every place that follows a served route rewrites it here first.
// ─────────────────────────────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  '/knowledge/create': '/guide/create',
  '/community-life/events/create': '/community-life/event/create',
  '/community/report': '/safety/trading',
};

export function appRouteFor(route: string): string {
  return ALIASES[route] ?? route;
}
