// ─────────────────────────────────────────────────────────────────────────────
// When the register is right and the client is not
//
// `CommunityGapNotice` returns null the moment a gap's entry says
// `backendStatus: 'connected'` — the member does not need to be told about a
// hole that has been filled. That is correct, and it is also how two screens
// came to show nothing at all with no explanation.
//
// `useAnnouncements` and `useCommunityImpact` were still calling the *gap*
// adapter, whose queries carry `enabled: areCommunityGapsEnabled()` — false in
// any build without `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1`. So the query never ran,
// the data was empty, and the notice that would have said why had already been
// silenced by the register being accurate about the backend.
//
// Two correct mechanisms, one silent screen. The real adapters were in
// `community-programme-api` the whole time, under the same names.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const source = (...segments: string[]) =>
  fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

const hooks = source('hooks', 'community-life.ts');

/** The body of one exported hook, up to the next `export function`. */
function hookBody(name: string): string {
  const start = hooks.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`no hook named ${name}`);
  const next = hooks.indexOf('export function ', start + 10);
  return hooks.slice(start, next < 0 ? undefined : next);
}

describe('announcements read the platform', () => {
  const body = hookBody('useAnnouncements');

  it('no longer calls the gap adapter', () => {
    expect(body).not.toMatch(/gapApi\./);
    expect(body).toMatch(/b18\.fetchAnnouncements/);
  });

  it('is not gated on the preview flag', () => {
    // `enabled: areCommunityGapsEnabled()` is what made the feed empty rather
    // than wrong — a disabled query answers with nothing and no error.
    expect(body).not.toMatch(/areCommunityGapsEnabled/);
  });

  it('stops calling itself simulated', () => {
    expect(body).toMatch(/isSimulated: false/);
    expect(body).toMatch(/isEnabled: true/);
  });

  it('publishes through the platform too', () => {
    const publish = hookBody('usePublishAnnouncement');
    expect(publish).toMatch(/b18\.publishAnnouncement/);
    expect(publish).not.toMatch(/gapApi\./);
  });
});

describe('the impact view reads the platform', () => {
  const body = hookBody('useCommunityImpact');

  it('no longer calls the gap adapter', () => {
    expect(body).not.toMatch(/gapApi\./);
    expect(body).toMatch(/b18\.fetchCommunityImpact/);
  });

  it('is not gated on the preview flag', () => {
    expect(body).not.toMatch(/areCommunityGapsEnabled/);
  });

  it('renders the metrics the platform sent rather than six of its own', () => {
    // The gap answered eight fields the *client* had named. The route answers
    // `metrics[]`, each row carrying its own label, definition and source — so
    // a metric the platform stops computing disappears, and one it adds
    // arrives without a release.
    const screen = source('app', 'community-life', 'impact.tsx');

    expect(screen).toMatch(/impact\.metrics\.map/);
    for (const invented of [
      'Members helped',
      'Volunteer hours',
      'Events hosted',
      'Polls taken part in',
      'Initiatives supported',
    ]) {
      expect(screen).not.toContain(invented);
    }
  });

  it('shows what the platform says each figure counted', () => {
    expect(source('app', 'community-life', 'impact.tsx')).toMatch(/metric\.definition/);
  });
});

describe('the composer sends the field the route binds', () => {
  it('sends mediaIds, not mediaUrls', () => {
    // The gap adapter took URLs. `POST /communities/announcements` takes B5
    // asset identifiers, so a post with an image would have sent the wrong
    // thing under a name the route does not bind — invisible while the call
    // never left the building.
    const composer = source('components', 'creator', 'organization', 'PostsTab.tsx');

    expect(composer).toMatch(/mediaIds: \[\]/);
    expect(composer).not.toMatch(/mediaUrls:/);
  });
});

describe('a marker that outlived what it marked', () => {
  it('no longer stamps every analytics chart as simulated', () => {
    // Not suppressed by `backendStatus`, unlike the screen-level notice — so
    // this one *was* rendering, over real figures, while the file's own header
    // said it had been removed.
    const screen = source('app', 'community-life', 'dashboard', 'analytics.tsx');

    expect(screen).not.toMatch(/<SimulatedFigure/);
  });
});

describe('dead gap props', () => {
  // Harmless at runtime — `CommunityGapNotice` returns null for a connected
  // gap — but a `gapKey` on a screen reading a real route tells the next reader
  // the opposite of the truth.
  const fsx = require('fs') as { readdirSync(p: string, o: object): string[] };

  const screens = [
    ['announcements.tsx'],
    ['impact.tsx'],
    ['memberships.tsx'],
    ['campaign', 'index.tsx'],
    ['campaign', 'create.tsx'],
    ['campaign', 'update.tsx'],
    ['membership', 'index.tsx'],
    ['membership', 'apply.tsx'],
    ['membership', 'manage.tsx'],
    ['dashboard', 'members.tsx'],
    ['dashboard', 'analytics.tsx'],
    ['volunteer', 'index.tsx'],
    ['volunteer', 'create.tsx'],
    ['volunteer', 'applicants.tsx'],
    ['volunteer', 'dashboard.tsx'],
  ];

  it.each(screens)('%s carries no gap key', (...segments: string[]) => {
    expect(source('app', 'community-life', ...segments)).not.toMatch(/gapKey=/);
  });
});

describe('a refusal a member can read', () => {
  const convert = source('app', 'wallet', 'rewards', 'convert.tsx');

  it('does not put an error code on the screen', () => {
    // Seen on the device. `disabledReason` is
    // `financial.rewards.conversion_not_supported` — a code, not a sentence —
    // and rendering it directly showed a member that string.
    expect(convert).toMatch(/const REASONS: Record<string, string>/);
    expect(convert).toMatch(/financial\.rewards\.conversion_not_supported/);
  });

  it('falls back to prose for a code it has no words for', () => {
    // A code has dots and no spaces. Anything without a space is not prose.
    expect(convert).toMatch(/includes\(' '\)/);
  });

  it('gates on the platform rather than the build flag', () => {
    // It used to render `GapUnavailableView`, which returns null for a
    // connected key — a header over an empty body, on a money screen.
    expect(convert).toMatch(/policy && !policy\.isEligible/);
    expect(convert).not.toMatch(/GapUnavailableView/);
  });
});

describe('the three events the platform accepts and never received', () => {
  const emitters = source('lib', 'analytics', 'content-events.ts');

  it('checks the identifier is a GUID before emitting', () => {
    // `RecordTelemetryCommand` does `Guid.TryParse` and the schema's
    // `RequiresContent: true` refuses a null or empty one. The client's own
    // `refusalFor` only checked for a non-empty string, so a slug would have
    // passed locally and been refused where nobody was looking.
    expect(emitters).toMatch(/export function isTelemetryContentId/);
    expect(emitters).toMatch(/\[0-9a-f\]\{8\}-/);
  });

  it('uses the route-segment vocabulary the server parses', () => {
    // `FromRouteSegment`, not `FromCommunity`. The client's own `ContentType`
    // spells a provider `Provider` and a marketplace item `Marketplace`, and
    // both arrive as `Unknown` — accepted, stored, attributed to nothing.
    for (const segment of [
      'guide', 'post', 'event', 'job', 'housing', 'marketplace', 'provider', 'organization',
    ]) {
      expect(emitters).toContain(`'${segment}'`);
    }
  });

  it('does not throttle, because the server deduplicates', () => {
    // `PerActorPerContentPerDay`. A client-side guard would be a second,
    // disagreeing definition of the word "view".
    expect(emitters).not.toMatch(/setTimeout|Set<string>|seen\b/);
  });

  it('is emitted from every content detail screen', () => {
    const screens = [
      ['guide', '[id].tsx'],
      ['job', '[id].tsx'],
      ['marketplace', '[id].tsx'],
      ['housing', '[id].tsx'],
      ['provider', '[id].tsx'],
      ['community-life', 'event', '[id].tsx'],
      ['community-life', 'org', '[id].tsx'],
    ];

    for (const segments of screens) {
      expect(source('app', ...segments)).toMatch(/trackContentViewed\(/);
    }
  });

  it('is emitted from the public profile', () => {
    expect(source('app', 'contributor', '[id].tsx')).toMatch(/trackProfileViewed\(/);
  });

  it('carries the subject in contentId, because there is no subjectUserId key', () => {
    expect(emitters).toMatch(/contentId: input\.userId\.trim\(\)/);
  });

  it('emits impressions off a fingerprint rather than an array identity', () => {
    // `providers` is a fresh array on every render; keying the *emitter* on it
    // would fill the 200-record ring buffer with one search. A `useMemo` over
    // the same array is fine and there is one — this is about the effect.
    const search = source('app', '(tabs)', 'search.tsx');

    expect(search).toMatch(
      /trackContentImpression\([\s\S]{0,300}\}, \[providerImpressionKey\]\)/
    );
  });
});
