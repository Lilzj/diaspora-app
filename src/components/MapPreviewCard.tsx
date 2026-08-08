import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Circle, Line, Path, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { PlatformLocation } from '@/store/location';
import { DistanceBadge } from './DistanceBadge';

interface MapPin {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  priceText?: string;
  rating?: number;
}

interface MapPreviewCardProps {
  center: PlatformLocation;
  pins: MapPin[];
  radiusKm: number;
}

export function MapPreviewCard({ center, pins, radiusKm }: MapPreviewCardProps) {
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  // SVG Dimension Constants
  const width = 320;
  const height = 240;
  const cx = width / 2;
  const cy = height / 2;

  // Convert lat/lon relative to center into SVG pixel offsets
  // Mauritius is roughly at lat -20, lon 57. London at lat 51, lon 0.
  // We can scale offset based on standard coordinate differences, using a factor.
  // 1 km is roughly 0.009 degrees of latitude/longitude.
  const degPerKm = 0.009;
  const scale = radiusKm > 0 ? Math.min(80 / (radiusKm * degPerKm), 2500) : 1000;

  const mappedPins = pins.map((pin) => {
    const dx = (pin.longitude - center.longitude) * scale;
    const dy = -(pin.latitude - center.latitude) * scale; // invert Y for screen coords

    // Constrain to SVG dimensions
    const px = Math.min(Math.max(cx + dx, 15), width - 15);
    const py = Math.min(Math.max(cy + dy, 15), height - 15);

    return {
      ...pin,
      px,
      py,
    };
  });

  return (
    <View
      className="bg-white rounded-3xl overflow-hidden border border-neutral-200 mb-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
      }}
    >
      {/* Map Graphic Panel */}
      <View className="relative bg-sky-50 h-[240px] items-center justify-center">
        {/* SVG Styled Map Grid */}
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute' }}>
          {/* Radial grid lines for radius indicator */}
          <Circle cx={cx} cy={cy} r={35} fill="none" stroke="#DBEAFE" strokeWidth={1} strokeDasharray="3,3" />
          <Circle cx={cx} cy={cy} r={75} fill="none" stroke="#DBEAFE" strokeWidth={1} strokeDasharray="3,3" />
          <Circle cx={cx} cy={cy} r={115} fill="none" stroke="#DBEAFE" strokeWidth={1} strokeDasharray="3,3" />
          
          {/* Mock Road/Grid Patterns */}
          <Path d={`M 0,${cy} L ${width},${cy}`} stroke="#FFF" strokeWidth={5} opacity={0.6} />
          <Path d={`M ${cx},0 L ${cx},${height}`} stroke="#FFF" strokeWidth={5} opacity={0.6} />
          <Path d="M 40,0 L 40,240 M 280,0 L 280,240" stroke="#FFF" strokeWidth={3} opacity={0.4} />
          <Path d="M 0,60 L 320,60 M 0,180 L 320,180" stroke="#FFF" strokeWidth={3} opacity={0.4} />

          {/* Center Pulsing GPS Ring */}
          <Circle cx={cx} cy={cy} r={12} fill="#FF6B00" opacity={0.15} />
          <Circle cx={cx} cy={cy} r={6} fill="#FF6B00" stroke="#FFF" strokeWidth={1.5} />
        </Svg>

        {/* Dynamic Pins */}
        {mappedPins.map((pin) => {
          const isSelected = selectedPin?.id === pin.id;
          return (
            <TouchableOpacity
              key={pin.id}
              onPress={() => setSelectedPin(pin)}
              style={{
                position: 'absolute',
                left: pin.px - 14,
                top: pin.py - 28,
                zIndex: isSelected ? 10 : 2,
              }}
            >
              <View className="items-center">
                <View
                  className={`px-2 py-0.5 rounded-full border shadow-sm ${
                    isSelected ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-300'
                  }`}
                >
                  <Text
                    className={`text-[8px] font-black ${
                      isSelected ? 'text-white' : 'text-neutral-800'
                    }`}
                  >
                    {pin.priceText || pin.category}
                  </Text>
                </View>
                <Ionicons
                  name="pin"
                  size={18}
                  color={isSelected ? '#FF6B00' : '#4B5563'}
                  style={{ marginTop: -3 }}
                />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Mapped Area Label */}
        <View className="absolute top-3 left-3 bg-black/60 px-3 py-1.5 rounded-full">
          <Text className="text-[10px] font-black text-white uppercase tracking-wider">
            📍 Radius: {radiusKm > 0 ? `${radiusKm} km` : 'City'}
          </Text>
        </View>
      </View>

      {/* Selected Item Drawer */}
      {selectedPin ? (
        <View className="p-4 border-t border-neutral-100 bg-white">
          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">
                {selectedPin.category}
              </Text>
              <Text className="text-sm font-black text-neutral-900 leading-snug mt-0.5" numberOfLines={1}>
                {selectedPin.title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedPin(null)}
              className="p-1 bg-neutral-100 rounded-full"
            >
              <Ionicons name="close" size={14} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center justify-between mt-2 flex-wrap gap-2">
            <View className="flex-row items-center gap-1.5">
              <DistanceBadge distanceKm={selectedPin.distanceKm} showCommuteTime={true} />
              {selectedPin.rating && (
                <Text className="text-xs font-bold text-warning-default">★ {selectedPin.rating.toFixed(1)}</Text>
              )}
            </View>
            {selectedPin.priceText && (
              <Text className="text-base font-black text-primary-500">{selectedPin.priceText}</Text>
            )}
          </View>
        </View>
      ) : (
        <View className="p-4 items-center justify-center border-t border-neutral-100">
          <Text className="text-xs font-bold text-neutral-400">
            {pins.length > 0
              ? `Showing ${pins.length} active pins. Tap a pin to view details.`
              : 'No search results found on this map range.'}
          </Text>
        </View>
      )}
    </View>
  );
}
export default MapPreviewCard;
