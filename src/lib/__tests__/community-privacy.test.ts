// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community privacy, analytics and persistence (Frontend
// Phase 13, §41, §45, §63)
//
// The three places a member's community membership could leak, each closed and each
// asserted here rather than described:
//
//   **Analytics (§63).** The allow-list drops any property that identifies a
//   person's relationship to a community. A `communityId` is a thing; a
//   `membershipState` is an identity record, and there is no path that emits one.
//
//   **Disk (§45).** The membership set is never written. Only the active *view
//   selection* and the display preferences are, and a `dev-` id is discarded when
//   the adapter is unreachable.
//
//   **Defaults (§41).** Every visibility flag starts off, and a partial record
//   merges over the off defaults — so a missing field can never read as consent.
//
// Why this matters more here than elsewhere: a diaspora community can imply
// nationality, immigration situation, religion or ethnicity. A device is lost,
// seized at a border, shared with family, or handed to a shop. A plaintext file
// saying "member of the Nigerian community, moderator of the Ghanaian one" is a
// record of all four, and a telemetry stream carrying the same is worse because it
// is retained by default.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  drainCreatorEvents,
  peekCreatorEvents,
  resetCreatorEvents,
} from '@/lib/creator-analytics';
import {
  associationProperties,
  scopeProperties,
  trackCommunityEvent,
} from '@/lib/community/analytics';
import {
  clearCommunityPersistence,
  isDevelopmentCommunityId,
  mergeCommunityMetadata,
  readCommunityContext,
  readCommunityMetadata,
  readCommunityPreferences,
  writeCommunityContext,
  writeCommunityPreferences,
} from '@/lib/community/persistence';
import { defaultCommunityPreferences } from '@/types/community-directory';
import type { CommunityRef } from '@/types/community-directory';

beforeEach(async () => {
  resetCreatorEvents();
  await AsyncStorage.clear();
});

// ═════════════════════════════════════════════════════════════════════════════
// §63 — ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

describe('the analytics allow-list drops membership information (§63)', () => {
  /** Every property key that must never reach the buffer. */
  const FORBIDDEN = [
    'membershipState',
    'roles',
    'role',
    'isPrimary',
    'primaryCommunityId',
    'interestedCommunityIds',
    'communityIds',
    'communitySlug',
    'communityName',
    'userId',
    'reporterId',
    'reporterName',
    'moderatorId',
    'reportNote',
    'note',
    'memberCount',
    'visibility',
    'nationality',
    'email',
    'phone',
  ];

  it.each(FORBIDDEN)('drops %s', (key) => {
    trackCommunityEvent('community.viewed', {
      communityId: 'dev-community-nigerian',
      [key]: 'something-sensitive',
    });

    const [record] = peekCreatorEvents();

    expect(record.properties).toHaveProperty('communityId');
    expect(record.properties).not.toHaveProperty(key);
  });

  it('keeps the properties that describe a thing rather than a person', () => {
    trackCommunityEvent('community.switched', {
      communityId: 'dev-community-ghanaian',
      communityMode: 'SELECTED_COMMUNITY',
      communityCount: 3,
      associationBasis: 'origin',
      scopeIsApproximate: true,
      contentDomain: 'housing',
      unavailableReason: 'empty',
      stepKey: 'primary',
      notificationScope: 'my-communities',
      isDevelopmentAdapter: true,
    });

    const [record] = peekCreatorEvents();

    expect(record.properties).toEqual({
      communityId: 'dev-community-ghanaian',
      communityMode: 'SELECTED_COMMUNITY',
      communityCount: 3,
      associationBasis: 'origin',
      scopeIsApproximate: true,
      contentDomain: 'housing',
      unavailableReason: 'empty',
      stepKey: 'primary',
      notificationScope: 'my-communities',
      isDevelopmentAdapter: true,
    });
  });

  it('emits a count and a mode for a scope, never the id list', () => {
    const properties = scopeProperties({
      mode: 'CROSS_COMMUNITY',
      communityCount: 4,
      isApproximate: true,
    });

    expect(properties).toEqual({
      communityMode: 'CROSS_COMMUNITY',
      communityCount: 4,
      scopeIsApproximate: true,
    });

    // There is deliberately no ergonomic path to emitting the set itself.
    expect(properties).not.toHaveProperty('communityIds');
  });

  it('emits an association basis, which is the number worth having from this phase', () => {
    const properties = associationProperties({
      communityId: 'dev-community-nigerian',
      basis: 'origin',
      contentDomain: 'job',
    });

    trackCommunityEvent('community.content.viewed', properties);
    const [record] = peekCreatorEvents();

    expect(record.properties.associationBasis).toBe('origin');
    expect(record.properties.contentDomain).toBe('job');
  });

  it('refuses an object or an array, however it is dressed up', () => {
    trackCommunityEvent('community.viewed', {
      communityId: { id: 'nested' } as never,
      communityCount: ['a', 'b'] as never,
    });

    const [record] = peekCreatorEvents();

    expect(record.properties).toEqual({});
  });

  it('adds no second buffer — it drains through the platform’s one', () => {
    trackCommunityEvent('community.joined', { communityId: 'ng' });

    const drained = drainCreatorEvents();

    expect(drained).toHaveLength(1);
    expect(drained[0].event).toBe('community.joined');
    expect(drained[0].occurredAt).toBeTruthy();
    // Drained means gone: the buffer is the platform's, and it is now empty.
    expect(peekCreatorEvents()).toHaveLength(0);
  });

  it('never throws, whatever it is handed', () => {
    expect(() => trackCommunityEvent('community.viewed')).not.toThrow();
    expect(() => trackCommunityEvent('community.viewed', undefined)).not.toThrow();
    expect(() =>
      trackCommunityEvent('community.viewed', { communityId: null as never })
    ).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §41 — DEFAULTS
// ═════════════════════════════════════════════════════════════════════════════

describe('privacy defaults are off (§41)', () => {
  it('publishes nothing by default', () => {
    const defaults = defaultCommunityPreferences();

    expect(defaults.showPrimaryCommunityOnProfile).toBe(false);
    expect(defaults.showInterestedCommunitiesOnProfile).toBe(false);
    expect(defaults.showCommunityRolesOnProfile).toBe(false);
    expect(defaults.notifications).toEqual([]);
  });

  it('leaves discovery on, which discloses nothing', () => {
    // Cross-community discovery is about what the *member* sees, not what others
    // see about them, so it is the one thing that defaults on.
    expect(defaultCommunityPreferences().crossCommunityDiscoveryEnabled).toBe(true);
  });

  it('merges a partial stored record over the off defaults, never the reverse', async () => {
    await AsyncStorage.setItem(
      'diaspora_community_preferences',
      JSON.stringify({ crossCommunityDiscoveryEnabled: false })
    );

    const read = await readCommunityPreferences();

    // The stored field wins…
    expect(read.crossCommunityDiscoveryEnabled).toBe(false);
    // …and the absent ones read as off, not as consent.
    expect(read.showPrimaryCommunityOnProfile).toBe(false);
    expect(read.showCommunityRolesOnProfile).toBe(false);
  });

  it('falls back to the safe defaults when the stored record is corrupt', async () => {
    await AsyncStorage.setItem('diaspora_community_preferences', '{not json');

    expect(await readCommunityPreferences()).toEqual(defaultCommunityPreferences());
  });

  it('round-trips a saved preference set', async () => {
    const preferences = {
      ...defaultCommunityPreferences(),
      showPrimaryCommunityOnProfile: true,
      notifications: [{ categoryKey: 'jobs', scope: 'primary-only' as const }],
    };

    await writeCommunityPreferences(preferences);

    expect(await readCommunityPreferences()).toEqual(preferences);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §45 — WHAT REACHES DISK
// ═════════════════════════════════════════════════════════════════════════════

describe('persistence writes the selection and not the membership (§45)', () => {
  it('persists the active selection and the recents', async () => {
    await writeCommunityContext({
      activeCommunityId: 'community-ng',
      mode: 'SELECTED_COMMUNITY',
      selectedCommunityIds: ['community-ng', 'community-gh'],
      recentCommunityIds: ['community-ng'],
    });

    const read = await readCommunityContext();

    expect(read?.activeCommunityId).toBe('community-ng');
    expect(read?.mode).toBe('SELECTED_COMMUNITY');
    expect(read?.selectedCommunityIds).toEqual(['community-ng', 'community-gh']);
    expect(read?.savedAt).toBeTruthy();
  });

  it('writes NO membership state, role or capability to disk', async () => {
    await writeCommunityContext({
      activeCommunityId: 'community-ng',
      mode: 'SELECTED_COMMUNITY',
      selectedCommunityIds: [],
      recentCommunityIds: [],
    });

    // Everything this module wrote, inspected as raw text.
    const keys = await AsyncStorage.getAllKeys();
    const stored = await Promise.all(
      keys.filter((k) => k.startsWith('diaspora_community')).map((k) => AsyncStorage.getItem(k))
    );
    const blob = stored.join(' ');

    for (const forbidden of [
      'VerifiedMember',
      'Moderator',
      'Ambassador',
      'Administrator',
      'canReviewReports',
      'canViewModerationQueue',
      'isPrimary',
      'membership',
      'capabilities',
      'roles',
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it('distinguishes a first run from a member who chose "all communities"', async () => {
    expect(await readCommunityContext()).toBeNull();

    await writeCommunityContext({
      activeCommunityId: null,
      mode: 'ALL_COMMUNITIES',
      selectedCommunityIds: [],
      recentCommunityIds: [],
    });

    const read = await readCommunityContext();
    expect(read).not.toBeNull();
    expect(read?.mode).toBe('ALL_COMMUNITIES');
  });

  it('bounds the recents list', async () => {
    await writeCommunityContext({
      activeCommunityId: null,
      mode: 'ALL_COMMUNITIES',
      selectedCommunityIds: [],
      recentCommunityIds: Array.from({ length: 40 }, (_, i) => `c-${i}`),
    });

    expect((await readCommunityContext())?.recentCommunityIds.length).toBeLessThanOrEqual(8);
  });

  it('survives a corrupt record without crashing a launch', async () => {
    await AsyncStorage.setItem('diaspora_community_context', 'not json at all');

    expect(await readCommunityContext()).toBeNull();
  });

  it('caches only the metadata a badge needs — no statistics, no member count', async () => {
    const ref: CommunityRef = {
      id: 'community-ng',
      slug: 'nigerian',
      name: 'Nigerian',
      type: 'NationalDiaspora',
      origin: { countryCode: 'NG', countryName: 'Nigeria', flag: '🇳🇬' },
      identity: { logoUrl: null, iconName: null, accentColor: null },
    };

    await mergeCommunityMetadata([ref]);
    const [cached] = await readCommunityMetadata();

    expect(cached.name).toBe('Nigerian');
    expect(cached.savedAt).toBeTruthy();
    // A stale statistic shown next to a date nobody reads would breach §29.
    expect(cached).not.toHaveProperty('memberCount');
    expect(cached).not.toHaveProperty('description');
  });

  it('bounds the metadata cache (§60)', async () => {
    const many: CommunityRef[] = Array.from({ length: 120 }, (_, index) => ({
      id: `c-${index}`,
      slug: `c-${index}`,
      name: `Community ${index}`,
      type: 'NationalDiaspora',
      origin: { countryCode: 'NG' },
      identity: {},
    }));

    await mergeCommunityMetadata(many);

    expect((await readCommunityMetadata()).length).toBeLessThanOrEqual(60);
  });

  it('clears everything on sign-out, so a shared device shows nothing', async () => {
    await writeCommunityContext({
      activeCommunityId: 'community-ng',
      mode: 'SELECTED_COMMUNITY',
      selectedCommunityIds: [],
      recentCommunityIds: ['community-ng'],
    });
    await writeCommunityPreferences({
      ...defaultCommunityPreferences(),
      showPrimaryCommunityOnProfile: true,
    });
    await mergeCommunityMetadata([
      {
        id: 'community-ng',
        slug: 'nigerian',
        name: 'Nigerian',
        type: 'NationalDiaspora',
        origin: {},
        identity: {},
      },
    ]);

    await clearCommunityPersistence();

    expect(await readCommunityContext()).toBeNull();
    expect(await readCommunityMetadata()).toEqual([]);
    expect(await readCommunityPreferences()).toEqual(defaultCommunityPreferences());
  });
});

describe('the dev-id guard (§65)', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    jest.resetModules();
  });

  it('recognises a development id', () => {
    expect(isDevelopmentCommunityId('dev-community-nigerian')).toBe(true);
    expect(isDevelopmentCommunityId('community-nigerian')).toBe(false);
    expect(isDevelopmentCommunityId(null)).toBe(false);
    expect(isDevelopmentCommunityId(undefined)).toBe(false);
  });

  it('keeps a development id while the adapter is reachable', async () => {
    await writeCommunityContext({
      activeCommunityId: 'dev-community-nigerian',
      mode: 'SELECTED_COMMUNITY',
      selectedCommunityIds: ['dev-community-nigerian'],
      recentCommunityIds: ['dev-community-nigerian'],
    });

    expect((await readCommunityContext())?.activeCommunityId).toBe('dev-community-nigerian');
  });

  it('DISCARDS a development id once the adapter is unreachable', async () => {
    // The scenario: a device ran a preview build, then took a production update.
    // Opening pointed at a community that does not exist — or worse, sending a
    // fabricated id to a real route — is what this prevents.
    await writeCommunityContext({
      activeCommunityId: 'dev-community-nigerian',
      mode: 'SELECTED_COMMUNITY',
      selectedCommunityIds: ['dev-community-nigerian', 'real-community-id'],
      recentCommunityIds: ['dev-community-nigerian'],
    });

    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();

    const { readCommunityContext: read } = require('@/lib/community/persistence');
    const stored = await read();

    expect(stored.activeCommunityId).toBeNull();
    expect(stored.selectedCommunityIds).toEqual(['real-community-id']);
    expect(stored.recentCommunityIds).toEqual([]);
  });

  it('filters development entries out of the metadata cache too', async () => {
    await mergeCommunityMetadata([
      {
        id: 'dev-community-nigerian',
        slug: 'nigerian',
        name: 'Nigerian',
        type: 'NationalDiaspora',
        origin: {},
        identity: {},
      },
      {
        id: 'real-community',
        slug: 'real',
        name: 'Real',
        type: 'NationalDiaspora',
        origin: {},
        identity: {},
      },
    ]);

    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
    jest.resetModules();

    const { readCommunityMetadata: read } = require('@/lib/community/persistence');
    const cached = await read();

    expect(cached.map((entry: CommunityRef) => entry.id)).toEqual(['real-community']);
  });
});
