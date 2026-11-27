// List a home: what the property is, in the landlord's words.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';

export function useHousingDetails() {
  // STEP 2: Property details & Lifestyle match checkboxes
  const [title, setTitle] = useState('');
  /**
   * The one-line blurb. **Required by the server.**
   *
   * `CreateHousingListingRequest` declares `Summary` required and `Description`
   * optional — a search card shows the short form without loading the long one.
   * Not truncated from the description: a sentence cut mid-clause reads as a
   * fault in the listing, and the landlord is the only one who knows which
   * sentence sells the room.
   */
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  // Server keys (`Furnished`, `MonthToMonth`…), never labels.
  const [furnished, setFurnished] = useState('');
  const [houseRulesText, setHouseRulesText] = useState('No smoking inside, Respect quiet hours');
  const [selectedLifestyleMatches, setSelectedLifestyleMatches] = useState<Record<string, boolean>>({});

  return {
    title, setTitle, summary, setSummary, description, setDescription, bedrooms, setBedrooms,
    bathrooms, setBathrooms, furnished, setFurnished, houseRulesText, setHouseRulesText,
    selectedLifestyleMatches, setSelectedLifestyleMatches,
  };
}

/** What `useHousingDetails` holds, as the screen reads it. */
export type HousingDetails = ReturnType<typeof useHousingDetails>;
