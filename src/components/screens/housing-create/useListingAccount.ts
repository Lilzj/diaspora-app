// List a home: who is listing. Whether the Housing service lets this member list, the country a
// home is listed in (always their residence), and the name a first landlord profile opens under.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useAuthStore } from '@/store/auth';
import { useTrustStore } from '@/store/trust';

export function useListingAccount() {
  const trustStore = useTrustStore();

  // Whether this member may list a home, as the Housing service itself says:
  // the `housing.listings.create` feature on their access decision, which it
  // grants to verified accounts. Null until the session is restored — an
  // unanswered question is not a no, and the server still refuses a listing it
  // does not allow.
  //
  // This screen used to lock itself with the device's trust engine, asked about
  // a hard-coded 'GB' whatever country the member lives in, against thresholds —
  // residency verification, 100 points, a year — that the Housing service never
  // checked and no member could meet. Decided 15 Sep 2026: a verified account is
  // enough, as it is for posting a job.
  const access = useAuthStore((state) => state.access);
  const mayList = access ? access.grantedFeatures.includes('housing.listings.create') : null;

  /**
   * The country a home is listed in: always the member's country of residence.
   *
   * Since 14 Oct 2026 this is not asked. The form used to carry a "Country
   * (2-letter code)" field, prefilled from residence and editable; the owner's
   * rule is that a member lists where they live, and the residence country is
   * verified. **Required by the server** (`CreateHousingListingRequest.CountryCode`),
   * so a member whose account holds none is told so on the location step and
   * cannot leave it, rather than being refused at Publish. Never defaulted.
   */
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);
  const countryCode = (residenceCountry ?? '').trim().toUpperCase();

  /**
   * The name a landlord profile is opened under, if the member has never let
   * anything before. Their own name rather than an invented letting-agency
   * name — the platform's landlord model treats an individual as themselves.
   */
  const memberName = useAuthStore((state) => state.user?.fullName);
  const landlordDisplayName = (memberName ?? '').trim() || 'Diaspora member';

  return { trustStore, mayList, countryCode, landlordDisplayName };
}

/** What `useListingAccount` holds, as the screen reads it. */
export type ListingAccount = ReturnType<typeof useListingAccount>;
