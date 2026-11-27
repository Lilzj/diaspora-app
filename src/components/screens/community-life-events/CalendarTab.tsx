// Community Life: the Calendar tab.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { toDateString } from '@/utils/calendar-date';
import { ListState } from '@/components/ListState';
import { ListSkeleton } from '@/components/screens/community-life-events/ListSkeleton';
import type { EventsCalendar } from '@/components/screens/community-life-events/useEventsCalendar';
import type {
  CommunityLifeLists,
} from '@/components/screens/community-life-events/useCommunityLifeLists';

interface CalendarTabProps {
  calendar: EventsCalendar;
  lists: CommunityLifeLists;
}

export function CalendarTab({ calendar, lists }: CalendarTabProps) {
  const {
    calendarView, setCalendarView, selectedDateStr, setSelectedDateStr, setReminderModalOpen,
  } = calendar;
  const { calendarEvents, calendarLoading, calendarError, refresh } = lists;

  // ── DEFECT-013: the calendar was hardcoded to July 2026 ──────────────────
  //
  // `julyDays` assumed 31 days and a Wednesday start; the grid built its keys
  // as `2026-07-${day}`; the header read "July 2026"; and the **Today** button
  // jumped to `2026-07-13`. So the calendar showed July 2026 for ever, marked
  // the 13th as today for ever, and no event outside that month could be
  // selected on it. Found while driving the events screens on a device.
  //
  // The month is now derived from the clock. `todayStr` is built from local
  // date parts rather than `toISOString()`, which converts to UTC first and
  // west of Greenwich reports yesterday — the same silent-wrong-date bug in a
  // different disguise.
  const todayStr = useMemo(() => toDateString(new Date()), []);

  const calendarMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Monday-first, matching the column headings this grid renders.
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);

    return {
      year,
      month,
      cells,
      label: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      dateStringFor: (day: number) =>
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }, []);

  const selectedDateEvents = useMemo(() => {
    return calendarEvents.filter(item => item.date === selectedDateStr);
  }, [calendarEvents, selectedDateStr]);

  return (
    <View className="p-5">
      
      {/* Header Toggles: Today / Reminder / View Mode */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setSelectedDateStr(todayStr)}
            className="bg-surface-card border border-subtle px-3 py-1.5 rounded-xl"
          >
            <Text className="text-xs font-bold text-content-secondary">Today</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setReminderModalOpen(true)}
            className="bg-surface-muted border border-subtle px-3 py-1.5 rounded-xl"
          >
            <Text className="text-xs font-bold text-primary-500">+ Reminder</Text>
          </TouchableOpacity>
        </View>

        {/* View toggles */}
        <View className="flex-row bg-surface-card border border-subtle rounded-xl p-1">
          {(['month', 'week', 'agenda'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setCalendarView(mode)}
              className={`px-2.5 py-1 rounded-lg ${
                        calendarView === mode ? 'bg-primary-500' : 'transparent'
                      }`}
            >
              <Text className={`text-[10px] font-black uppercase ${
                        calendarView === mode ? 'text-white' : 'text-content-muted'
                      }`}>
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Calendar Grid rendering */}
      {calendarView === 'month' && (
        <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm mb-5">
          <View className="flex-row justify-between items-center mb-3 px-1">
            <Text className="text-base font-black text-content-strong">{calendarMonth.label}</Text>
            <View className="bg-surface-background px-2 py-0.5 rounded border border-subtle">
              <Text className="text-[8px] font-black text-content-muted uppercase">Cached Calendar Mode</Text>
            </View>
          </View>

          {/* Weekdays */}
          <View className="flex-row mb-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
              <Text key={idx} className="flex-1 text-center text-xs font-extrabold text-content-faint">
                {day}
              </Text>
            ))}
          </View>

          {/* Days */}
          <View className="flex-row flex-wrap">
            {calendarMonth.cells.map((dayNum, idx) => {
              if (dayNum === null) return <View key={idx} className="w-[14.28%] aspect-square" />;
              const dateString = calendarMonth.dateStringFor(dayNum);
              const isSelected = selectedDateStr === dateString;
              const isToday = dateString === todayStr;
              const dayEvents = calendarEvents.filter(e => e.date === dateString);
              const hasEvents = dayEvents.length > 0;

              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setSelectedDateStr(dateString)}
                  className={`w-[14.28%] aspect-square items-center justify-center rounded-xl p-1 relative ${
                            isSelected ? 'bg-primary-500' : isToday ? 'bg-surface-muted' : 'transparent'
                          }`}
                >
                  <Text className={`text-xs font-black ${
                            isSelected ? 'text-white' : isToday ? 'text-primary-500' : 'text-content-strong'
                          }`}>
                    {dayNum}
                  </Text>
                  {hasEvents && (
                    <View className={`w-1 h-1 rounded-full absolute bottom-1 ${
                              isSelected ? 'bg-surface-card' : 'bg-primary-500'
                            }`} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Day Agenda Details */}
      <View>
        <Text className="text-xs font-black text-content-faint uppercase tracking-widest mb-3">
          Schedule for {selectedDateStr}
        </Text>
        
        <ListState
          loading={calendarLoading && calendarEvents.length === 0}
          skeleton={<ListSkeleton label="Loading the calendar" />}
          error={
            calendarError && calendarEvents.length === 0
              ? { title: 'Calendar events could not be loaded', message: calendarError.message }
              : null
          }
          onRetry={refresh}
          isEmpty={selectedDateEvents.length === 0}
          empty={{ icon: 'cafe-outline', title: 'No schedules or reminders for this date' }}
        >
          {selectedDateEvents.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                if (item.type === 'Event') router.push(`/community-life/event/${item.associatedId}`);
              }}
              className="bg-surface-card border border-subtle p-4 rounded-2xl flex-row items-center mb-3 shadow-sm"
              disabled={item.type !== 'Event'}
            >
              <View
                className="w-3 h-10 rounded-full mr-3"
                style={{ backgroundColor: item.color || '#F59300' }}
              />
              <View className="flex-1">
                <Text className="text-[9px] font-black uppercase text-content-muted">
                  {item.type} {item.time ? `· ${item.time}` : ''}
                </Text>
                <Text className="text-sm font-black text-content-strong">{item.title}</Text>
              </View>
              {item.type === 'Event' && <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />}
            </TouchableOpacity>
          ))}
        </ListState>
      </View>
    </View>
  );
}
