import React from 'react';
import { View, Text, TouchableOpacity, Share, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSavedStore } from '@/store/saved';
import type { MarketplaceListing } from '@/types/marketplace';
import { CommunityTrustBadge } from './CommunityTrustBadge';
// Remediation Wave E. A listing may now genuinely have no photograph — the swap
// composer never sends one and the development handler no longer substitutes a
// stock one — so the cover slot has to render the absence.
import { ListingPhoto } from './ListingPhoto';

interface MarketplaceCardProps {
  listing: MarketplaceListing;
  variant?: 'list' | 'featured' | 'grid';
}

export function MarketplaceCard({ listing, variant = 'list' }: MarketplaceCardProps) {
  const {
    id,
    title,
    price,
    currency,
    negotiable,
    condition,
    intent,
    location,
    seller,
    coverImage,
    createdAt,
    deliveryAvailable,
    pickupOnly
  } = listing;

  const { save, unsave, isSaved } = useSavedStore();
  const saved = isSaved(id);

  const handlePress = () => {
    router.push(`/marketplace/${id}`);
  };

  const handleSaveToggle = (e: any) => {
    e.stopPropagation();
    if (saved) {
      unsave(id);
    } else {
      save(id, 'Marketplace');
    }
  };

  const handleShare = (e: any) => {
    e.stopPropagation();
    const priceText = price === 0 ? 'FREE' : `${getCurrencySymbol()}${price}`;
    Share.share({
      message: `Check out this listing on Diaspora: "${title}" - ${priceText} in ${location.areaName}, ${location.cityName}! Proximity: ${formattedDistance()}`,
    });
  };

  const getCurrencySymbol = () => {
    switch (currency) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'NGN': return '₦';
      case 'GHS': return '₵';
      case 'MUR': return 'Rs ';
      default: return `${currency} `;
    }
  };

  const formattedDistance = () => {
    if (location.distanceKm == null) return '';
    return location.distanceKm < 1
      ? `${(location.distanceKm * 1000).toFixed(0)}m away`
      : `${location.distanceKm.toFixed(1)}km away`;
  };

  const getIntentStyles = () => {
    switch (intent) {
      case 'Selling':
        return { bg: 'bg-amber-100 border border-amber-200', text: 'text-amber-800', label: 'For Sale' };
      case 'Buying Request':
        return { bg: 'bg-blue-100 border border-blue-200', text: 'text-blue-800', label: 'Buying' };
      case 'Giving Away':
        return { bg: 'bg-green-100 border border-green-200', text: 'text-green-800', label: 'Free' };
      case 'Exchange / Swap':
        return { bg: 'bg-purple-100 border border-purple-200', text: 'text-purple-800', label: 'Swap' };
      case 'Wanted':
        return { bg: 'bg-red-100 border border-red-200', text: 'text-red-800', label: 'Wanted' };
      case 'Donation':
        return { bg: 'bg-teal-100 border border-teal-200', text: 'text-teal-800', label: 'Donation' };
      default:
        return { bg: 'bg-surface-muted border border-subtle', text: 'text-content-strong', label: intent };
    }
  };

  const intentStyle = getIntentStyles();

  // Grid variant layout
  if (variant === 'grid') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="w-[48%] bg-surface-card rounded-2xl overflow-hidden mb-4 border border-subtle"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}
      >
        <View className="relative">
          <ListingPhoto uri={coverImage} style={{ width: '100%', height: 120 }} />
          {/* Cover float badges */}
          <View className="absolute top-2 left-2 right-2 flex-row justify-between items-center">
            <View className={`${intentStyle.bg} px-1.5 py-0.5 rounded`}>
              <Text className={`text-[8px] font-extrabold uppercase ${intentStyle.text}`}>{intentStyle.label}</Text>
            </View>
            <TouchableOpacity onPress={handleSaveToggle} className="w-6 h-6 rounded-full bg-surface-card/90 backdrop-blur items-center justify-center border border-faint">
              <Text className="text-xs">{saved ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="p-2.5">
          <Text className="text-xs text-content-faint font-extrabold uppercase tracking-wide mb-0.5">
            {condition} · {location.areaName}
          </Text>

          <Text className="text-sm font-bold text-content-primary leading-tight mb-1 h-8" numberOfLines={2}>
            {title}
          </Text>

          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-sm text-content-muted font-bold">{formattedDistance() || 'Nearby'}</Text>
            <Text className="text-sm font-black text-primary-500">
              {price === 0 ? 'FREE' : `${getCurrencySymbol()}${price}`}
            </Text>
          </View>

          <View className="border-t border-faint pt-1.5">
            <CommunityTrustBadge profile={seller} limit={1} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Featured variant layout
  if (variant === 'featured') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        className="w-[260px] bg-surface-card rounded-2xl overflow-hidden mr-4 border border-subtle"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        <View className="relative">
          <ListingPhoto uri={coverImage} style={{ width: '100%', height: 130 }} />
          <View className="absolute top-2 left-2 right-2 flex-row justify-between items-center">
            <View className={`${intentStyle.bg} px-2 py-0.5 rounded`}>
              <Text className={`text-[8px] font-extrabold uppercase ${intentStyle.text}`}>{intentStyle.label}</Text>
            </View>
            <TouchableOpacity onPress={handleSaveToggle} className="w-7 h-7 rounded-full bg-surface-card/90 backdrop-blur items-center justify-center border border-faint">
              <Text className="text-xs">{saved ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="p-3">
          <Text className="text-xs text-content-muted font-bold uppercase mb-1">
            📍 {location.areaName} {formattedDistance() ? `· ${formattedDistance()}` : ''}
          </Text>

          <Text className="text-base font-extrabold text-content-primary leading-snug mb-2 h-9" numberOfLines={2}>
            {title}
          </Text>

          <View className="flex-row justify-between items-center border-t border-faint pt-2 flex-wrap gap-1">
            <Text className="text-base font-black text-primary-500">
              {price === 0 ? 'FREE' : `${getCurrencySymbol()}${price}`}
              {negotiable && price > 0 && <Text className="text-[9px] font-bold text-success-default"> (OBO)</Text>}
            </Text>
            <CommunityTrustBadge profile={seller} limit={1} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Standard List variant layout
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className="bg-surface-card rounded-2xl border border-subtle overflow-hidden mb-3.5 flex-row p-4 shadow-sm"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="relative">
        {/* The narrowest slot in the app. A label would wrap to three lines at
            115 px, so the icon carries it alone and the accessible name still
            says what is missing. */}
        <ListingPhoto
          uri={coverImage}
          style={{ width: 115, height: 115, borderRadius: 12 }}
          showLabel={false}
        />
        <View className="absolute top-1.5 left-1.5">
          <View className={`${intentStyle.bg} px-1.5 py-0.5 rounded`}>
            <Text className={`text-[8px] font-extrabold uppercase ${intentStyle.text}`}>{intentStyle.label}</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 ml-4 justify-between py-0.5">
        <View>
          <View className="flex-row justify-between items-start gap-1">
            <Text className="text-xs text-content-faint font-extrabold uppercase tracking-wide">
              {condition} · {location.areaName}
            </Text>
            <TouchableOpacity onPress={handleSaveToggle} className="p-0.5">
              <Text className="text-sm">{saved ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
          
          <Text className="text-lg font-extrabold text-content-primary leading-snug mb-1 mt-1" numberOfLines={2}>
            {title}
          </Text>
        </View>

        <View className="flex-row items-center justify-between border-t border-faint pt-3 flex-wrap gap-y-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-lg font-black text-primary-500">
              {price === 0 ? 'FREE' : `${getCurrencySymbol()}${price}`}
            </Text>
            {negotiable && price > 0 && (
              <View className="bg-success-surface px-1 py-0.2 rounded border border-green-150">
                <Text className="text-[8px] font-bold text-success-default uppercase">Nego</Text>
              </View>
            )}
            {formattedDistance() && (
              <Text className="text-sm text-content-muted font-bold">· {formattedDistance()}</Text>
            )}
          </View>

          <CommunityTrustBadge profile={seller} limit={1} />
        </View>
      </View>
    </TouchableOpacity>
  );
}
export default MarketplaceCard;
