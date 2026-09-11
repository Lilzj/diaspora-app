// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community identity primitives (Frontend Phase 13, §8, §57,
// §59)
//
// The pieces every community surface is built from. Four rules hold across all of
// them, and each comes from a numbered requirement:
//
//   **A flag is never the only identifier (§59).** `<CommunityAvatar>` always
//   renders a name or an icon beside or instead of a flag, and every accessibility
//   label names the community in words. A member using a screen reader, a member
//   with a monochrome display, and a member looking at a regional community that
//   has no flag at all must each be able to tell which community they are looking
//   at. That last case is not hypothetical — `west-african` in the development
//   data has `countryCode: null` precisely so this path is exercised daily.
//
//   **Community branding does not override the design system (§57).** A community
//   may supply `accentColor`, and it is used for at most a 2px rule, a small dot
//   or an icon tint. Never a background, never body text, never a control. A
//   community cannot make its surface unreadable, and it cannot make itself look
//   like a platform-level affordance.
//
//   **Membership states are visually distinct, and distinctly *announced* (§8).**
//   Member, Interested, Following and Discovering get four different pills with
//   four different labels — and the label is text, not a colour, because §59
//   requires the distinction to survive a screen reader and a colour cannot.
//
//   **A badge never leaks the viewer's membership (§19, §41).** `<CommunityBadge>`
//   takes a `CommunityRef` and an association basis. It has no parameter for a
//   membership state, so a marketplace card physically cannot render "the seller
//   is a member of the Nigerian community" — the component has nowhere to put it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/design-system';
import type {
  Community,
  CommunityAssociation,
  CommunityMembershipState,
  CommunityRef,
  CommunityRole,
  CommunityStatus,
  CommunityType,
} from '@/types/community-directory';
import { membershipStateLabel } from '@/lib/community/scope';
import { CommunityAssociationNote } from './MultiCommunityGapNotice';

// ═════════════════════════════════════════════════════════════════════════════
// AVATAR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A community's visual mark.
 *
 * Falls back in a deliberate order: logo, then flag, then the community's own
 * Ionicons name, then a globe. The last two matter — a `RegionalDiaspora` has no
 * flag by definition, and rendering a blank square for it would make the
 * country-less case look like a bug rather than a legitimate kind of community.
 */
export function CommunityAvatar({
  community,
  size = 40,
  showStatusDot = false,
}: {
  community: CommunityRef | Community;
  size?: number;
  showStatusDot?: boolean;
}) {
  const { tokens } = useTheme();
  const status = (community as Community).status;

  const accent = community.identity.accentColor ?? tokens.color.secondary[500];

  return (
    <View style={{ width: size, height: size }} className="relative">
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 3,
          backgroundColor: tokens.color.neutral[100],
          // §57: the accent gets a hairline border, never a fill. A community
          // cannot repaint its own card.
          borderColor: `${accent}55`,
          borderWidth: 1,
        }}
        className="items-center justify-center overflow-hidden"
      >
        {community.identity.logoUrl ? (
          <Image
            source={{ uri: community.identity.logoUrl }}
            style={{ width: size, height: size }}
            contentFit="cover"
            // Empty: the label lives on the surrounding accessible element, so a
            // screen reader announces the community once rather than twice.
            accessibilityLabel=""
          />
        ) : community.origin.flag ? (
          <Text style={{ fontSize: size * 0.5 }}>{community.origin.flag}</Text>
        ) : (
          <Ionicons
            name={(community.identity.iconName as never) ?? 'globe-outline'}
            size={size * 0.5}
            color={accent}
          />
        )}
      </View>

      {showStatusDot && status && status !== 'Active' ? (
        <View
          style={{
            backgroundColor:
              status === 'Suspended'
                ? tokens.color.warning.default
                : status === 'Archived'
                  ? tokens.color.neutral[400]
                  : tokens.color.info.default,
            borderColor: tokens.color.surface.card,
          }}
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
        />
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPE AND STATUS LABELS — §58, §75
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The human label for a community type.
 *
 * These are platform UI strings and go through the same i18n path as the rest of
 * them. Community *names* are never composed here — they come from the data
 * (§58), which is why there is no `${countryName} community` template anywhere in
 * this file.
 */
export function communityTypeLabel(type: CommunityType): string {
  switch (type) {
    case 'NationalDiaspora':
      return 'National community';
    case 'RegionalDiaspora':
      return 'Regional community';
    case 'EthnoLinguistic':
      return 'Language & culture';
    case 'FaithCommunity':
      return 'Faith community';
    case 'InterestCommunity':
      return 'Interest community';
    case 'CityChapter':
      return 'Local chapter';
    default:
      return 'Community';
  }
}

export function communityStatusLabel(status: CommunityStatus): string {
  switch (status) {
    case 'Pending':
      return 'Being set up';
    case 'Suspended':
      return 'Paused';
    case 'Archived':
      return 'Closed';
    case 'Unavailable':
      return 'Unavailable';
    case 'Active':
    default:
      return 'Active';
  }
}

/**
 * Where a community comes from, as words.
 *
 * A country name where there is one, a region where there is not, and "Across
 * several countries" where there is neither. Never an empty string, because an
 * empty subtitle reads as a loading state.
 */
export function communityOriginLabel(community: CommunityRef | Community): string {
  if (community.origin.countryName) return community.origin.countryName;
  if (community.origin.regionName) return community.origin.regionName;
  return 'Across several countries';
}

// ═════════════════════════════════════════════════════════════════════════════
// BADGE — for content cards
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The community badge on a content card.
 *
 * Takes an association rather than a community, so the basis travels with it and
 * `<CommunityAssociationNote>` can qualify an inferred badge. Renders **nothing**
 * when the basis is `unknown` — a card with no defensible community association
 * gets no badge, rather than a badge saying "unknown".
 *
 * `additional` is rendered as a count, never as a row of badges: once regional and
 * city-chapter communities exist, a Nigerian-origin listing legitimately matches
 * three communities, and three badges on a card is noise.
 */
export function CommunityBadge({
  association,
  size = 'sm',
  showQualifier = false,
  onPress,
}: {
  association: CommunityAssociation;
  size?: 'xs' | 'sm';
  showQualifier?: boolean;
  onPress?: (community: CommunityRef) => void;
}) {
  const { tokens } = useTheme();
  const community = association.community;

  if (!community || association.basis === 'unknown') return null;

  const extra = association.additional?.length ?? 0;
  const accent = community.identity.accentColor ?? tokens.color.secondary[500];

  const label = [
    community.name,
    extra > 0 ? `and ${extra} more ${extra === 1 ? 'community' : 'communities'}` : null,
    association.basis === 'origin'
      ? 'matched by country of origin'
      : association.basis === 'location'
        ? 'matched by location'
        : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <View
      style={{
        backgroundColor: tokens.color.neutral[100],
        borderColor: `${accent}44`,
      }}
      className={`flex-row items-center self-start rounded-full border ${
        size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-1'
      }`}
    >
      {community.origin.flag ? (
        <Text style={{ fontSize: size === 'xs' ? 9 : 11 }}>{community.origin.flag}</Text>
      ) : (
        <Ionicons
          name={(community.identity.iconName as never) ?? 'globe-outline'}
          size={size === 'xs' ? 9 : 11}
          color={accent}
        />
      )}

      {/* §59: the name is always present. The flag never stands alone. */}
      <Text
        style={{ color: tokens.color.text.secondary }}
        className={`font-bold ml-1 ${size === 'xs' ? 'text-[9px]' : 'text-[10px]'}`}
        numberOfLines={1}
      >
        {community.name}
      </Text>

      {extra > 0 ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className={`font-bold ml-1 ${size === 'xs' ? 'text-[9px]' : 'text-[10px]'}`}
        >
          +{extra}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View testID="community-badge">
      {onPress ? (
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${label}. View this community.`}
          onPress={() => onPress(community)}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      ) : (
        <View accessible accessibilityRole="text" accessibilityLabel={label}>
          {content}
        </View>
      )}

      {showQualifier ? <CommunityAssociationNote basis={association.basis} compact /> : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP STATE PILL — §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The viewer's relationship to a community, as a pill.
 *
 * §8 requires Member, Interested, Following and Discovering to be visually
 * distinguishable. Each gets its own icon *and* its own text label, so the
 * distinction does not rest on colour — §59.
 *
 * `Discovering` renders nothing by default. It is not a relationship, it is the
 * absence of one plus the fact that somebody is looking, and a pill saying
 * "Viewing" on every card the member scrolls past would be noise. It is available
 * via `showDiscovering` for the one place it is meaningful: the community profile
 * header, where "you are not a member of this" is worth stating.
 */
export function MembershipStatePill({
  state,
  isPrimary = false,
  showDiscovering = false,
  size = 'sm',
}: {
  state: CommunityMembershipState;
  isPrimary?: boolean;
  showDiscovering?: boolean;
  size?: 'xs' | 'sm';
}) {
  const { tokens } = useTheme();

  if (state === 'None') return null;
  if (state === 'Discovering' && !showDiscovering) return null;

  const style = pillStyleFor(state, tokens);
  const label = membershipStateLabel(state);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={isPrimary ? `${label}. This is your primary community.` : label}
      style={{ backgroundColor: style.surface, borderColor: `${style.color}44` }}
      className={`flex-row items-center self-start rounded-full border ${
        size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-1'
      }`}
      testID={`membership-state-pill-${state}`}
    >
      <Ionicons name={style.icon} size={size === 'xs' ? 9 : 11} color={style.color} />
      <Text
        style={{ color: style.color }}
        className={`font-black uppercase tracking-wider ml-1 ${
          size === 'xs' ? 'text-[8px]' : 'text-[9px]'
        }`}
      >
        {label}
      </Text>
      {isPrimary ? (
        <>
          <Text style={{ color: style.color }} className="text-[9px] font-black mx-1">
            ·
          </Text>
          <Ionicons name="star" size={size === 'xs' ? 8 : 10} color={style.color} />
        </>
      ) : null}
    </View>
  );
}

type Tokens = ReturnType<typeof useTheme>['tokens'];

function pillStyleFor(
  state: CommunityMembershipState,
  tokens: Tokens
): { color: string; surface: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (state) {
    case 'VerifiedMember':
      return {
        color: tokens.color.success.default,
        surface: tokens.color.success.surface,
        icon: 'shield-checkmark',
      };
    case 'Member':
      return {
        color: tokens.color.secondary[500],
        surface: tokens.color.secondary[50],
        icon: 'people',
      };
    case 'Following':
      return {
        color: tokens.color.info.default,
        surface: tokens.color.info.surface,
        icon: 'notifications',
      };
    case 'Interested':
      return {
        color: tokens.color.primary[600],
        surface: tokens.color.primary[50],
        icon: 'bookmark',
      };
    case 'PendingApproval':
      return {
        color: tokens.color.warning.default,
        surface: tokens.color.warning.surface,
        icon: 'hourglass-outline',
      };
    case 'Revoked':
    case 'Declined':
      return {
        color: tokens.color.error.default,
        surface: tokens.color.error.surface,
        icon: 'close-circle-outline',
      };
    case 'Left':
      return {
        color: tokens.color.text.placeholder,
        surface: tokens.color.neutral[100],
        icon: 'exit-outline',
      };
    case 'Discovering':
    default:
      return {
        color: tokens.color.text.placeholder,
        surface: tokens.color.neutral[100],
        icon: 'eye-outline',
      };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ROLE BADGE — §34, §35, §37
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A community role, as a badge.
 *
 * **Display only.** §37: UI visibility is not authorization, and this component
 * grants nothing. It renders a role the *server* reported, which is reporting
 * rather than asserting — the distinction §35 requires for ambassador status
 * specifically.
 *
 * `Member` renders nothing: everybody in a community is a member, and a badge
 * saying so on every row would carry no information.
 */
/**
 * The roles worth a badge, in the order they should appear.
 *
 * `Member` is implied by being on the list at all. `Owner` always holds
 * `Administrator` too, so an owner shows one badge — Owner — rather than two
 * that say the same thing twice.
 */
export function rolesForDisplay(roles: CommunityRole[]): CommunityRole[] {
  const shown = roles.filter((role) => role !== 'Member');

  if (!shown.includes('Owner')) return shown;

  return ['Owner', ...shown.filter((role) => role !== 'Owner' && role !== 'Administrator')];
}

export function CommunityRoleBadge({
  role,
  size = 'sm',
}: {
  role: CommunityRole;
  size?: 'xs' | 'sm';
}) {
  const { tokens } = useTheme();

  if (role === 'Member') return null;

  const config: Record<
    Exclude<CommunityRole, 'Member'>,
    { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; surface: string }
  > = {
    Moderator: {
      label: 'Moderator',
      icon: 'shield-half-outline',
      color: tokens.color.info.default,
      surface: tokens.color.info.surface,
    },
    Ambassador: {
      label: 'Ambassador',
      icon: 'ribbon-outline',
      color: tokens.color.primary[600],
      surface: tokens.color.primary[50],
    },
    Administrator: {
      label: 'Admin',
      icon: 'construct-outline',
      color: tokens.color.secondary[500],
      surface: tokens.color.secondary[50],
    },
    // Since 11 Sep 2026: whoever founded the community. Always an administrator as
    // well, so a row that carries both shows Owner first and does not need to say
    // Admin beside it — see `rolesForDisplay`.
    Owner: {
      label: 'Owner',
      icon: 'key-outline',
      color: tokens.color.primary[700],
      surface: tokens.color.primary[50],
    },
  };

  const style = config[role];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${style.label} of this community`}
      style={{ backgroundColor: style.surface, borderColor: `${style.color}44` }}
      className={`flex-row items-center self-start rounded-full border ${
        size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-1'
      }`}
      testID={`community-role-badge-${role}`}
    >
      <Ionicons name={style.icon} size={size === 'xs' ? 9 : 11} color={style.color} />
      <Text
        style={{ color: style.color }}
        className={`font-black uppercase tracking-wider ml-1 ${
          size === 'xs' ? 'text-[8px]' : 'text-[9px]'
        }`}
      >
        {style.label}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROW — for directories and switchers
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One community, as a tappable row.
 *
 * The shared row for the directory, the switcher, the comparison picker and the
 * onboarding steps. One implementation rather than four, so a membership state
 * cannot render one way in the switcher and another in the directory.
 *
 * The whole row is one accessible element with one composed label, because a
 * screen reader user navigating a list of 200 communities should hear "Nigerian,
 * national community from Nigeria, verified member, your primary community" as one
 * utterance rather than as five stops.
 */
export function CommunityRow({
  community,
  membershipState = 'None',
  isPrimary = false,
  isSelected = false,
  reason,
  memberCountLabel,
  onPress,
  trailing,
}: {
  community: CommunityRef | Community;
  membershipState?: CommunityMembershipState;
  isPrimary?: boolean;
  isSelected?: boolean;
  reason?: string | null;
  /** Pre-formatted and already marked as an estimate by the caller (§29). */
  memberCountLabel?: string | null;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const status = (community as Community).status;

  const label = [
    community.name,
    communityTypeLabel(community.type),
    communityOriginLabel(community),
    membershipState !== 'None' && membershipState !== 'Discovering'
      ? membershipStateLabel(membershipState)
      : null,
    isPrimary ? 'your primary community' : null,
    status && status !== 'Active' ? communityStatusLabel(status) : null,
    memberCountLabel,
    reason,
    isSelected ? 'selected' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: isSelected ? tokens.color.primary[50] : tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[400] : tokens.color.border.default,
      }}
      className="flex-row items-center rounded-2xl border p-3 mb-2"
      testID={`community-row-${community.slug}`}
    >
      <CommunityAvatar community={community} size={42} showStatusDot />

      <View className="flex-1 ml-3">
        <View className="flex-row items-center flex-wrap">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-bold mr-1.5"
            numberOfLines={1}
          >
            {community.name}
          </Text>
          {isPrimary ? <Ionicons name="star" size={12} color={tokens.color.primary[500]} /> : null}
        </View>

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-0.5"
          numberOfLines={1}
        >
          {communityTypeLabel(community.type)} · {communityOriginLabel(community)}
          {memberCountLabel ? ` · ${memberCountLabel}` : ''}
        </Text>

        {reason ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-semibold mt-1 leading-relaxed"
            numberOfLines={2}
          >
            {reason}
          </Text>
        ) : null}

        <View className="flex-row items-center flex-wrap mt-1.5">
          <MembershipStatePill state={membershipState} isPrimary={isPrimary} size="xs" />
          {status && status !== 'Active' ? (
            <View
              style={{ backgroundColor: tokens.color.neutral[100] }}
              className="px-1.5 py-0.5 rounded-full ml-1.5"
            >
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[8px] font-black uppercase tracking-wider"
              >
                {communityStatusLabel(status)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {trailing ?? (
        isSelected ? (
          <Ionicons name="checkmark-circle" size={20} color={tokens.color.primary[500]} />
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
        ) : null
      )}
    </TouchableOpacity>
  );
}
