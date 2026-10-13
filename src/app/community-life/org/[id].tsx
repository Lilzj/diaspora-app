import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportModal } from '@/components/ReportModal';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { API_BASE_URL, apiClient } from '@/lib/apiClient';
import { useSavedStore } from '@/store/saved';
import { readPage } from '@/lib/platform-envelope';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ConversationHub } from '@/lib/conversation-hub';
import { useTheme } from '@/design-system';
import type { OrganizationWire } from '@/types/community-life';
import { useMembershipProgramme, usePublishOrganization } from '@/hooks/community-life';
import {
  joinOrganization,
  leaveOrganization,
  setOperatingHours,
  type OperatingHourWire,
} from '@/lib/community-life-api';
import { OperatingHoursEditor } from '@/components/community';
import { useAuthStore } from '@/store/auth';
import { trackContentViewed } from '@/lib/analytics/content-events';
import { backOr } from '@/lib/navigation';
import { OwnerRemoveButton } from '@/components/OwnerRemoveButton';
import { deleteOrganization } from '@/lib/community-life-api';

/**
 * Where the platform serves a media item's bytes.
 *
 * `GET /media/{mediaId}/content` answers without a bearer token — an unknown id
 * gives 404, not 401 — which is what lets a plain `<Image source={{ uri }}>`
 * load it.
 *
 * `undefined` for a missing id rather than a URL with `undefined` in it:
 * `expo-image` treats the former as nothing to load and the latter as a request
 * that will 404 on every render.
 */
export function mediaUri(mediaId?: string | null): string | undefined {
  return typeof mediaId === 'string' && mediaId.length > 0
    ? `${API_BASE_URL}/media/${mediaId}/content`
    : undefined;
}

/**
 * One opening-hours row, as a sentence.
 *
 * `OperatingHourResponse` carries `opensAt` / `closesAt` as `HH:mm` local time,
 * both null on a closed day or a by-arrangement one, plus an optional `note`.
 * The screen previously expected a ready-made `hours` string that no route has
 * ever sent.
 *
 * The note wins when there is one: "By arrangement" is more use than a time
 * range the organisation qualified for a reason.
 */
/**
 * When an event starts, in the reader's locale.
 *
 * The card previously read `evt.date`, which no route has ever sent — the list
 * serves `startsAt` as an ISO instant. An unparseable or absent value renders
 * nothing rather than "Invalid Date", which is the only thing worse than a
 * blank where a date should be.
 */
export function eventWhen(startsAt?: string | null): string {
  if (!startsAt) return '';
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function openingHoursLabel(row: {
  opensAt?: string | null;
  closesAt?: string | null;
  isClosed?: boolean;
  note?: string | null;
}): string {
  if (row.note?.trim()) return row.note.trim();
  if (row.isClosed) return 'Closed';
  if (row.opensAt && row.closesAt) return `${row.opensAt} – ${row.closesAt}`;
  // A half-open range is not a range. Saying so beats rendering "09:00 – ".
  return 'Hours not published';
}

export default function OrgProfileScreen() {
  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();

  /**
   * One view, counted by the platform.
   *
   * `content.viewed` is registered, client-submittable and had no emitter
   * anywhere — which is why `content.views` reads AWAITING_SOURCE. No
   * throttling here on purpose: the server deduplicates one person per item
   * per day, and a second rule in the client would be a second definition of
   * the same word.
   */
  useEffect(() => {
    trackContentViewed({ contentType: 'organization', contentId: id });
  }, [id]);
  const insets = useSafeAreaInsets();
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(false);
  const bottomOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bottomOffset, {
      toValue: isBottomNavVisible ? 60 + insets.bottom : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [isBottomNavVisible, insets.bottom]);

  // **`any` is how three wrong reads went unnoticed on this screen.**
  //
  // `org.id` (the wire says `organizationId`) made the Message button return
  // early and do nothing on every organisation. `org.contact.facebook` and its
  // three siblings live on `socialLinks`, so all four social buttons said the
  // channel was not linked whatever the organisation had entered. And
  // `org.location.addressLine` is not a field at all, so the place line read
  // "\ud83d\udccd undefined".
  //
  // This is the screen the contract-drift check was written for, after
  // `org.openingHours` crashed it. Those reads were corrected; the `any` that
  // let them happen was not.
  const [org, setOrg] = useState<OrganizationWire | null>(null);
  /** BG-02 — see the control at the foot of the profile. */
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [activeTab, setActiveTab] = useState<'About' | 'Events' | 'Updates' | 'Guides' | 'Providers' | 'Gallery'>('About');

  // The two fields the screen used to invent. Both read from the names the
  // route actually serves, and both default to an empty array so a payload
  // missing either renders nothing rather than taking the application down.
  const operatingHours: any[] = Array.isArray(org?.operatingHours) ? org.operatingHours : [];

  const galleryUris: string[] = useMemo(
    () =>
      (Array.isArray(org?.media) ? org.media : [])
        .slice()
        .sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
        .map((m: any) => m?.mediaId)
        .filter((mediaId: unknown): mediaId is string => typeof mediaId === 'string')
        // `GET /media/{mediaId}/content` serves the bytes and answers without a
        // bearer token (404 rather than 401 for an unknown id), which is what
        // makes a plain `<Image source>` able to load it.
        .map((mediaId: string) => mediaUri(mediaId) as string),
    [org?.media]
  );

  const viewerId = useAuthStore((state) => state.user?.userId ?? null);
  const publish = usePublishOrganization();
  // 404 for an organisation with no programme, which is most of them. The
  // error is deliberately not surfaced: absence is the common case, not a fault.
  const { programme } = useMembershipProgramme(id);

  // **You cannot message yourself.** An organisation's messages go to whoever owns it, and the
  // platform refuses a conversation whose two sides are the same person — correctly. Offering the
  // button anyway sent the owner of an organisation to a dead screen, which is how this was found.
  const canMessage = Boolean(org?.ownerUserId) && org?.ownerUserId !== viewerId;

  // **The platform says so, rather than the client guessing.**
  // `ViewerMembershipRole` is on the response, and `Administrator` and `Owner`
  // are the two roles whose job is described as managing the page. An id
  // comparison would have under-shown for an organisation's other
  // administrators, who can also publish it.
  const canManage =
    org?.viewerMembershipRole === 'Owner' || org?.viewerMembershipRole === 'Administrator';

  const { save, unsave, isSaved } = useSavedStore();
  const isFollowing = isSaved(id);

  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  /** Re-read the organisation, so what is rendered is what was stored. */
  const reloadOrg = async () => {
    const res = await apiClient.get(`/community-life/organizations/${id}`);
    setOrg(res.data.data);
  };

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      const result = await joinOrganization(id);
      await reloadOrg();
      showAlert({
        type: 'success',
        // **The platform decides, and it says which happened.** An `Open` body
        // admits immediately and a `RequestToJoin` one records a request; both
        // answer with a status, so neither outcome is guessed at here.
        title: result.status === 'Active' ? 'You are a member' : 'Request sent',
        message:
          result.status === 'Active'
            ? 'You will see this organisation in your memberships.'
            : 'An administrator will decide. You will hear when they do.',
      });
    } catch (err) {
      console.error('Failed to join organisation', err);
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not sent',
        // Unanswered is not a refusal. Reopening is the check, not a retry.
        message:
          detail?.trim() ||
          'That could not be sent just now. Open the page again in a moment to check.',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = () => {
    showAlert({
      type: 'question',
      title: 'Leave this organisation?',
      message: 'You will stop seeing its members-only announcements. You can ask to rejoin.',
      buttons: [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          onPress: async () => {
            setIsJoining(true);
            try {
              await leaveOrganization(id);
              await reloadOrg();
              showAlert({ type: 'success', title: 'You have left', message: '' });
            } catch (err) {
              console.error('Failed to leave organisation', err);
              showAlert({
                type: 'error',
                title: 'Not done',
                message:
                  'That could not be completed just now. Open the page again in a moment to check.',
              });
            } finally {
              setIsJoining(false);
            }
          },
        },
      ],
    });
  };

  /**
   * What the membership card says, entirely from what the organisation stated.
   *
   * Nothing here infers a capability. `membershipPolicy` is one of `Open`,
   * `RequestToJoin`, `InviteOnly` and `Closed`; `acceptsMembership` is the
   * platform's own answer to "is the door open"; `viewerMembershipStatus` is
   * `Requested`, `Invited`, `Active`, or absent.
   */
  const membership = useMemo(() => {
    const hidden = {
      isVisible: false,
      heading: '',
      body: '',
      action: null as string | null,
      isLeaving: false,
      onPress: () => {},
    };

    if (!org) return hidden;

    const status = org.viewerMembershipStatus;
    const policy = org.membershipPolicy;

    if (status === 'Active') {
      // **An owner cannot leave, and the platform says so.**
      // `OrganizationMembership.Leave` refuses `MembershipRole.Owner` with
      // `OwnerCannotLeave`, so a Leave button here would be refused on every
      // press — the shape of defect this card was replaced for.
      if (org.viewerMembershipRole === 'Owner') {
        return {
          ...hidden,
          isVisible: true,
          heading: 'You run this organisation',
          body: 'An owner cannot leave. Hand ownership to another administrator first.',
        };
      }

      return {
        isVisible: true,
        heading: 'You are a member',
        body: 'You see this organisation’s announcements and members-only events.',
        action: 'Leave',
        isLeaving: true,
        onPress: handleLeave,
      };
    }

    if (status === 'Requested') {
      return {
        ...hidden,
        isVisible: true,
        heading: 'Request sent',
        body: 'An administrator is deciding. You will hear when they do.',
      };
    }

    if (status === 'Invited') {
      return {
        isVisible: true,
        heading: 'You have been invited',
        body: 'An administrator asked you to join this organisation.',
        action: 'Accept',
        isLeaving: false,
        onPress: handleJoin,
      };
    }

    // The door is shut, or only opens from the inside. Saying so beats a Join
    // button that is refused on every press.
    if (org.acceptsMembership === false || policy === 'Closed') {
      return {
        ...hidden,
        isVisible: true,
        heading: 'Not taking members',
        body: 'This organisation is not accepting new members at the moment.',
      };
    }

    if (policy === 'InviteOnly') {
      return {
        ...hidden,
        isVisible: true,
        heading: 'By invitation',
        body: 'An administrator adds members to this organisation.',
      };
    }

    if (policy === 'RequestToJoin') {
      return {
        isVisible: true,
        heading: 'Ask to join',
        body: 'Anyone may ask. An administrator decides who joins.',
        action: 'Ask to join',
        isLeaving: false,
        onPress: handleJoin,
      };
    }

    if (policy === 'Open') {
      return {
        isVisible: true,
        heading: 'Open to everyone',
        body: 'Join to see this organisation’s announcements and members-only events.',
        action: 'Join',
        isLeaving: false,
        onPress: handleJoin,
      };
    }

    // A policy this build does not recognise. Nothing is claimed either way —
    // an unknown answer is not a yes, and inventing a Join button here is how
    // the card this replaced came to exist.
    return hidden;
  }, [
    org?.viewerMembershipStatus,
    org?.viewerMembershipRole,
    org?.membershipPolicy,
    org?.acceptsMembership,
  ]);

  /**
   * Replace the organisation's opening hours.
   *
   * `revision` goes with the write so a second administrator editing the same
   * profile is refused rather than silently overwriting the first.
   */
  const handleSaveHours = async (hours: OperatingHourWire[]) => {
    if (!org) return;

    setIsSavingHours(true);
    try {
      // The route answers with the whole organisation, so the rendered profile
      // comes from what was stored rather than from what was typed.
      setOrg(await setOperatingHours(id, hours, org.revision));
      setIsEditingHours(false);
      showAlert({
        type: 'success',
        title: 'Hours saved',
        message: 'People can see when you are open.',
      });
    } catch (err) {
      // Unanswered is not a no. The write may well have landed; what failed is
      // knowing, and saying "not saved" would be a guess.
      console.error('Failed to save operating hours', err);
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not saved',
        message:
          detail?.trim() ||
          'The hours could not be saved just now. Open the profile again in a moment to check.',
      });
    } finally {
      setIsSavingHours(false);
    }
  };

  useEffect(() => {
    const fetchOrgDetails = async () => {
      setIsLoading(true);
      setErrorMsg('');
      try {
        const res = await apiClient.get(`/community-life/organizations/${id}`);
        setOrg(res.data.data);
      } catch (err: any) {
        console.error('Error fetching organization details', err);
        setErrorMsg(err?.response?.data?.message || 'Failed to load organization profile.');
      } finally {
        setIsLoading(false);
      }
    };
    if (id) {
      fetchOrgDetails();
    }
  }, [id]);

  const handleFollowToggle = () => {
    if (isFollowing) {
      unsave(id);
    } else {
      save(id, 'Organization');
    }
  };

  /**
   * Announces the organisation.
   *
   * Asked for first. There is an archive route and a restore-into-draft, but
   * neither is what a member would mean by "undo" here — publishing is what
   * makes the page findable, and the copy says so rather than implying it can
   * be quietly taken back.
   */
  const handlePublish = () => {
    if (!org?.organizationId) return;

    showAlert({
      type: 'question',
      title: 'Publish this organisation?',
      message:
        'It becomes discoverable and people can find and follow it. You cannot put it back to a draft afterwards.',
      buttons: [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            try {
              setOrg(await publish.mutateAsync({ organizationId: org.organizationId }));
              showAlert({
                type: 'success',
                title: 'Published',
                message: 'People can find it now.',
              });
            } catch (err) {
              console.error('Failed to publish organisation', err);
              const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail;
              showAlert({
                type: 'error',
                title: 'Not published',
                message:
                  detail?.trim() ||
                  'The organisation could not be published. It is still saved as a draft, so nothing is lost.',
              });
            }
          },
        },
      ],
    });
  };

  const handleSocialLink = (url?: string) => {
    if (!url) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'This organization has not linked this social channel.' });
      return;
    }
    Linking.openURL(url);
  };

  // ── What actually belongs to this organisation ─────────────────────────────
  //
  // This block used to build all four tabs out of `@/mocks`:
  //
  //     const events    = mockEvents.filter(e => e.host.id === org.id);
  //     const updates   = mockCommunityUpdates.filter(u => u.title.includes(firstWord));
  //     const guides    = mockGuides.filter(g => g.title.includes(firstWord));
  //     const providers = mockListings.filter(l => l.category.name === 'catering' || …);
  //
  // `org.id` is not a field — the response spells it `organizationId` — so Events
  // was **permanently empty**. The other three were joined by keyword match
  // against the organisation's *name*, so "Yaba Nigerian Association" was shown
  // any mock guide with "Yaba" in its title, and every organisation on the
  // platform was shown the same catering and legal listings.
  //
  // That is content presented as belonging to an organisation when nothing
  // connects them: the same defect as the invented rating above, one layer up.
  //
  // Events now come from `GET /community-life/events?organizationId=…`, which is
  // a real filter the route binds. Guides and services come off the profile
  // response, which carries both.
  const [orgEvents, setOrgEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiClient.get('/community-life/events', {
          params: { organizationId: id, limit: 20 },
        });
        if (!cancelled) setOrgEvents(readPage<any>(res.data).items);
      } catch {
        // An unreadable list is not an empty one, but this tab has no error
        // state of its own yet; leaving it empty is the same thing it did
        // before and is at least not a false association.
        if (!cancelled) setOrgEvents([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const associatedData = useMemo(
    () => ({
      events: orgEvents,
      // `OrganizationResponse.guides` and `.services` are the organisation's own
      // collections. Empty is now *empty*, not "we could not find a mock whose
      // title contains the first word of your name".
      guides: Array.isArray(org?.guides) ? org.guides : [],
      providers: Array.isArray(org?.services) ? org.services : [],
      // Community updates have no organisation link on the platform at all —
      // no route filters them by organisation and no field on this response
      // carries them. Rather than keyword-match mock content and call it this
      // organisation's, the tab shows its empty state and says so.
      updates: [] as any[],
    }),
    [orgEvents, org?.guides, org?.services]
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center">
        <ActivityIndicator size="large" color="#F59300" />
        <Text className="text-xs font-bold text-content-muted mt-4 uppercase tracking-widest">Loading Community Hub...</Text>
      </SafeAreaView>
    );
  }

  if (errorMsg || !org) {
    return (
      <SafeAreaView className="flex-1 bg-surface-card items-center justify-center p-6">
        <Ionicons name="warning" size={48} color="#EF4444" />
        <Text className="text-lg font-bold text-content-strong text-center mt-3">{errorMsg || 'Hub Profile Not Found'}</Text>
        <TouchableOpacity onPress={() => backOr()} className="bg-primary-500 px-6 py-3 rounded-full mt-6">
          <Text className="text-white font-bold text-xs">Back to Directory</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* Top Navbar */}
      <View className="bg-surface-card px-6 py-4 flex-row justify-between items-center border-b border-faint shadow-sm z-10">
        <TouchableOpacity onPress={() => backOr()} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
          <Ionicons name="arrow-back" size={20} color={tokens.color.text.primary} />
        </TouchableOpacity>
        <Text className="text-sm font-black text-content-primary uppercase tracking-widest">Community Hub</Text>
        <TouchableOpacity
          onPress={handleFollowToggle}
          className={`px-4 py-2 rounded-full border ${
            isFollowing ? 'bg-surface-background border-subtle' : 'bg-primary-500 border-primary-500'
          }`}
        >
          <Text className={`text-[10px] font-black uppercase ${isFollowing ? 'text-content-muted' : 'text-white'}`}>
            {isFollowing ? 'Following' : 'Follow Hub'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollEndScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        activeTab="discover"
        onBottomNavVisibilityChange={setIsBottomNavVisible}
        contentContainerStyle={{ paddingBottom: isBottomNavVisible ? 160 : 100 }}
      >
        
        {/* Cover Photo
          *
          * `org.coverImage` and `org.logo` are not fields. The response carries
          * `coverMediaId` and `logoMediaId`, and the bytes come from
          * `GET /media/{mediaId}/content` — so both images resolved to
          * `uri: undefined` on every organisation and the header rendered as
          * two empty grey boxes. `mediaUri` returns `undefined` when there is no
          * id, which is what `expo-image` already treats as "nothing to load".
          */}
        <View className="h-44 bg-subtle relative">
          <Image
            source={{ uri: mediaUri(org.coverMediaId) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          {/* Logo overlay */}
          <View className="absolute bottom-[-30px] left-6 w-20 h-20 rounded-3xl bg-surface-card p-1 border border-subtle shadow overflow-hidden">
            <Image
              source={{ uri: mediaUri(org.logoMediaId) }}
              style={{ width: '100%', height: '100%', borderRadius: 20 }}
              contentFit="cover"
            />
          </View>
        </View>

        {/* Title, Category & Verification */}
        <View className="bg-surface-card px-6 pt-12 pb-5 border-b border-faint mb-3">
          <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
            {/* `category` is not a field either; the response spells the
              * readable form `organizationTypeName` (and the key
              * `organizationTypeKey`). This chip was blank on every profile. */}
            <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest bg-primary-50 px-2 py-0.5 rounded">
              {org.organizationTypeName ?? org.organizationTypeKey}
            </Text>
            {org.isVerified && (
              <View className="bg-success-surface px-2.5 py-0.5 rounded flex-row items-center border border-[#A3EBDB]">
                <Ionicons name="checkmark-circle" size={10} color="#10B981" className="mr-0.5" />
                <Text className="text-[8px] font-black text-success-default uppercase">Verified Hub</Text>
              </View>
            )}
          </View>

          <Text className="text-xl font-black text-content-primary leading-snug">{org.name}</Text>
          {/* `addressLine` is not on `LocationResponse` — the place line read
              "📍 undefined" on every organisation. `displayName` is the
              platform's own one-line rendering of where something is. */}
          {org.location?.displayName ? (
            <Text className="text-xs text-content-muted mt-1 font-bold">
              📍 {org.location.displayName}
            </Text>
          ) : null}

          {/*
            **Read off `socialLinks`, not `contact`.**

            `ContactResponse` carries phone, whatsApp, email, website and a
            contact name. The social channels are a separate object, so these
            four read `undefined` whatever the organisation had entered, and
            every one of them answered "This organisation has not linked this
            social channel." Four buttons that could only ever apologise.

            `youTube` and not `youtube`: the wire property is `YouTube` and the
            camel-case policy lowercases only the leading run.

            Only a channel that exists gets a button now. An affordance that
            cannot work is worse than a gap where it would have been.
          */}
          {(
            [
              ['logo-facebook', '#3B5998', org.socialLinks?.facebook],
              ['logo-instagram', '#C13584', org.socialLinks?.instagram],
              ['logo-twitter', '#1DA1F2', org.socialLinks?.twitter],
              ['logo-youtube', '#FF0000', org.socialLinks?.youTube],
              ['logo-linkedin', '#0A66C2', org.socialLinks?.linkedIn],
            ] as const
          ).filter(([, , url]) => Boolean(url)).length > 0 ? (
            <View className="flex-row gap-3 mt-4 pt-3.5 border-t border-faint justify-start">
              {(
                [
                  ['logo-facebook', '#3B5998', org.socialLinks?.facebook, 'Facebook'],
                  ['logo-instagram', '#C13584', org.socialLinks?.instagram, 'Instagram'],
                  ['logo-twitter', '#1DA1F2', org.socialLinks?.twitter, 'Twitter'],
                  ['logo-youtube', '#FF0000', org.socialLinks?.youTube, 'YouTube'],
                  ['logo-linkedin', '#0A66C2', org.socialLinks?.linkedIn, 'LinkedIn'],
                ] as const
              )
                .filter(([, , url]) => Boolean(url))
                .map(([icon, colour, url, label]) => (
                  <TouchableOpacity
                    key={icon}
                    accessibilityRole="link"
                    accessibilityLabel={`${org.name} on ${label}`}
                    onPress={() => handleSocialLink(url ?? undefined)}
                    className="w-9 h-9 bg-surface-background rounded-xl items-center justify-center border border-subtle"
                  >
                    <Ionicons name={icon} size={16} color={colour} />
                  </TouchableOpacity>
                ))}
            </View>
          ) : null}
        </View>

        {/*
          **A draft is invisible and nothing said so.**

          `POST /organizations/{id}/publish` has been served since the module
          shipped and the client never called it — the same gap events had.
          Creating an organisation always makes a draft, so without this an
          organisation could be registered and never be found by anybody.

          Shown only to somebody whose role is to manage the page, and only
          while it is still a draft.
        */}
        {canManage && org.status === 'Draft' ? (
          <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="eye-off-outline" size={16} color="#F59300" />
              <Text className="text-xs font-black text-content-strong ml-2 uppercase tracking-widest">
                Draft
              </Text>
            </View>

            <Text className="text-[11px] text-content-secondary font-semibold leading-relaxed">
              Only you can see this. Publish it and people can find and follow it.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Publish this organisation"
              accessibilityState={{ busy: publish.isPending }}
              disabled={publish.isPending}
              onPress={handlePublish}
              className="bg-primary-500 rounded-full py-3 items-center mt-4"
            >
              {publish.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white text-[11px] font-black uppercase tracking-widest">
                  Publish organisation
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── "Community Reputation" ────────────────────────────────────────
          *
          * This block rendered `org.rating || 4.7` beside a five-star icon, a
          * progress bar filled to 94%, and `org.reputationLevel ||
          * 'Highly Trusted'`.
          *
          * **The platform has no organisation rating.** `OrganizationResponse`
          * declares neither `rating` nor `reputationLevel`, so both reads were
          * always `undefined` and the fallbacks fired on **every organisation
          * profile, always**. The one opened on a device to find this was
          * `verificationState: "Unverified"`, `isVerified: false`, with one
          * member — and the application told the reader it was rated 4.7 out of
          * 5 and Highly Trusted.
          *
          * That is not a stale number. It is a trust claim the platform never
          * made, contradicting the verification state on the same screen, on a
          * surface a member uses to decide whether an organisation is safe to
          * deal with. Nothing here can be "fixed" by pointing at a different
          * field, because there is no field: the section is replaced with what
          * the response does carry — the verification state, and the membership
          * and event counts in `statistics`.
          */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">This organisation</Text>

          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Ionicons
                name={org.isVerified ? 'shield-checkmark' : 'shield-outline'}
                size={16}
                color={org.isVerified ? '#10B981' : '#9CA3AF'}
                className="mr-1"
              />
              <Text className="text-sm font-black text-content-primary">
                {org.isVerified ? 'Verified by Diaspora' : 'Not yet verified'}
              </Text>
            </View>
            {org.verificationBadge && (
              <Text className="text-[10px] font-black text-success-default bg-success-surface px-2 py-0.5 rounded uppercase">
                {org.verificationBadge}
              </Text>
            )}
          </View>

          {!org.isVerified && (
            <Text className="text-[11px] text-content-muted font-semibold mb-3">
              Diaspora has not checked this organisation. Take the same care you would with any
              group you have not met.
            </Text>
          )}

          <View className="flex-row gap-6">
            <View>
              <Text className="text-sm font-black text-content-primary">
                {org.statistics?.memberCount ?? 0}
              </Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase tracking-widest">
                {org.statistics?.memberCount === 1 ? 'Member' : 'Members'}
              </Text>
            </View>
            <View>
              <Text className="text-sm font-black text-content-primary">
                {org.statistics?.publishedEventCount ?? 0}
              </Text>
              <Text className="text-[10px] text-content-faint font-bold uppercase tracking-widest">
                Events posted
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Row Navigation */}
        <View className="bg-surface-card border-b border-faint flex-row px-4 justify-between mb-3">
          {['About', 'Events', 'Updates', 'Guides', 'Providers', 'Gallery'].map((tabName) => {
            const isActive = activeTab === tabName;
            return (
              <TouchableOpacity
                key={tabName}
                onPress={() => setActiveTab(tabName as any)}
                className={`py-3.5 px-2 border-b-2 ${
                  isActive ? 'border-primary-500' : 'border-transparent'
                }`}
              >
                <Text
                  className={`text-[11px] font-black uppercase ${
                    isActive ? 'text-primary-500' : 'text-content-muted'
                  }`}
                >
                  {tabName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Contents */}
        <View className="px-6 pb-12">
          
          {/* ABOUT TAB */}
          {activeTab === 'About' && (
            <View className="gap-5">
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Mission Statement</Text>
                <Text className="text-sm text-content-secondary font-semibold leading-relaxed italic">
                  "{org.mission}"
                </Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">About Us</Text>
                <Text className="text-sm text-content-secondary font-semibold leading-relaxed">
                  {org.description}
                </Text>
              </View>

              {/* ── Opening hours ────────────────────────────────────────────
                *
                * This read `org.openingHours` and called `.map` on it with no
                * guard. The route serves `operatingHours`, and never anything
                * called `openingHours` — so the value was always `undefined` and
                * **every organisation profile crashed the whole application** on
                * open, with `TypeError: Cannot read property 'map' of undefined`
                * from `OrgProfileScreen`. Found by opening one on a device.
                *
                * The row shape is different too: the server sends
                * `{ id, day, opensAt, closesAt, isClosed, note }`, not a
                * pre-formatted `hours` string, so a rename alone would have
                * rendered a column of blanks. `openingHoursLabel` builds the
                * sentence, and the section is hidden rather than showing an
                * empty card when the organisation has published no hours.
                */}
              {/*
                * Editable by whoever runs the organisation.
                *
                * `PUT /organizations/{id}/operating-hours` was the fourth route
                * served here with no caller. The register form hardcoded three
                * rows that went nowhere, so an organisation could not state its
                * hours and could not correct the ones invented for it — which
                * is why not one organisation on the platform has any.
                */}
              {isEditingHours ? (
                <View>
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Opening Hours</Text>
                  <OperatingHoursEditor
                    hours={operatingHours}
                    isSaving={isSavingHours}
                    onCancel={() => setIsEditingHours(false)}
                    onSave={handleSaveHours}
                  />
                </View>
              ) : operatingHours.length > 0 || canManage ? (
                <View>
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Opening Hours</Text>
                    {canManage ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Edit opening hours"
                        onPress={() => setIsEditingHours(true)}
                      >
                        <Text className="text-[11px] font-black text-primary-500 uppercase tracking-widest">
                          {operatingHours.length > 0 ? 'Edit' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View className="bg-surface-card border border-subtle rounded-2xl p-4 gap-2 shadow-sm">
                    {operatingHours.length > 0 ? (
                      operatingHours.map((oh: any, idx: number) => (
                        <View key={oh.id ?? idx} className="flex-row justify-between py-1 border-b border-faint last:border-0">
                          <Text className="text-xs font-bold text-content-secondary">{oh.day}</Text>
                          <Text className="text-xs text-content-muted font-semibold">{openingHoursLabel(oh)}</Text>
                        </View>
                      ))
                    ) : (
                      // Only a manager sees this: a reader is shown no section
                      // at all rather than an empty card telling them nothing.
                      <Text className="text-xs text-content-muted font-semibold">
                        You have not published any opening hours yet.
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              {/* Leaders / Organizers */}
              {org.leaders && org.leaders.length > 0 && (
                <View>
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Leadership / Organizers</Text>
                  <View className="flex-row gap-4">
                    {org.leaders.map((leader: any, idx: number) => (
                      <View key={idx} className="flex-row items-center bg-surface-card border border-subtle p-3 rounded-2xl flex-1 shadow-sm">
                        <View className="w-8 h-8 rounded-full bg-surface-muted items-center justify-center mr-3 overflow-hidden">
                          <Ionicons name="person" size={16} color="#6B7280" />
                        </View>
                        <View>
                          <Text className="text-xs font-black text-content-strong">{leader.name}</Text>
                          <Text className="text-[9px] text-content-muted font-bold mt-0.5">{leader.role}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/*
                **Membership, which this platform has and this card denied.**

                It used to read "👑 Hub Membership (Future)" over an offer of
                "exclusive meetings, announcements, and discounts at partner
                businesses", with a Join button that opened an alert saying
                subscriptions would arrive in a later release.

                Two things wrong with that. `POST /organizations/{id}/members`
                has been served since the module shipped. And what the card
                described is not what membership here *is*: belonging to a
                community body under a policy that body sets, not a paid tier
                with partner discounts — something Diaspora does not have and
                has never been building.

                Everything below is the organisation's own answer, arriving on
                the response and never inferred: `membershipPolicy` decides the
                wording, `acceptsMembership` decides whether the door is open at
                all, and `viewerMembershipStatus` says where the reader stands.
              */}
              {membership.isVisible ? (
                <View className="bg-primary-50 border border-primary-200 rounded-3xl p-5 mt-2">
                  <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">
                    {membership.heading}
                  </Text>
                  <Text className="text-[11px] text-content-muted font-semibold mt-1 leading-relaxed">
                    {membership.body}
                  </Text>

                  {org.membershipRequirements?.trim() ? (
                    <Text className="text-[11px] text-content-secondary font-semibold mt-2 leading-relaxed">
                      {org.membershipRequirements.trim()}
                    </Text>
                  ) : null}

                  {/*
                    **The other membership, and the one the old card described.**

                    A priced *programme* with tiers, benefits and renewals is a
                    separate thing from belonging to the body, and this platform
                    has both. The card conflated them: it promised the
                    programme's benefits and offered neither.

                    Shown only where an organisation actually has one — most do
                    not, and `GET /communities/{id}/membership` answers 404 for
                    those, which is why nothing is claimed on an error.
                  */}
                  {programme ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="See this organisation's membership plans"
                      onPress={() => router.push(`/community-life/membership/${id}` as never)}
                      className="border border-primary-200 rounded-full py-3 items-center mt-3"
                    >
                      <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
                        See membership plans
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {membership.action ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={membership.action}
                      accessibilityState={{ busy: isJoining }}
                      disabled={isJoining}
                      onPress={membership.onPress}
                      className={`rounded-full py-3 items-center mt-4 ${
                        membership.isLeaving ? 'border border-primary-200' : 'bg-primary-500'
                      }`}
                    >
                      {isJoining ? (
                        <ActivityIndicator
                          size="small"
                          color={membership.isLeaving ? tokens.color.primary[500] : '#FFFFFF'}
                        />
                      ) : (
                        <Text
                          className={`text-[10px] font-black uppercase tracking-widest ${
                            membership.isLeaving ? 'text-primary-500' : 'text-white'
                          }`}
                        >
                          {membership.action}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {/* EVENTS TAB */}
          {activeTab === 'Events' && (
            <View>
              {associatedData.events.length > 0 ? (
                associatedData.events.map((evt) => (
                  <TouchableOpacity
                    key={evt.eventId}
                    onPress={() => router.push(`/community-life/event/${evt.eventId}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                  >
                    <View className="flex-1 mr-2">
                      {/* Four more fields the route does not serve. It sends
                        * `eventId`, `categoryKey`, `startsAt` and a `location`
                        * whose readable form is `displayName` — the card read
                        * `id`, `category`, `date` and `location.areaName`, so
                        * the category and date rendered blank and the row
                        * navigated to `/community-life/event/undefined`. */}
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{evt.categoryKey}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5">{evt.title}</Text>
                      <Text className="text-xs text-content-muted font-bold mt-1">
                        🗓 {eventWhen(evt.startsAt)}
                        {evt.venueName || evt.location?.displayName
                          ? ` · ${evt.venueName ?? evt.location?.displayName}`
                          : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No upcoming events hosted by this organization.</Text>
              )}
            </View>
          )}

          {/* UPDATES TAB
            *
            * `associatedData.updates` is always empty, and deliberately so.
            * Community updates have no organisation link anywhere on the
            * platform: no route filters them by organisation and no field on
            * `OrganizationResponse` carries them. The previous version matched
            * mock updates whose title contained the first word of the
            * organisation's name and presented the result as this
            * organisation's posts.
            *
            * The empty state now says what is true rather than what a keyword
            * match produced. */}
          {activeTab === 'Updates' && (
            <View>
              <Text className="text-xs text-content-muted italic py-8 text-center">
                Diaspora cannot yet show which community updates came from an organisation.
              </Text>
            </View>
          )}

          {/* GUIDES TAB */}
          {activeTab === 'Guides' && (
            <View>
              {/* `GuideReferenceResponse` carries `guideId`, `title` and `slug`
                * — and no author. The previous version passed
                * `mockAuthors[item.authorId]` into `GuideCard`, which is a
                * fabricated byline on somebody else's guide. A reference row
                * renders what the reference has and links to the guide, where
                * the real author is served. */}
              {associatedData.guides.length > 0 ? (
                associatedData.guides.map((item: any) => (
                  <TouchableOpacity
                    key={item.guideId}
                    onPress={() => router.push(`/guide/${item.guideId}` as never)}
                    className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2 flex-row items-center"
                  >
                    <Ionicons name="book-outline" size={18} color={tokens.color.text.secondary} />
                    <Text className="text-[13px] font-bold text-content-strong ml-3 flex-1">
                      {item.title ?? 'Untitled guide'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No guides published by this organization.</Text>
              )}
            </View>
          )}

          {/* RELATED PROVIDERS TAB
            *
            * Was `mockListings.filter(l => l.category.name === 'catering' || …)`
            * — the same three listings on every organisation on the platform,
            * presented as businesses it recommends.
            *
            * `OrganizationResponse.services` is the organisation's own list of
            * what it offers. It is what this tab can honestly show, and it is
            * rendered as text because a service is a description, not a
            * marketplace listing with a rating and a distance. */}
          {activeTab === 'Providers' && (
            <View>
              {associatedData.providers.length > 0 ? (
                <>
                  <Text className="text-[10px] font-bold text-content-muted uppercase mb-3.5">
                    What this organisation offers:
                  </Text>
                  {associatedData.providers.map((service: any, idx: number) => (
                    <View
                      key={idx}
                      className="bg-surface-card border border-subtle rounded-2xl p-4 mb-2"
                    >
                      <Text className="text-[13px] font-bold text-content-strong">
                        {typeof service === 'string' ? service : (service?.name ?? service?.label ?? 'Service')}
                      </Text>
                      {typeof service !== 'string' && service?.description ? (
                        <Text className="text-[11px] text-content-muted mt-1">{service.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">
                  This organisation has not listed any services.
                </Text>
              )}
            </View>
          )}

          {/* GALLERY TAB */}
          {activeTab === 'Gallery' && (
            <View className="flex-row flex-wrap gap-3 justify-between">
              {/* `org.gallery` does not exist either — the route calls it
                * `media`, and sends `{ mediaId, role, order, caption }` rather
                * than a URL. This one was guarded, so instead of crashing it
                * showed "no photos" for every organisation, including ones that
                * had published some. `galleryUris` reads the right field and
                * builds the address the platform serves the bytes from. */}
              {galleryUris.length > 0 ? (
                galleryUris.map((img: string, idx: number) => (
                  <Image
                    key={idx}
                    source={{ uri: img }}
                    style={{ width: '48%', height: 110, borderRadius: 16 }}
                    contentFit="cover"
                  />
                ))
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center w-full">No gallery photos uploaded yet.</Text>
              )}
            </View>
          )}

          {/* ── Reporting an organisation ─────────────────────────────────
              BG-02 claimed `CommunityContentType.Organization` with an
              `OrganizationContentSource` in a previous phase, and `ReportModal`
              has mapped it ever since — but **no screen ever passed the
              subject**, so the capability was real, the mapping was right, and
              a member could not reach it. Found by walking this screen.

              An organisation page is where dues, donations and ticket money are
              collected; a page impersonating a real association was reportable
              only by reporting one of its posts.

              The identifier is `organizationId`, not `id` — this screen reads
              `GET /community-life/organizations/{id}`. Only the event and update
              lists further up are fixtures. */}
          {/* An administrator removes the organisation; nobody reports their own
              (13 Oct 2026). */}
          {canManage ? (
            <OwnerRemoveButton
              noun="organisation"
              onRemove={() => deleteOrganization(org.organizationId)}
            />
          ) : (
            <TouchableOpacity
              onPress={() => setIsReportOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Report ${org.name}`}
              className="flex-row items-center justify-center py-4 mt-2"
            >
              <Ionicons name="flag-outline" size={14} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold ml-2"
              >
                Report this organisation
              </Text>
            </TouchableOpacity>
          )}

        </View>
      </ScrollEndScrollView>

      <ReportModal
        visible={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        contentType="Organization"
        contentId={org?.organizationId ?? id}
      />

      {/* Contact Sticky Bottom Bar */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          backgroundColor: tokens.color.surface.card,
          borderTopWidth: 1,
          borderTopColor: tokens.color.neutral[200],
          paddingTop: 16,
          paddingBottom: isBottomNavVisible ? 16 : 16 + insets.bottom,
          paddingHorizontal: 24,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          zIndex: 999,
        }}
      >
        {org.contact?.phone ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${org.contact?.phone}`)}
            className="flex-1 border border-subtle py-3.5 rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Text className="text-xs font-extrabold text-content-secondary">📞 Call</Text>
          </TouchableOpacity>
        ) : null}
        {canMessage ? (
        <TouchableOpacity
          onPress={async () => {
            // **The owner, not the organisation.** An organisation is not a user and cannot be
            // the other party in a conversation; the platform used to accept its identifier here
            // and store a conversation nothing could deliver to, which then rendered as
            // "Unknown". It refuses that now, so this addresses the person who runs it.
            if (!org?.ownerUserId) {
              // Every organisation is created with an owner, so this means something is wrong
              // rather than something ordinary. Saying so beats a button that does nothing.
              showAlert({
                type: 'info',
                title: 'No one to message',
                message:
                  'This organisation has nobody listed to receive messages. Try its contact details above.',
              });
              return;
            }

            await ConversationHub.openOrCreateConversation({
              recipientId: org.ownerUserId,
              recipientName: org.name,
              contextType: 'Organization',
              entityId: id,
              entityTitle: org.name,
              entitySubtitle: org.organizationTypeName ?? org.organizationTypeKey,
              entityImageUrl: mediaUri(org.logoMediaId),
              entityStatus: 'Active',
              deepLink: `/community-life/org/${id}`,
              campaignSource: 'org_profile',
            });
          }}
          className="flex-row items-center justify-center py-3.5 rounded-2xl active:opacity-90"
          style={{ flex: 2, backgroundColor: '#F59300' }}
        >
          <Text className="text-white font-black text-xs">💬 Message Hub</Text>
        </TouchableOpacity>
        ) : null}
        {org.contact?.website ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(org.contact?.website ?? '')}
            className="w-12 h-12 border border-subtle rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Ionicons name="globe-outline" size={18} color={tokens.color.text.secondary} />
          </TouchableOpacity>
        ) : null}
      </Animated.View>

    </SafeAreaView>
  );
}
