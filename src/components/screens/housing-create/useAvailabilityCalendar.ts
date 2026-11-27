// List a home: the calendar the availability date is picked from, and the month it shows.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';

export function useAvailabilityCalendar() {
  // Calendar states and handlers
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  return {
    calendarVisible, setCalendarVisible, calendarMonth, setCalendarMonth, calendarYear,
    setCalendarYear,
  };
}

/** What `useAvailabilityCalendar` holds, as the screen reads it. */
export type AvailabilityCalendar = ReturnType<typeof useAvailabilityCalendar>;
