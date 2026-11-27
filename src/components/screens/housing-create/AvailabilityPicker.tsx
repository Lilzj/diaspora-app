// List a home: the calendar the availability date is picked from.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { Modal, View, Platform, TouchableOpacity, Text } from 'react-native';
import type {
  AvailabilityCalendar,
} from '@/components/screens/housing-create/useAvailabilityCalendar';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';

interface AvailabilityPickerProps {
  calendar: AvailabilityCalendar;
  pricing: HousingPricing;
}

export function AvailabilityPicker({ calendar, pricing }: AvailabilityPickerProps) {
  const {
    calendarVisible, setCalendarVisible, calendarMonth, setCalendarMonth, calendarYear,
    setCalendarYear,
  } = calendar;
  const { availabilityDate, setAvailabilityDate } = pricing;

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleDaySelect = (day: number) => {
    const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    setAvailabilityDate(`${calendarYear}-${formattedMonth}-${formattedDay}`);
    setCalendarVisible(false);
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const renderCalendarDays = () => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    
    const dayCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      dayCells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 40 }} />);
    }
    
    for (let day = 1; day <= totalDays; day++) {
      const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      const dateStr = `${calendarYear}-${formattedMonth}-${formattedDay}`;
      const isSelected = availabilityDate === dateStr;

      dayCells.push(
        <TouchableOpacity
          key={`day-${day}`}
          onPress={() => handleDaySelect(day)}
          style={{ width: '14.28%', height: 40 }}
          className={`items-center justify-center rounded-full ${
            isSelected ? 'bg-primary-500' : 'active:bg-surface-muted'
          }`}
        >
          <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-strong'}`}>
            {day}
          </Text>
        </TouchableOpacity>
      );
    }
    return dayCells;
  };

  return (
    <Modal
      visible={calendarVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setCalendarVisible(false)}
    
      statusBarTranslucent
      navigationBarTranslucent>
      <View className="flex-1 bg-black/40 justify-center items-center px-6" style={Platform.OS === 'web' ? { zIndex: 9999 } : undefined}>
        <View className="bg-surface-card w-full max-w-[320px] rounded-3xl p-5 shadow-2xl">
          {/* Header row */}
          <View className="flex-row justify-between items-center mb-4 border-b border-faint pb-2">
            <TouchableOpacity onPress={prevMonth} className="p-2">
              <Text className="text-lg font-black text-content-muted">‹</Text>
            </TouchableOpacity>
            <Text className="text-sm font-extrabold text-content-primary">
              {monthsList[calendarMonth]} {calendarYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} className="p-2">
              <Text className="text-lg font-black text-content-muted">›</Text>
            </TouchableOpacity>
          </View>

          {/* Days of the week row */}
          <View className="flex-row justify-between mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <View key={d} style={{ width: '14.28%' }} className="items-center">
                <Text className="text-[10px] font-black text-content-faint uppercase">{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Days Grid */}
          <View className="flex-row flex-wrap">
            {renderCalendarDays()}
          </View>

          <TouchableOpacity
            onPress={() => setCalendarVisible(false)}
            className="mt-6 py-3 bg-surface-muted rounded-2xl items-center"
          >
            <Text className="text-xs font-bold text-content-muted">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
