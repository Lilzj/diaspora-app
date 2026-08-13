import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { apiClient } from '@/lib/apiClient';
import { useSavedStore } from '@/store/saved';
import { mockEvents } from '@/mocks/community-life-data';
import { mockCommunityUpdates, mockGuides, mockAuthors } from '@/mocks/community-data';
import { mockListings } from '@/mocks/data';
import { UpdateCard } from '@/components/UpdateCard';
import { GuideCard } from '@/components/GuideCard';
import { ProviderCard } from '@/components/ProviderCard';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ConversationHub } from '@/lib/conversation-hub';

export default function OrgProfileScreen() {
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [activeTab, setActiveTab] = useState<'About' | 'Events' | 'Updates' | 'Guides' | 'Providers' | 'Gallery'>('About');

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
        <Text className="text-xs font-bold text-neutral-450 mt-4 uppercase tracking-widest">Loading Community Hub...</Text>
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
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text className="text-sm font-black text-neutral-850 uppercase tracking-widest">Community Hub</Text>
        <TouchableOpacity
          onPress={handleFollowToggle}
          className={`px-4 py-2 rounded-full border ${
            isFollowing ? 'bg-surface-background border-subtle' : 'bg-primary-500 border-primary-500'
          }`}
        >
          <Text className={`text-[10px] font-black uppercase ${isFollowing ? 'text-neutral-550' : 'text-white'}`}>
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
        
        {/* Cover Photo */}
        <View className="h-44 bg-neutral-200 relative">
          <Image
            source={{ uri: org.coverImage }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
          {/* Logo overlay */}
          <View className="absolute bottom-[-30px] left-6 w-20 h-20 rounded-3xl bg-surface-card p-1 border border-subtle shadow overflow-hidden">
            <Image
              source={{ uri: org.logo }}
              style={{ width: '100%', height: '100%', borderRadius: 20 }}
              contentFit="cover"
            />
          </View>
        </View>

        {/* Title, Category & Verification */}
        <View className="bg-surface-card px-6 pt-12 pb-5 border-b border-faint mb-3">
          <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
            <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest bg-primary-50 px-2 py-0.5 rounded">
              {org.category}
            </Text>
            {org.isVerified && (
              <View className="bg-success-surface px-2.5 py-0.5 rounded flex-row items-center border border-[#A3EBDB]">
                <Ionicons name="checkmark-circle" size={10} color="#10B981" className="mr-0.5" />
                <Text className="text-[8px] font-black text-success-default uppercase">Verified Hub</Text>
              </View>
            )}
          </View>

          <Text className="text-xl font-black text-content-primary leading-snug">{org.name}</Text>
          <Text className="text-xs text-neutral-450 mt-1 font-bold">📍 {org.location.addressLine}</Text>

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

        {/* Community Reputation Indicator */}
        <View className="bg-surface-card px-6 py-5 border-b border-faint mb-3">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3.5">Community Reputation</Text>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Ionicons name="star" size={16} color="#F59E0B" className="mr-1" />
              <Text className="text-sm font-black text-content-primary">{org.rating || 4.7}</Text>
              <Text className="text-xs text-content-faint font-bold"> / 5.0 rating</Text>
            </View>
            <Text className="text-[10px] font-black text-success-default bg-success-surface px-2 py-0.5 rounded uppercase">
              {org.reputationLevel || 'Highly Trusted'}
            </Text>
          </View>
          {/* Progress bar */}
          <View className="h-2 bg-surface-muted rounded-full w-full overflow-hidden">
            <View className="h-full bg-success-default" style={{ width: `${((org.rating || 4.7) / 5) * 100}%` }} />
          </View>
        </View>

        {/* Tab Row Navigation */}
        <View className="bg-surface-card border-b border-neutral-150 flex-row px-4 justify-between mb-3">
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
                <Text className="text-sm text-neutral-750 font-semibold leading-relaxed italic">
                  "{org.mission}"
                </Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">About Us</Text>
                <Text className="text-sm text-neutral-750 font-semibold leading-relaxed">
                  {org.description}
                </Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Opening Hours</Text>
                <View className="bg-surface-card border border-subtle rounded-2xl p-4 gap-2 shadow-sm">
                  {org.openingHours.map((oh: any, idx: number) => (
                    <View key={idx} className="flex-row justify-between py-1 border-b border-neutral-50 last:border-0">
                      <Text className="text-xs font-bold text-content-secondary">{oh.day}</Text>
                      <Text className="text-xs text-content-muted font-semibold">{oh.hours}</Text>
                    </View>
                  ))}
                </View>
              </View>

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
                          <Text className="text-[9px] text-neutral-450 font-bold mt-0.5">{leader.role}</Text>
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
                      <Text className="text-xs text-neutral-450 font-bold mt-1">🗓 {evt.date} · {evt.location.areaName}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-xs text-neutral-450 italic py-8 text-center">No upcoming events hosted by this organization.</Text>
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
                <Text className="text-xs text-neutral-450 italic py-8 text-center">No recent community updates from this organization.</Text>
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
                <Text className="text-xs text-neutral-450 italic py-8 text-center">No guides published by this organization.</Text>
              )}
            </View>
          )}

          {/* RELATED PROVIDERS TAB */}
          {activeTab === 'Providers' && (
            <View>
              <Text className="text-[10px] font-bold text-neutral-450 uppercase mb-3.5">Recommends local businesses & service providers:</Text>
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
                <Text className="text-xs text-neutral-450 italic py-8 text-center">No recommended service providers linked.</Text>
              )}
            </View>
          )}

          {/* GALLERY TAB */}
          {activeTab === 'Gallery' && (
            <View className="flex-row flex-wrap gap-3 justify-between">
              {org.gallery && org.gallery.length > 0 ? (
                org.gallery.map((img: string, idx: number) => (
                  <Image
                    key={idx}
                    source={{ uri: img }}
                    style={{ width: '48%', height: 110, borderRadius: 16 }}
                    contentFit="cover"
                  />
                ))
              ) : (
                <Text className="text-xs text-neutral-450 italic py-8 text-center w-full">No gallery photos uploaded yet.</Text>
              )}
            </View>
          )}

        </View>
      </ScrollEndScrollView>

      {/* Contact Sticky Bottom Bar */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
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
              entitySubtitle: org.category,
              entityImageUrl: org.logo,
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
            <Ionicons name="globe-outline" size={18} color="#4B5563" />
          </TouchableOpacity>
        )}
      </Animated.View>

    </SafeAreaView>
  );
}
