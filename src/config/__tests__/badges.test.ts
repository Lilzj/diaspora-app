/**
 * How a served badge is drawn (UAT, 3 Nov 2026). The "Ten guides" badge printed the
 * word "library" where its icon belonged: the milestone catalogue names icons, and
 * the shelf drew whatever it was sent as text. Trust labels arrive with their own
 * emoji ("📱 Phone Verified"), so adding an icon in front drew two.
 */
import { toBadgeItem, trustBadgeLabel } from '@/config/badges';
import { servedIcon } from '@/lib/served-icon';
import type { CreatorReputationBadge } from '@/types/creator-economy';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

function badge(overrides: Partial<CreatorReputationBadge>): CreatorReputationBadge {
  return {
    badgeId: 'b1',
    key: 'knowledge',
    label: 'Ten guides',
    isEarned: false,
    source: 'milestone',
    ...overrides,
  } as CreatorReputationBadge;
}

describe('servedIcon', () => {
  it('draws an icon name as its emoji, never as the word', () => {
    expect(servedIcon('library', '🏅')).toBe('📚');
    expect(servedIcon('star', '🏅')).toBe('⭐');
    expect(servedIcon('graduation-cap', '🏅')).toBe('🎓');
  });

  it('keeps an emoji the server sent', () => {
    expect(servedIcon('🎯', '🏅')).toBe('🎯');
  });

  it('falls back for a name it does not know, or for none', () => {
    expect(servedIcon('rocket-ship', '🏅')).toBe('🏅');
    expect(servedIcon(null, '🏁')).toBe('🏁');
    expect(servedIcon(undefined, '🏁')).toBe('🏁');
  });
});

describe('toBadgeItem', () => {
  it('draws a milestone badge named "library" with the books emoji', () => {
    const item = toBadgeItem(badge({ icon: 'library' }));

    expect(item.icon).toBe('📚');
    expect(item.title).toBe('Ten guides');
  });

  it('moves a Trust label’s own emoji into the icon, so it shows once', () => {
    const item = toBadgeItem(
      badge({ key: 'PhoneVerified', label: '📱 Phone Verified', source: 'trust', isEarned: true }),
    );

    expect(item.icon).toBe('📱');
    expect(item.title).toBe('Phone Verified');
  });

  it('does not name the country twice when the label already carries its flag', () => {
    const item = toBadgeItem(
      badge({
        key: 'CountryVerified',
        label: '🇳🇬 Nigeria Verified',
        source: 'trust',
        countryCode: 'NG',
        isEarned: true,
      }),
    );

    expect(item.icon).toBe('🇳🇬');
    expect(item.title).toBe('Nigeria Verified');
  });

  it('gives a Trust badge with no emoji in its label an icon for its type', () => {
    const item = toBadgeItem(badge({ key: 'TopContributor', label: 'Top Contributor', source: 'trust' }));

    expect(item.icon).toBe('🏆');
  });

  it('shows how to earn a Trust badge still to earn', () => {
    const item = toBadgeItem(
      badge({
        key: 'PhoneVerified',
        label: '📱 Phone Verified',
        source: 'trust',
        description: 'Verify your phone number.',
      }),
    );

    expect(item.isEarned).toBe(false);
    expect(item.statusText).toBe('NOT YET');
    expect(item.description).toBe('Verify your phone number.');
  });
});

// Seen on the emulator, 4 Nov 2026: a guide's byline drew the author's badges as
// the server's type names, "PhoneVerified", "EarlyMember". The guide read sends
// the type alone, so the app words it the way Trust's own labels do.
describe('trustBadgeLabel', () => {
  it('words a Trust badge type the way Trust labels it', () => {
    expect(trustBadgeLabel('PhoneVerified')).toBe('Phone Verified');
    expect(trustBadgeLabel('EarlyMember')).toBe('Early Member');
    expect(trustBadgeLabel('GovernmentIdVerified')).toBe('Government ID Verified');
    expect(trustBadgeLabel('VerifiedOrganization')).toBe('Verified Organization');
  });

  it('splits a type it does not know into words rather than print it joined', () => {
    expect(trustBadgeLabel('NewKindOfBadge')).toBe('New Kind Of Badge');
  });

  it('is what the guide byline draws', () => {
    const screen = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'guide', '[id].tsx'), 'utf8');
    expect(screen).toContain('trustBadgeLabel(badge.badge)');
    expect(screen).not.toMatch(/>\s*\{badge\.badge\}/);
  });
});
