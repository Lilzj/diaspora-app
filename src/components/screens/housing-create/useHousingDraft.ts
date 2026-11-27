// List a home: the draft kept on the phone, offered back on the next visit through the shared
// `useDeviceDraft` (FARCH-007). Lifted out of `app/housing/create.tsx` (FSOLID-001), which
// composes it.

import { useEffect, useCallback } from 'react';
import { useDeviceDraft } from '@/lib/platform/device-drafts';
import type { ChosenPhoto } from '@/types/media';
import type { ListingWizard } from '@/components/screens/housing-create/useListingWizard';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';
import type { HousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';
import type { HousingContact } from '@/components/screens/housing-create/useHousingContact';
import type { HousingAmenities } from '@/components/screens/housing-create/useHousingAmenities';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';

/**
 * A housing draft as this wizard writes it. `draftVersion` and `areaName` are
 * optional because drafts saved before 14 Oct 2026 lack the one and carry the
 * other; the fields read with a fallback below may be missing from older drafts.
 */
interface HousingDraftData {
  draftVersion?: number;
  listingType?: string;
  propertyType?: string | null;
  title?: string;
  summary?: string;
  description?: string;
  bedrooms: string;
  bathrooms: string;
  furnished: string;
  amenityKeys?: string[];
  houseRulesText: string;
  selectedLifestyleMatches?: Record<string, boolean>;
  cityName?: string;
  addressLine?: string;
  landmark?: string;
  areaName?: string;
  rent: string;
  currency: string;
  deposit: string;
  billsIncluded: boolean;
  internetIncluded: boolean;
  parkingAvailable: boolean;
  leaseDuration: string;
  availabilityDate: string;
  contactPhone: string;
  contactEmail: string;
  publishContact?: boolean;
  coverPhoto?: ChosenPhoto | null;
  galleryPhotos?: ChosenPhoto[];
  currentStep?: number;
}

export function useHousingDraft(
  wizard: ListingWizard,
  details: HousingDetails,
  location: HousingLocation,
  pricing: HousingPricing,
  photos: HousingPhotos,
  contact: HousingContact,
  amenities: HousingAmenities,
  catalogue: HousingCatalogue,
) {
  const { currentStep, setCurrentStep } = wizard;
  const {
    setTitle, title, setSummary, summary, description, setDescription, bedrooms, setBedrooms,
    bathrooms, setBathrooms, furnished, setFurnished, houseRulesText, setHouseRulesText,
    selectedLifestyleMatches, setSelectedLifestyleMatches,
  } = details;
  const { cityName, setCityName, addressLine, setAddressLine, landmark, setLandmark } = location;
  const {
    rent, setRent, currency, deposit, setDeposit, billsIncluded, setBillsIncluded, internetIncluded,
    setInternetIncluded, parkingAvailable, setParkingAvailable, leaseDuration, setLeaseDuration,
    availabilityDate, setAvailabilityDate,
  } = pricing;
  const { coverPhoto, setCoverPhoto, galleryPhotos, setGalleryPhotos } = photos;
  const {
    contactPhone, setContactPhone, contactEmail, setContactEmail, publishContact, setPublishContact,
  } = contact;
  const { amenityKeys, setAmenityKeys } = amenities;
  const { listingType, setListingType, propertyType, setPropertyType } = catalogue;

  // Kept on the phone since 14 Oct 2026, so a draft outlives the app being closed.
  const { bannerVisible: draftBannerVisible, save, restore, discard: discardDraft } =
    useDeviceDraft<HousingDraftData>('housing');

  // Auto-save draft triggers.
  //
  // Memoised so the effect below can name it. `currentStep` is in this list and
  // was never in the effect's, so the stored draft held whichever step the
  // member was on when some *other* field last changed.
  const saveDraft = useCallback(() => {
    save({
      // 2 since 14 Oct 2026: the town is chosen from the catalogue. A draft
      // without it holds one of the old hard-coded chips (London by default).
      draftVersion: 2,
      listingType, propertyType, title, summary, description, bedrooms, bathrooms, furnished,
      amenityKeys, houseRulesText, selectedLifestyleMatches, cityName,
      addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
      parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
      publishContact, coverPhoto, galleryPhotos, currentStep
    }, title);
  }, [
    save, listingType, propertyType, title, summary, description, bedrooms, bathrooms, furnished,
    amenityKeys, houseRulesText, selectedLifestyleMatches, cityName,
    addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
    parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
    publishContact, coverPhoto, galleryPhotos, currentStep
  ]);

  useEffect(() => {
    if (title || description || propertyType || rent) {
      saveDraft();
    }
  }, [saveDraft, title, description, propertyType, rent]);

  const restoreDraft = () => {
    const d = restore();
    if (d) {
      setListingType(d.listingType === 'Share' ? 'Share' : 'Rent');
      setPropertyType(d.propertyType ?? null);
      setTitle(d.title ?? '');
      setSummary(d.summary ?? '');
      setDescription(d.description ?? '');
      setBedrooms(d.bedrooms);
      setBathrooms(d.bathrooms);
      setFurnished(d.furnished);
      setAmenityKeys(d.amenityKeys ?? []);
      setHouseRulesText(d.houseRulesText);
      setSelectedLifestyleMatches(d.selectedLifestyleMatches || {});
      // A draft saved before 14 Oct 2026 holds a town from the four hard-coded
      // chips, London unless changed, not one the member searched for: it is
      // dropped so the step asks again. Its "Neighborhood / Area" (a field that
      // no longer exists) becomes the landmark when that was left empty.
      setCityName((d.draftVersion ?? 0) >= 2 ? (d.cityName ?? '') : '');
      setAddressLine(d.addressLine ?? '');
      setLandmark((d.landmark ?? '').trim() || (d.areaName ?? ''));
      setRent(d.rent);
      // A draft's saved currency is ignored: rent is always in the member's own.
      setDeposit(d.deposit);
      setBillsIncluded(d.billsIncluded);
      setInternetIncluded(d.internetIncluded);
      setParkingAvailable(d.parkingAvailable);
      setLeaseDuration(d.leaseDuration);
      setAvailabilityDate(d.availabilityDate);
      setContactPhone(d.contactPhone);
      setContactEmail(d.contactEmail);
      setPublishContact(d.publishContact ?? false);
      // A restored draft carries identifiers the platform already holds, so the
      // photographs survive without re-uploading. `null` rather than a fallback:
      // a draft saved before any photograph was chosen has none.
      setCoverPhoto(d.coverPhoto || null);
      setGalleryPhotos(d.galleryPhotos || []);
      setCurrentStep(d.currentStep || 0);
    }
  };

  return { draftBannerVisible, restoreDraft, discardDraft };
}

/** What `useHousingDraft` holds, as the screen reads it. */
export type HousingDraft = ReturnType<typeof useHousingDraft>;
