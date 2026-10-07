import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DatePickerInputProps {
  label: string;
  value: string; // YYYY-MM-DD format
  onChangeDate: (date: string) => void;
  placeholder?: string;
  /** Earliest day that may be picked, YYYY-MM-DD. Earlier days are shown greyed and cannot be pressed. */
  minDate?: string;
  /** Latest day that may be picked, YYYY-MM-DD. A document's issue date passes today. */
  maxDate?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function DatePickerInput({ label, value, onChangeDate, placeholder = 'Select date...', minDate, maxDate }: DatePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  // Parse initial date value or default to today
  const initialDate = value ? new Date(value) : new Date();
  const [currentYear, setCurrentYear] = useState(isNaN(initialDate.getTime()) ? new Date().getFullYear() : initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(isNaN(initialDate.getTime()) ? new Date().getMonth() : initialDate.getMonth());

  // Sync internal view states when value changes externally
  useEffect(() => {
    const d = value ? new Date(value) : new Date();
    if (!isNaN(d.getTime())) {
      setCurrentYear(d.getFullYear());
      setCurrentMonth(d.getMonth());
    }
  }, [value]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const newDateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;
    onChangeDate(newDateStr);
    setModalVisible(false);
  };

  const openDatePicker = () => {
    const d = value ? new Date(value) : new Date();
    if (!isNaN(d.getTime())) {
      setCurrentYear(d.getFullYear());
      setCurrentMonth(d.getMonth());
    }
    setShowYearPicker(false);
    setShowMonthPicker(false);
    setModalVisible(true);
  };

  const renderCalendarDays = () => {
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const dayViews = [];

    // Empty spaces for first week offset
    for (let i = 0; i < firstDayIndex; i++) {
      dayViews.push(
        <View key={`empty-${i}`} style={{ width: '14.28%', height: 36 }} />
      );
    }

    // Days grid
    for (let day = 1; day <= totalDays; day++) {
      const isSelected = value && 
        new Date(value).getFullYear() === currentYear &&
        new Date(value).getMonth() === currentMonth &&
        new Date(value).getDate() === day;

      // YYYY-MM-DD strings compare correctly as strings, so no Date parsing
      // (and no time zone) is involved in deciding what is out of range.
      const iso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const outOfRange = (minDate !== undefined && iso < minDate) || (maxDate !== undefined && iso > maxDate);

      dayViews.push(
        <TouchableOpacity
          key={`day-${day}`}
          onPress={() => handleSelectDay(day)}
          disabled={outOfRange}
          accessibilityState={{ disabled: outOfRange, selected: Boolean(isSelected) }}
          style={{ width: '14.28%', height: 36 }}
          className={`items-center justify-center rounded-full ${
            isSelected ? 'bg-primary-500' : 'active:bg-surface-muted'
          }`}
        >
          <Text className={`text-xs font-bold ${
            isSelected ? 'text-white' : outOfRange ? 'text-content-faint opacity-40' : 'text-content-primary'
          }`}>
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return dayViews;
  };

  return (
    <View className="mb-4 w-full">
      <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">{label}</Text>
      
      <TouchableOpacity
        onPress={openDatePicker}
        activeOpacity={0.7}
        className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-4 h-14 active:bg-surface-muted"
      >
        <Text className={`text-sm font-semibold ${value ? 'text-content-strong' : 'text-content-faint'}`}>
          {value || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#F59300" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <View className="flex-1 bg-black/40 justify-center items-center px-6" style={Platform.OS === 'web' ? { zIndex: 9999 } : undefined}>
          <View className="bg-surface-card w-full max-w-[320px] rounded-3xl p-5 shadow-2xl">
            
            {/* Header row with interactive Month/Year links */}
            <View className="flex-row justify-between items-center mb-4 border-b border-faint pb-2">
              <TouchableOpacity onPress={prevMonth} className="p-2">
                <Text className="text-lg font-black text-content-faint">‹</Text>
              </TouchableOpacity>
              
              <View className="flex-row gap-2">
                <TouchableOpacity 
                  onPress={() => {
                    setShowMonthPicker(!showMonthPicker);
                    setShowYearPicker(false);
                  }}
                  className="flex-row items-center"
                >
                  <Text className={`text-sm font-black ${showMonthPicker ? 'text-primary-500' : 'text-content-primary'}`}>
                    {MONTHS[currentMonth].substring(0, 3)}
                  </Text>
                  <Text className="text-[10px] text-content-faint ml-1">▼</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => {
                    setShowYearPicker(!showYearPicker);
                    setShowMonthPicker(false);
                  }}
                  className="flex-row items-center"
                >
                  <Text className={`text-sm font-black ${showYearPicker ? 'text-primary-500' : 'text-content-primary'}`}>
                    {currentYear}
                  </Text>
                  <Text className="text-[10px] text-content-faint ml-1">▼</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={nextMonth} className="p-2">
                <Text className="text-lg font-black text-content-faint">›</Text>
              </TouchableOpacity>
            </View>

            {/* View A: Month Grid Picker */}
            {showMonthPicker && (
              <View className="flex-row flex-wrap gap-2.5 justify-center py-2" style={{ height: 216 }}>
                {MONTHS.map((m, idx) => {
                  const isSelected = currentMonth === idx;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setCurrentMonth(idx);
                        setShowMonthPicker(false);
                      }}
                      style={{ width: '28%', height: 42 }}
                      className={`items-center justify-center rounded-xl border ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-content-secondary'}`}>
                        {m.substring(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* View B: Year List Picker */}
            {showYearPicker && (
              <View style={{ height: 216 }} className="py-1">
                <FlatList
                  data={Array.from({ length: 111 }, (_, i) => 2040 - i)} // 1930 to 2040
                  keyExtractor={(item) => String(item)}
                  initialScrollIndex={Math.max(0, Math.min(110, 2040 - currentYear))}
                  getItemLayout={(data, index) => ({ length: 44, offset: 44 * index, index })}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = currentYear === item;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          setCurrentYear(item);
                          setShowYearPicker(false);
                        }}
                        className={`py-2.5 items-center justify-center border-b border-faint ${
                          isSelected ? 'bg-primary-50' : 'active:bg-surface-background'
                        }`}
                      >
                        <Text className={`text-sm ${isSelected ? 'font-black text-primary-500' : 'font-bold text-content-secondary'}`}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}

            {/* View C: Standard Days Calendar Grid */}
            {!showYearPicker && !showMonthPicker && (
              <>
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
              </>
            )}

            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              className="mt-5 py-3 bg-surface-muted rounded-2xl items-center"
            >
              <Text className="text-xs font-extrabold text-content-muted uppercase tracking-wide">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
