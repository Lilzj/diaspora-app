// List a home: the listing checklist, which reports what is in the form and claims nothing else.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';
import type { HousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';

export function useListingCheck(
  details: HousingDetails,
  location: HousingLocation,
  pricing: HousingPricing,
  photos: HousingPhotos,
  catalogue: HousingCatalogue,
) {
  const { title, description, selectedLifestyleMatches } = details;
  const { cityName, landmark } = location;
  const { rent, currency } = pricing;
  const { coverPhoto, galleryPhotos } = photos;
  const { propertyType, propertyTypeName } = catalogue;

  // STEP 7: Smart AI polisher check
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  /**
   * Listing checklist — formerly the "Smart AI Evaluator".
   *
   * ── What it used to say, and why it was the worst item in the sweep ────────
   *
   * Three bullet points after a 1200ms fake spinner. The middle one:
   *
   *   > Average rent for a {bedrooms}-bed {propertyType} in {areaName} is
   *   > around {currency} {rent}/mo. Your pricing is competitive.
   *
   * `{rent}` is **the member's own input**, read straight back to them as the
   * market average, followed by a verdict that their figure is competitive with
   * itself. It is a mirror wearing the costume of a valuation, and it could
   * never disagree with the member no matter what they typed — £300 was
   * competitive, £30,000 was competitive. A landlord pricing a room on it, or a
   * newcomer checking they were not overcharging, was reading their own guess.
   *
   * (When `rent` was empty it fell back to a hardcoded `1500`, so an untouched
   * form asserted a specific average rent for any area in any currency.)
   *
   * The first and third bullets were plain fabrication of a different kind:
   * fixed strings praising a title for "transit proximity" and lifestyle flags
   * for "matching settlement tags search", printed identically whether the
   * title said anything of the sort or the member had selected no flags at all.
   *
   * ── Why it is not wired to a route instead ────────────────────────────────
   *
   * **No pricing, market, benchmark, comparable or valuation endpoint exists
   * anywhere in the platform**, and neither does any listing-quality or content
   * scoring route. The one real market datum in the backend is median/low/high
   * rent embedded in `GET /housing/neighborhoods/{idOrSlug}` — keyed by an
   * approved neighbourhood id this screen does not hold (it collects free-text
   * city and area names), computed only over *let* listings with a disclosed
   * amount, and dropped entirely below a three-listing sample. It is empty for
   * most areas, and quoting a three-let median as "the average rent" would be
   * the same defect with a citation.
   *
   * ── What it does now ──────────────────────────────────────────────────────
   *
   * It checks the form against itself and shows its working. Every line is
   * derived from something the member typed on this screen, states the input it
   * used, and makes no claim about the market, about other listings, or about
   * whether a price is good. It cannot be wrong, because it only reports what
   * is in front of it — and it is genuinely useful, because publication really
   * does require a photo, a description and a property type.
   */
  const runListingCheck = () => {
    setAiLoading(true);
    setAiSuggestions(null);

    const lines: string[] = [];

    // Publication requirements first — these mirror the server's `IsPublishable`
    // check, so a member who clears them will not meet the not-publishable
    // refusal after filling in seven steps.
    lines.push(
      coverPhoto
        ? `✅ Cover photo — added (plus ${galleryPhotos.length} gallery photo${galleryPhotos.length === 1 ? '' : 's'}).`
        : '❌ Cover photo — missing. Diaspora cannot publish a listing without at least one photo.'
    );
    lines.push(
      description.trim().length >= 80
        ? `✅ Description — ${description.trim().length} characters.`
        : `⚠️ Description — ${description.trim().length} characters. Listings with more detail get fewer repeat questions.`
    );
    lines.push(
      propertyType
        ? `✅ Property type — ${propertyTypeName ?? propertyType}.`
        : '❌ Property type — not chosen. Required before publishing.'
    );

    // Then things that are simply true or not, with the input quoted back so the
    // member can see exactly what was measured.
    lines.push(
      title.trim().length >= 25
        ? `✅ Title — ${title.trim().length} characters.`
        : `⚠️ Title — ${title.trim().length} characters. Short titles are easy to scroll past.`
    );
    lines.push(
      cityName.trim()
        ? `✅ Town — ${cityName.trim()}${landmark.trim() ? `, near ${landmark.trim()}` : ''}.`
        : '❌ Town — not chosen. Diaspora files the listing under its town.'
    );

    const rentValue = Number(rent);
    lines.push(
      rent && rentValue > 0
        ? `✅ Rent — ${currency} ${rentValue} per month entered.`
        : '❌ Rent — not entered.'
    );

    const lifestyleCount = Object.values(selectedLifestyleMatches).filter(Boolean).length;
    lines.push(
      lifestyleCount > 0
        ? `✅ Lifestyle tags — ${lifestyleCount} selected.`
        : '⚠️ Lifestyle tags — none selected. These are what lifestyle filters match on.'
    );

    setAiLoading(false);
    setAiSuggestions(
      `Checklist for this listing\n\n${lines.join('\n')}\n\n` +
      `This is a check of what you have filled in on this screen. Diaspora does not estimate rents and cannot tell you what similar homes charge.`
    );
  };

  return { aiLoading, aiSuggestions, runListingCheck };
}

/** What `useListingCheck` holds, as the screen reads it. */
export type ListingCheck = ReturnType<typeof useListingCheck>;
