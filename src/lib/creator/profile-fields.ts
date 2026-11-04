/**
 * The creator profile's fields, as the completeness requirements name them.
 *
 * `CreatorStatusPolicy.Completeness` (backend) sends a fixed set of keys with
 * `actionRoute: "/creator/profile"`. Each key is one field on that screen, so
 * "Edit profile" can take the member to it and open it (Android UAT,
 * 3 Nov 2026), rather than to whichever section a substring matched.
 */
import { appRouteFor } from '@/lib/server-route';

export type ProfileField = 'cover' | 'bio' | 'categories' | 'expertise' | 'languages';

const FIELD_BY_REQUIREMENT: Record<string, ProfileField> = {
  bio: 'bio',
  categories: 'categories',
  expertise: 'expertise',
  languages: 'languages',
  'cover-image': 'cover',
};

/** The field that meets `requirementKey`, or `null` when it is met elsewhere. */
export function profileFieldFor(requirementKey: string): ProfileField | null {
  return FIELD_BY_REQUIREMENT[requirementKey.toLowerCase()] ?? null;
}

/** A served requirement's route, as a screen the app has. See `lib/server-route.ts`. */
export function requirementRoute(route: string): string {
  return appRouteFor(route);
}
