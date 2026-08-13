import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { TutorialCategory } from '@/types/explore';

interface CategoryCardProps {
  category: TutorialCategory;
  onPress: () => void;
  isSelected?: boolean;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onPress,
  isSelected = false,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`rounded-3xl p-4 border transition-all ${
        isSelected
          ? 'bg-surface-card border-primary-500 shadow-lg shadow-neutral-200'
          : 'bg-surface-card border-subtle shadow-sm'
      }`}
      style={{
        flex: 1,
        minWidth: 140,
        margin: 4,
      }}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Category ${category.name}. ${category.description}`}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Icon Badge */}
      <View
        style={{ backgroundColor: category.color }}
        className="w-10 h-10 rounded-full justify-center items-center mb-3"
      >
        <Text className="text-xl">{category.icon}</Text>
      </View>

      {/* Title */}
      <Text className="text-xs font-black text-content-primary mb-1 leading-snug">
        {category.name}
      </Text>

      {/* Description */}
      <Text className="text-[10px] text-content-muted leading-normal" numberOfLines={2}>
        {category.description}
      </Text>
    </TouchableOpacity>
  );
};

export default CategoryCard;
