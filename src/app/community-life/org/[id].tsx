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
import { mockEvents } from '@/mocks/community-life-data';
import { mockCommunityUpdates, mockGuides, mockAuthors } from '@/mocks/community-data';
import { mockListings } from '@/mocks/data';
import { UpdateCard } from '@/components/UpdateCard';
import { GuideCard } from '@/components/GuideCard';
import { ProviderCard } from '@/components/ProviderCard';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ConversationHub } from '@/lib/conversation-hub';
import { useTheme } from '@/design-system';

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

  const [org, setOrg] = useState<any>(null);
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

  const { save, unsave, isSaved } = useSavedStore();
  const isFollowing = isSaved(id);

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

  const handleSocialLink = (url?: string) => {
    if (!url) {
      showAlert({ type: 'info', title: 'Unavailable', message: 'This organization has not linked this social channel.' });
      return;
    }
    Linking.openURL(url);
  };

  // Associated contents
  const associatedData = useMemo(() => {
    if (!org) return { events: [], updates: [], guides: [], providers: [] };

    // Events hosted by this org
    const events = mockEvents.filter(e => e.host.id === org.id);
    
    // Updates posted by members of this org (mocked by matching keywords)
    const updates = mockCommunityUpdates.filter(u => 
      u.title.toLowerCase().includes(org.name.toLowerCase().split(' ')[0]) ||
      u.description.toLowerCase().includes(org.name.toLowerCase().split(' ')[0])
    );

    // Guides matching org name keywords
    const guides = mockGuides.filter(g => 
      g.title.toLowerCase().includes(org.name.toLowerCase().split(' ')[0])
    );

    // Related providers linked to this organization
    const providers = mockListings.filter(l => 
      l.category.name.toLowerCase() === 'catering' || 
      l.category.name.toLowerCase() === 'legal services' ||
      l.title.toLowerCase().includes('african')
    ).slice(0, 3);

    return { events, updates, guides, providers };
  }, [org]);

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
        <TouchableOpacity onPress={() => router.back()} className="bg-primary-500 px-6 py-3 rounded-full mt-6">
          <Text className="text-white font-bold text-xs">Back to Directory</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      
      {/* Top Navbar */}
      <View className="bg-surface-card px-6 py-4 flex-row justify-between items-center border-b border-faint shadow-sm z-10">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-surface-background rounded-full items-center justify-center border border-subtle">
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
          <Text className="text-xs text-content-muted mt-1 font-bold">📍 {org.location.addressLine}</Text>

          {/* Social Links Row */}
          <View className="flex-row gap-3 mt-4 pt-3.5 border-t border-faint justify-start">
            <TouchableOpacity onPress={() => handleSocialLink(org.contact.facebook)} className="w-9 h-9 bg-surface-background rounded-xl items-center justify-center border border-subtle">
              <Ionicons name="logo-facebook" size={16} color="#3B5998" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSocialLink(org.contact.instagram)} className="w-9 h-9 bg-surface-background rounded-xl items-center justify-center border border-subtle">
              <Ionicons name="logo-instagram" size={16} color="#C13584" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSocialLink(org.contact.twitter)} className="w-9 h-9 bg-surface-background rounded-xl items-center justify-center border border-subtle">
              <Ionicons name="logo-twitter" size={16} color="#1DA1F2" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSocialLink(org.contact.youtube)} className="w-9 h-9 bg-surface-background rounded-xl items-center justify-center border border-subtle">
              <Ionicons name="logo-youtube" size={16} color="#FF0000" />
            </TouchableOpacity>
          </View>
        </View>

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
              {operatingHours.length > 0 && (
                <View>
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Opening Hours</Text>
                  <View className="bg-surface-card border border-subtle rounded-2xl p-4 gap-2 shadow-sm">
                    {operatingHours.map((oh: any, idx: number) => (
                      <View key={oh.id ?? idx} className="flex-row justify-between py-1 border-b border-faint last:border-0">
                        <Text className="text-xs font-bold text-content-secondary">{oh.day}</Text>
                        <Text className="text-xs text-content-muted font-semibold">{openingHoursLabel(oh)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

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

              {/* Future Membership details */}
              <View className="bg-primary-50 border border-primary-200 rounded-3xl p-5 mt-2 flex-row items-center">
                <View className="flex-1 mr-3">
                  <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">👑 Hub Membership (Future)</Text>
                  <Text className="text-[10px] text-content-muted font-semibold mt-1 leading-relaxed">
                    Join this hub to unlock access to exclusive meetings, announcements, and discounts at partner businesses.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => showAlert({ type: 'info', title: 'Coming Soon', message: 'Membership subscriptions will be active in the next release.' })}
                  className="bg-primary-500 px-4 py-2.5 rounded-full"
                >
                  <Text className="text-white font-black text-[10px]">JOIN</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* EVENTS TAB */}
          {activeTab === 'Events' && (
            <View>
              {associatedData.events.length > 0 ? (
                associatedData.events.map((evt) => (
                  <TouchableOpacity
                    key={evt.id}
                    onPress={() => router.push(`/community-life/event/${evt.id}`)}
                    className="bg-surface-card border border-subtle rounded-3xl p-4 mb-4 flex-row items-center shadow-sm"
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-[9px] font-black text-primary-500 uppercase">{evt.category}</Text>
                      <Text className="text-sm font-black text-content-primary mt-0.5">{evt.title}</Text>
                      <Text className="text-xs text-content-muted font-bold mt-1">🗓 {evt.date} · {evt.location.areaName}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No upcoming events hosted by this organization.</Text>
              )}
            </View>
          )}

          {/* UPDATES TAB */}
          {activeTab === 'Updates' && (
            <View>
              {associatedData.updates.length > 0 ? (
                associatedData.updates.map((update: any) => {
                  const author = mockAuthors[update.authorId];
                  return (
                    <UpdateCard
                      key={update.updateId}
                      update={{
                        ...update,
                        location: {
                          areaName: update.location.areaName,
                          cityName: update.location.cityName,
                          distanceKm: 1.5,
                        }
                      }}
                      author={author as any}
                    />
                  );
                })
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No recent community updates from this organization.</Text>
              )}
            </View>
          )}

          {/* GUIDES TAB */}
          {activeTab === 'Guides' && (
            <View>
              {associatedData.guides.length > 0 ? (
                associatedData.guides.map((item: any) => {
                  const author = mockAuthors[item.authorId];
                  return (
                    <GuideCard
                      key={item.guideId}
                      guide={item}
                      author={author as any}
                      variant="list"
                    />
                  );
                })
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No guides published by this organization.</Text>
              )}
            </View>
          )}

          {/* RELATED PROVIDERS TAB */}
          {activeTab === 'Providers' && (
            <View>
              <Text className="text-[10px] font-bold text-content-muted uppercase mb-3.5">Recommends local businesses & service providers:</Text>
              {associatedData.providers.length > 0 ? (
                associatedData.providers.map((item: any) => (
                  <ProviderCard
                    key={item.listingId}
                    listingId={item.listingId}
                    title={item.title}
                    category={item.category.name}
                    areaName={item.location.areaName}
                    distanceKm={item.location.distanceKm}
                    rating={item.rating.average}
                    reviewCount={item.rating.totalReviews}
                    coverImageUrl={item.coverImageUrl}
                    isVerified={item.verificationStatus === 'Verified'}
                    isOpenNow={item.isOpenNow}
                  />
                ))
              ) : (
                <Text className="text-xs text-content-muted italic py-8 text-center">No recommended service providers linked.</Text>
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

              `org.id` is a real identifier — this screen reads
              `GET /community-life/organizations/{id}`. Only the event and update
              lists further up are fixtures. */}
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

        </View>
      </ScrollEndScrollView>

      <ReportModal
        visible={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        contentType="Organization"
        contentId={org?.id ?? id}
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
        {org.contact.phone && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${org.contact.phone}`)}
            className="flex-1 border border-subtle py-3.5 rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Text className="text-xs font-extrabold text-content-secondary">📞 Call</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={async () => {
            if (!org?.id) return;
            await ConversationHub.openOrCreateConversation({
              recipientId: org.id,
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
        {org.contact.website && (
          <TouchableOpacity
            onPress={() => Linking.openURL(org.contact.website)}
            className="w-12 h-12 border border-subtle rounded-2xl items-center justify-center bg-surface-background active:bg-surface-muted"
          >
            <Ionicons name="globe-outline" size={18} color={tokens.color.text.secondary} />
          </TouchableOpacity>
        )}
      </Animated.View>

    </SafeAreaView>
  );
}
