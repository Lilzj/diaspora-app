import React from 'react';
import { View, Text, TouchableOpacity, Share, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import type { HousingListing } from '@/types/housing';
import { asHousingCardListing, type HousingCardWire } from '@/lib/housing-cards';
import { placeOf } from '@/lib/listing-place';
import { CommunityTrustBadge } from './CommunityTrustBadge';
// Remediation Wave E. A listing may now genuinely have no photograph — the
// development handler no longer substitutes a stock one — so the cover slot has
// to render the absence rather than an empty `<Image>`.
import { ListingPhoto } from './ListingPhoto';

interface HousingCardProps {
  /** A mapped home, or the raw row a list route sent — see `asHousingCardListing`. */
  listing: HousingListing | HousingCardWire;
  variant?: 'list' | 'featured';
}

export function HousingCard({ listing: given, variant = 'list' }: HousingCardProps) {
  const listing = asHousingCardListing(given);
  const { id, title, listingType, propertyType, rent, currency, location, bedrooms, bathrooms, furnished, host, availabilityDate, coverImage, lifestyleMatches } = listing;
  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(id);

  const handlePress = () => {
    router.push(`/housing/${id}`);
  };

  const handleSaveToggle = (e: any) => {
    e.stopPropagation();
    if (saved) {
      unsave(id);
    } else {
      save(id, 'Housing');
    }
  };

  const handleShare = (e: any) => {
    e.stopPropagation();
    Share.share({
      message: `Check out this housing option on Diaspora: "${title}" in ${placeLabel}! Rent: ${rentText()}.`,
    });
  };

  /** "month", "week", "night" — from the platform's period, month when it said none. */
  const periodWord = () => {
    switch (listing.rentPeriod) {
      case 'PerNight':
        return 'night';
      case 'PerWeek':
        return 'week';
      case 'PerYear':
        return 'year';
      default:
        return 'month';
    }
  };

  // An undisclosed rent is "Price on request", never a symbol followed by nothing.
  const rentText = () => (rent == null ? 'Price on request' : `${getCurrencySymbol()}${rent}/${periodWord()}`);

  const getCurrencySymbol = () => {
    return currency === 'GBP' ? '£' : currency === 'MUR' ? 'Rs ' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'NGN' ? '₦' : currency === 'GHS' ? '₵' : `${currency} `;
  };

  // `location` is `undefined` on rows from `/housing/search`, and reading
  // `location.distanceKm` through it threw during render. `placeOf` owns every
  // shape the three list routes send; see `lib/listing-place.ts`.
  const { label: placeLabel, distance: formattedDistance } = placeOf(listing as never);

  // Render a clean badge for lifestyle matching (limit to 2 key ones for listing card view)
  const renderCardBadges = () => {
    return lifestyleMatches.slice(0, 2).map((match, i) => {
      const parts = match.split(' ');
      const emoji = parts[0];
      const text = parts.slice(1).join(' ');
      return (
        <View key={i} className="bg-surface-background px-2 py-0.5 rounded border border-faint mr-1.5 flex-row items-center">
          <Text className="text-[10px] mr-1">{emoji}</Text>
          <Text className="text-[9px] font-bold text-content-muted uppercase">{text}</Text>
        </View>
      );
    });
  };

  if (variant === 'featured') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="w-[280px] bg-surface-card rounded-2xl overflow-hidden mr-4 border border-subtle"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View className="relative">
          <ListingPhoto uri={coverImage} style={{ width: '100%', height: 140 }} />
          {/* Top Row: Save heart & category */}
          <View className="absolute top-2 left-2 right-2 flex-row justify-between items-center">
            <View className="bg-surface-card/90 backdrop-blur px-2 py-0.5 rounded border border-faint">
              <Text className="text-[9px] font-extrabold text-content-strong uppercase">{listingType} · {propertyType}</Text>
            </View>
            <TouchableOpacity onPress={handleSaveToggle} className="w-8 h-8 rounded-full bg-surface-card/90 backdrop-blur items-center justify-center border border-faint">
              <Text className="text-sm">{saved ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="p-3">
          <Text className="text-base font-extrabold text-content-primary leading-snug mb-1" numberOfLines={2}>
            {title}
          </Text>

          <Text className="text-xs text-content-muted font-bold mb-2">
            📍 {placeLabel} {formattedDistance ? `· ${formattedDistance}` : ''}
          </Text>

          <View className="flex-row items-center gap-2 mb-3">
            <Text className="text-xs font-semibold text-content-muted">🛏️ {bedrooms} Bed</Text>
            <Text className="text-xs font-semibold text-content-muted">🚿 {bathrooms} Bath</Text>
            <Text className="text-xs font-semibold text-content-muted">🛋️ {furnished}</Text>
          </View>

          <View className="flex-row justify-between items-center border-t border-faint pt-2">
            <Text className="text-base font-black text-primary-500">{rentText()}</Text>
            <Text className="text-[10px] text-content-faint font-bold uppercase">{availabilityDate}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Standard List View Layout
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-4 shadow-sm"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="relative">
        <ListingPhoto uri={coverImage} style={{ width: '100%', height: 160 }} />
        {/* Floating elements on cover */}
        <View className="absolute top-3 left-3 right-3 flex-row justify-between items-center">
          <View className="flex-row gap-1.5">
            <View className="bg-black/50 px-2.5 py-0.5 rounded">
              <Text className="text-[9px] font-bold text-white uppercase">{listingType}</Text>
            </View>
            <View className="bg-black/50 px-2.5 py-0.5 rounded border border-white/10">
              <Text className="text-[9px] font-bold text-white uppercase">{propertyType}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSaveToggle}
            className="p-1.5 active:scale-95"
          >
            <Text className="text-lg">{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>

      </View>

      <View className="p-5">
        {/* Title & Availability Status */}
        <View className="flex-row justify-between items-start mb-3.5 gap-2">
          <Text className="text-lg font-extrabold text-content-primary leading-snug flex-1" numberOfLines={2}>
            {title}
          </Text>
          {availabilityDate === 'Available Now' && (
            <View className="bg-[#E8F7F4] border border-[#A3EBDB] px-2 py-0.5 rounded">
              <Text className="text-[8px] font-extrabold text-[#0D7C66] uppercase">● Available Now</Text>
            </View>
          )}
        </View>

        {/* Location & Host verification */}
        <View className="flex-row items-center justify-between mb-3.5">
          <Text className="text-sm text-content-muted font-semibold">
            📍 {placeLabel} {formattedDistance ? `· ${formattedDistance}` : ''}
          </Text>
          
          {/* `providerVerified` was the literal `true`, so every home — including
              one whose landlord nobody has verified — wore a "Verified Provider"
              badge. It showed on the first real card on 15 Sep 2026. Only what the
              platform says about the host is passed now. */}
          <CommunityTrustBadge
            profile={{
              isVerified: host.isVerified,
              reputationLevel: host.reputationLevel,
              yearsOnPlatform: host.yearsOnPlatform,
              responseTime: host.responseTime,
            }}
            limit={1}
          />
        </View>

        {/* Property meta layout (Beds, Baths, Furnished, Lifestyle match highlights) */}
        <View className="flex-row items-center justify-between border-t border-faint pt-3.5 mb-4">
          <View className="flex-row items-center gap-3">
            <Text className="text-sm text-content-muted font-semibold">🛏️ {bedrooms} Bed</Text>
            <Text className="text-sm text-content-muted font-semibold">🚿 {bathrooms} Bath</Text>
            <Text className="text-sm text-content-muted font-semibold">🛋️ {furnished}</Text>
          </View>

          {/* Lifestyle tags highlights */}
          <View className="flex-row">
            {renderCardBadges()}
          </View>
        </View>

        {/* Bottom pricing row & actions */}
        <View className="flex-row items-center justify-between border-t border-faint pt-4">
          <View>
            <Text className="text-xs text-content-faint font-bold uppercase tracking-wider">Rent</Text>
            <Text className="text-xl font-black text-primary-500 mt-0.5">
              {rentText()}
              {listing.billsIncluded && <Text className="text-[10px] font-bold text-success-default lowercase"> (inc. bills)</Text>}
            </Text>
          </View>

          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleShare}
              className="w-10 h-10 bg-surface-background border border-subtle rounded-xl items-center justify-center active:bg-surface-muted"
            >
              <Text className="text-sm">↗️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePress}
              className="bg-primary-500 px-4 py-2.5 rounded-xl justify-center items-center active:bg-primary-600"
            >
              <Text className="text-white font-extrabold text-sm">View Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
