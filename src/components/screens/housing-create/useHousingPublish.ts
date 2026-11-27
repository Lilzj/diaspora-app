// List a home: publishing. The listing, then the photographs, then the contact details, in
// the order the Housing service takes them; the draft is cleared once the listing is in.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { Platform } from 'react-native';
import { router } from 'expo-router';
import { createAndPublishListing } from '@/lib/api/housing-listings-api';
import { useNotification } from '@/providers/notification-provider';
import { clearDeviceDraft } from '@/lib/platform/device-drafts';
import { LIFESTYLE_OPTIONS } from '@/components/screens/housing-create/form';
import type { ListingAccount } from '@/components/screens/housing-create/useListingAccount';
import type { ListingWizard } from '@/components/screens/housing-create/useListingWizard';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';
import type { HousingPhotos } from '@/components/screens/housing-create/useHousingPhotos';
import type { HousingContact } from '@/components/screens/housing-create/useHousingContact';
import type { HousingAmenities } from '@/components/screens/housing-create/useHousingAmenities';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';

export function useHousingPublish(
  account: ListingAccount,
  wizard: ListingWizard,
  details: HousingDetails,
  location: HousingLocation,
  pricing: HousingPricing,
  photos: HousingPhotos,
  contact: HousingContact,
  amenities: HousingAmenities,
  catalogue: HousingCatalogue,
) {
  const { showAlert } = useNotification();
  const { trustStore, countryCode, landlordDisplayName } = account;
  const { setIsSubmitting } = wizard;
  const {
    title, summary, description, bedrooms, bathrooms, furnished, houseRulesText,
    selectedLifestyleMatches,
  } = details;
  const { cityName, addressLine, landmark, coordinates } = location;
  const {
    rent, currency, deposit, billsIncluded, internetIncluded, parkingAvailable, leaseDuration,
  } = pricing;
  const { coverPhoto, galleryPhotos } = photos;
  const { contactPhone, contactEmail, publishContact, heldContact } = contact;
  const { amenityKeys } = amenities;
  const {
    listingType, propertyType, accommodationTypes, furnishingOptions, leaseOptions,
  } = catalogue;

  const handlePublish = async () => {
    setIsSubmitting(true);

    const parseCommaItems = (text: string) =>
      text.split(',').map((line) => line.trim()).filter((line) => line.length > 0);

    // Remediation Wave E — `CreateHousingListingRequest.Media`, a list of
    // `HousingMediaRequest { mediaId, role, caption? }`.
    //
    // The role is **explicit** here, and its vocabulary is the server's: `Cover`,
    // `Gallery`, `FloorPlan`, `Video`, `VirtualTour`, `Document`,
    // `LeaseDocument`. So this screen names the cover rather than implying it by
    // position — which is exactly what marketplace's contract does instead, with
    // a flat `mediaIds` ordered cover-first and no role field at all.
    //
    // The two are not unified, and the difference is not an oversight to tidy
    // away: housing needs roles a marketplace listing has no use for, a floor
    // plan and a lease document among them. Making the two screens post the same
    // shape would mean one of them is posting a shape its server does not bind.
    //
    // This replaces `coverImage` (a `file:///…` device path) and `gallery` (the
    // same path repeated at the front of a list of others). Neither field exists
    // on the request the server binds.
    const media = [
      ...(coverPhoto ? [{ mediaId: coverPhoto.mediaId, role: 'Cover' }] : []),
      ...galleryPhotos.map((photo) => ({ mediaId: photo.mediaId, role: 'Gallery' })),
    ];

    const lifestyleArr = Object.keys(selectedLifestyleMatches)
      .filter((k) => selectedLifestyleMatches[k])
      .map((k) => {
        const item = LIFESTYLE_OPTIONS.find((opt) => opt.value === k);
        return item ? item.label : k;
      });

    /**
     * The create payload, as `CreateHousingListingRequest` actually declares it.
     *
     * ── This screen could not create a listing ─────────────────────────────
     *
     * The DTO declares three `required` members — `Title`, `Summary`,
     * `AccommodationTypeKey`, `CountryCode` — and this payload supplied one.
     * C# `required` means System.Text.Json refuses the body **before any
     * handler runs**, so every submission 400'd. It sent thirteen further keys
     * the DTO does not declare, each discarded by the binder without comment.
     *
     * Found by the request-binding check, which compares what leaves the device
     * against the DTO. Every earlier wave verified *responses* and could not
     * see this, because there was no response to inspect.
     *
     * What changed:
     *
     *   `summary`               new required field; distinct from description.
     *   `accommodationTypeKey`  one seeded key, from what were two client
     *                           concepts (`listingType` + `propertyType`).
     *   `countryCode`           new required field, from residence (never asked
     *                           since 14 Oct 2026).
     *   `rent`/`currency`/      flattened onto `rentAmount`, `currencyCode`,
     *   `deposit`               `depositAmount` — the names the DTO binds.
     *   `billsIncluded`         → `utilitiesIncluded`.
     *   `furnished`             → `furnishedStatus`.
     *   `leaseDuration`         → `leaseType`.
     *   `parkingAvailable`      → `parking`, which is a **string** describing
     *                           the arrangement, not a boolean.
     *   `location: {…}`         flattened; the DTO has no nested location.
     *   `amenities`             `string[]` → `[{ key }]`.
     *   `houseRules`            `string[]` → `[{ text, order }]`.
     *
     * **`host` is deleted outright**, and it is the worst thing that was here.
     * The DTO has no such member, so none of it ever reached the server — but
     * it carried `providerId: 'user-123'`, `name: 'Amara Kone'`, `rating: 4.9`,
     * `isVerified: true` and `yearsOnPlatform: 2`. A fabricated landlord
     * identity, with a fabricated verification badge and a fabricated rating,
     * assembled on every submission. The host is the authenticated caller and
     * the server knows who that is.
     *
     * `location.distanceKm: 0.8` went with it — a distance from nobody.
     *
     * **`lifestyleMatches` is dropped and reported.** There is no field for it
     * anywhere on the request, so the checkboxes collect a preference the
     * platform cannot store. Left in the UI would be an affordance that does
     * nothing; see the note rendered beneath them.
     */
    // The server's own key, chosen from its own list.
    const accommodationTypeKey = accommodationTypes.some((type) => type.key === propertyType)
      ? propertyType
      : null;
    if (!accommodationTypeKey) {
      showAlert({
        type: 'error',
        title: 'Not created',
        message: 'Choose a property type — Diaspora needs it to file the listing.',
      });
      setIsSubmitting(false);
      return;
    }

    // Required by the server and never asked: a home is listed where the member lives.
    if (!countryCode) {
      showAlert({
        type: 'error',
        title: 'Not created',
        message: 'Your account has no country of residence yet, and a home is always listed in it. Add it to your profile, then publish — this draft is kept.',
      });
      setIsSubmitting(false);
      return;
    }

    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      description: description.trim() || undefined,
      accommodationTypeKey,
      // From `residenceCountry`, checked above; never typed and never defaulted.
      countryCode: countryCode.toUpperCase(),
      cityName: cityName.trim() || undefined,
      addressLine1: addressLine.trim() || undefined,
      // The landlord's own words about where it is; the server's limit is 200.
      addressLine2: landmark.trim() || undefined,
      // `undefined` rather than a spread, so the key disappears from the body
      // and the payload stays one readable literal — `backend-request-binding-drift`
      // enumerates these keys, and a spread turns its checks into vacuous passes.
      // Absent when the landlord set no pin: the server then treats the address
      // as undisclosed and files the property from its town, which is the truth.
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      rentAmount: rent ? Number(rent) : undefined,
      // ── Without this, every priced listing is refused ──────────────────────
      //
      // `rentPeriod` was never sent. The server's `BuildPrice` treats a missing
      // rent as "price on application" and succeeds, but a rent *with* an
      // unparseable period as a failure:
      //
      //     if (request.RentAmount is null) return OnApplication(…);
      //     if (!Enum.TryParse<RentPeriod>(request.RentPeriod, …)) return PriceRequired;
      //
      // So a listing with no rent was created and a listing *with* a rent was
      // rejected `400 housing.price.required` — "State the rent, or mark the
      // price as on application" — shown to a landlord who had just stated it.
      // Confirmed against the deployment: identical payloads, one with this
      // field and one without, answered 201 and 400.
      //
      // `PerMonth` is the enum member, and it matches the only rent field this
      // form has: "Monthly Rent Amount". A per-week or per-night let needs a
      // period selector on the form before it can be offered here — sending a
      // period the member did not choose for a field they did not see would be
      // the same class of guess this comment block exists to record.
      rentPeriod: rent ? 'PerMonth' : undefined,
      currencyCode: currency || undefined,
      depositAmount: deposit ? Number(deposit) : undefined,
      utilitiesIncluded: billsIncluded,
      internetIncluded,
      // A string on the wire, not a flag: "Off-street parking" and "Permit
      // zone, no allocated space" are the same boolean and a very different
      // arrangement.
      parking: parkingAvailable ? 'Available' : undefined,
      // Only a value the server listed; a draft saved before 13 Oct holds old labels.
      furnishedStatus: furnishingOptions.some((o) => o.key === furnished) ? furnished : undefined,
      leaseType: leaseOptions.some((o) => o.key === leaseDuration) ? leaseDuration : undefined,
      isSharedAccommodation: listingType === 'Share',
      // Straight from the catalogue. Nothing here was typed, so nothing here
      // can fail to resolve.
      amenities: amenityKeys.map((key) => ({ key })),
      houseRules: parseCommaItems(houseRulesText).map((text, order) => ({ text, order })),
      media,
    };

    // Compared against what was read, not sent wholesale: `PATCH` coalesces
    // against what is stored, so an empty field would clear an address the
    // member has and an unchanged one would cost a request for nothing.
    const contactChanges = {
      ...(contactPhone.trim() && contactPhone.trim() !== (heldContact?.phoneNumber ?? '')
        ? { phoneNumber: contactPhone.trim() }
        : {}),
      ...(contactEmail.trim() && contactEmail.trim() !== (heldContact?.email ?? '')
        ? { email: contactEmail.trim() }
        : {}),
      ...(publishContact !== (heldContact?.showContactPublicly ?? false)
        ? { showContactPublicly: publishContact }
        : {}),
    };

    try {
      // Create, then publish — the two-step the contract actually requires. The
      // reasoning, the refusal codes and why publication failure is not
      // creation failure all live in `lib/housing-listings-api.ts`.
      //
      // The landlord profile is the step *before* that two-step, and the client
      // never took it: every listing write is `403 housing.not-landlord`
      // without one, and no surface called `POST /housing/landlords`. Opened on
      // demand, under the member's own name, at the moment the platform's model
      // says they become a landlord.
      const outcome = await createAndPublishListing(payload, {
        displayName: landlordDisplayName,
        countryCode,
        // Only what changed. These live on the landlord profile rather than on
        // the listing — the platform has no contact fields on a home — and the
        // profile is shared by every listing this member has, so sending an
        // unchanged value is a write nobody asked for.
        contact: contactChanges,
      });
      void clearDeviceDraft('housing');
      setIsSubmitting(false);

      if (outcome.kind === 'published') {
        // The only branch permitted to say "published", and it says it only
        // because `POST .../publish` returned success.
        trustStore.addAuditLog('Housing Posted', `Published housing listing: "${title}"`);

        showAlert({
          type: 'success',
          title: 'Listing published',
          message: 'Your property is now visible to the community in Discover.',
          buttons: [
            {
              text: 'View Discover Hub',
              onPress: () => {
                router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Housing' } });
              }
            }
          ]
        });
        return;
      }

      // Saved but not visible. The audit log records what really happened, so a
      // member reading their own security history is not told it was published.
      trustStore.addAuditLog('Housing Draft Saved', `Saved housing listing as a draft: "${title}"`);

      // Each refusal gets its own sentence. "Something went wrong" would leave a
      // landlord with an invisible listing and no idea which of the three
      // situations they are in.
      const reasonMessage =
        outcome.reason === 'incomplete'
          ? 'Your listing is saved as a draft but is not visible yet. Publishing needs at least one photo, a description, and a property type — add what is missing and publish it from your listings.'
          : outcome.reason === 'refused'
            ? 'Your listing is saved as a draft but Diaspora could not publish it. Listings are checked before they go live, and this one needs review. Contact support if you think this is wrong.'
            : 'Your listing is saved as a draft but Diaspora could not publish it just now. Nothing you entered was lost — open it from your listings and publish it again.';

      showAlert({
        type: 'warning',
        title: 'Saved as a draft — not yet visible',
        message: reasonMessage,
      });
    } catch (err) {
      setIsSubmitting(false);
      // Reached only when *creation* failed, so this is the one case where the
      // member genuinely has nothing saved — and it now says so.
      const msg = 'Diaspora could not save your listing. Nothing was posted. Please check your details and try again.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        showAlert({ type: 'error', title: 'Listing not saved', message: msg });
      }
    }
  };

  return { handlePublish };
}

/** What `useHousingPublish` holds, as the screen reads it. */
export type HousingPublish = ReturnType<typeof useHousingPublish>;
