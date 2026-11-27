// List a home: what each step needs before it can be left, and how far through the member is.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { steps } from '@/components/screens/housing-create/form';
import type { ListingAccount } from '@/components/screens/housing-create/useListingAccount';
import type { ListingWizard } from '@/components/screens/housing-create/useListingWizard';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';
import type { HousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';
import type { HousingContact } from '@/components/screens/housing-create/useHousingContact';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';

export function useListingProgress(
  account: ListingAccount,
  wizard: ListingWizard,
  details: HousingDetails,
  location: HousingLocation,
  pricing: HousingPricing,
  photos: HousingPhotos,
  contact: HousingContact,
  catalogue: HousingCatalogue,
) {
  const { countryCode } = account;
  const { currentStep } = wizard;
  const { title, summary, description } = details;
  const { cityName, addressLine } = location;
  const { rent } = pricing;
  const { coverPhoto } = photos;
  const { contactPhone } = contact;
  const { propertyType } = catalogue;

  /**
   * What each step needs before it can be left, in the member's own words.
   *
   * **Declared rather than computed inline, and it is not a style choice.** The
   * gate used to be one boolean expression on the Next button, and it was
   * missing `summary` — a field `CreateHousingListingRequest` marks `required`
   * and `HousingDescription.Create` refuses when blank. A landlord who skipped
   * the one-line summary passed all seven steps and was refused at Publish with
   * "Diaspora could not save your listing", naming nothing. Watched on a device
   * on 21 Sep 2026.
   *
   * Three things follow from having the list rather than the boolean: the
   * member is told which field is missing instead of meeting a dead button; a
   * test can check this list against the fields the server actually requires;
   * and a step added later cannot arrive with no rules and go unnoticed.
   *
   * Photos are step 6 and are required to *publish*, not to leave the step —
   * the server accepts a draft without one — so the cover is required on the
   * last step, where Publish is.
   */
  const requiredByStep: { label: string; filled: boolean }[][] = [
    [{ label: 'Property category', filled: !!propertyType }],
    [
      { label: 'Listing title', filled: !!title.trim() },
      { label: 'One-line summary', filled: !!summary.trim() },
      { label: 'Description', filled: !!description.trim() },
    ],
    // No neighbourhood since 14 Oct 2026: the server never required one. The
    // country is required by the server and comes from residence, so it is named
    // here only for an account that holds none.
    [
      { label: 'Country of residence', filled: !!countryCode },
      { label: 'Town or city', filled: !!cityName.trim() },
      { label: 'Address line', filled: !!addressLine.trim() },
    ],
    [{ label: 'Monthly rent', filled: !!rent.trim() }],
    [{ label: 'Phone number', filled: !!contactPhone.trim() }],
    [],
    [{ label: 'Cover image', filled: !!coverPhoto }],
  ];

  const stillNeeded = (requiredByStep[currentStep] ?? [])
    .filter((field) => !field.filled)
    .map((field) => field.label);

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  return { stillNeeded, progressPct };
}

/** What `useListingProgress` holds, as the screen reads it. */
export type ListingProgress = ReturnType<typeof useListingProgress>;
