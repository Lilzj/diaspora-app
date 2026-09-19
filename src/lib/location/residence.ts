// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — where a member has lived, and saying they have moved
//
// **Nothing in this app could say "I moved".** The Trust Centre drew a Country
// Experience timeline and the verification flow could add a country to it, but
// there was no way to close one — so a member who left Mauritius for the UK
// stayed a current, verified resident of Mauritius for ever, and the timeline
// said "2019 – Present" about a country they had not lived in for a year.
//
// The routes were never missing. `/api/v1/location/me/countries` has been
// served since the Location module shipped:
//
//     GET    /location/me/countries              the residence timeline
//     POST   /location/me/countries              declare, or amend, one country
//     PUT    /location/me/countries/{code}       the same upsert, by code
//     DELETE /location/me/countries/{code}       withdraw a claim entirely
//
// POST and PUT reach the same command, so declaring a country twice amends it
// rather than duplicating it — which is what makes "I moved" a single call
// against the country being left, with `departedOn` filled in.
//
// **Declaring is not verifying, in either direction.** A declaration cannot
// grant standing; only a reviewed verification does that. But it can close one,
// because closing takes nothing away: the verification, the badge and every
// point earned survive a departure untouched. The only thing that stops is the
// residence clock behind the guide programme's duration requirement. Withdrawing
// a claim (DELETE) does not un-prove a verification either — a member who
// removes a residence Trust has already proven has not unproven it.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import { unwrapEnvelope } from '@/lib/platform-envelope';
import { toFinancialError } from '@/lib/financial-errors';

const ROOT = '/location/me/countries';

/** `CountryExperienceResponse`. */
export interface ResidenceWire {
  id: string;
  countryCode: string;
  countryName: string;
  flag: string;
  arrivedOn: string;
  /** Null while the member still lives there — the timeline's "Present". */
  departedOn?: string | null;
  startYear: number;
  endYear?: number | null;
  years: number;
  isCurrentResidence: boolean;
  experienceLevel: string;
  role?: string | null;
  languageFamiliarity: string;
  culturalFamiliarity: string;
  /** Trust's decision, joined in at read time. Location never computes it. */
  isVerified: boolean;
  verificationState: string;
  expertiseAreas: string[];
}

/** `CountryExperienceTimelineResponse`. */
export interface ResidenceTimelineWire {
  experiences: ResidenceWire[];
  currentResidence?: ResidenceWire | null;
  countryCount: number;
  verifiedCountryCount: number;
  totalYearsAbroad: number;
}

/** What `DeclareCountryExperienceRequest` binds. */
export interface DeclareResidenceBody {
  countryCode: string;
  /** ISO date, `YYYY-MM-DD`. */
  arrivedOn: string;
  /** ISO date. Present means the member has left. */
  departedOn?: string | null;
  role?: string | null;
  languageFamiliarity?: string | null;
  culturalFamiliarity?: string | null;
  expertiseAreas?: string[] | null;
}

export const residenceKeys = {
  all: ['location', 'residence'] as const,
  timeline: () => ['location', 'residence', 'timeline'] as const,
};

/** The day part of an ISO timestamp, which is what these routes bind. */
export function toIsoDay(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Every country this member says they have lived in, with Trust's verification
 * state joined in.
 *
 * Distinct from the Trust Centre's `experienceTimeline`, which is built from
 * Trust's *standings* — the countries a reviewer has confirmed. This one is the
 * member's own account of themselves, so it includes countries they have
 * claimed and not proven. Both are true and they answer different questions.
 */
export async function fetchResidenceTimeline(
  signal?: AbortSignal
): Promise<ResidenceTimelineWire | null> {
  try {
    const response = await apiClient.get(ROOT, { signal });

    return unwrapEnvelope<ResidenceTimelineWire>(response.data) ?? null;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Declares a country, or amends the declaration already there.
 *
 * The server upserts on `(member, countryCode)`, so this is the one call behind
 * both "I have lived here" and "I have left here".
 */
export async function declareResidence(
  body: DeclareResidenceBody
): Promise<ResidenceWire | null> {
  try {
    const response = await apiClient.post(ROOT, body);

    return unwrapEnvelope<ResidenceWire>(response.data) ?? null;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

/**
 * Records a move: closes the country being left, opens the one arrived in.
 *
 * **Two calls, and deliberately not a transaction.** If the second fails, the
 * member has correctly recorded that they left somewhere and can retry the
 * arrival; the reverse order would leave two open residences, which reads as
 * living in both. Two open residences is a legal state — plenty of members
 * split their time — so it has to be one the member chooses, never one a failed
 * request leaves behind.
 */
export async function recordMove(move: {
  leaving: { countryCode: string; arrivedOn: string; role?: string | null };
  departedOn: string;
  arriving: { countryCode: string; arrivedOn: string; role?: string | null };
}): Promise<ResidenceWire | null> {
  await declareResidence({
    countryCode: move.leaving.countryCode,
    arrivedOn: move.leaving.arrivedOn,
    departedOn: move.departedOn,
    role: move.leaving.role ?? null,
  });

  return declareResidence({
    countryCode: move.arriving.countryCode,
    arrivedOn: move.arriving.arrivedOn,
    departedOn: null,
    role: move.arriving.role ?? null,
  });
}

/**
 * Withdraws a claim about a country.
 *
 * Not the same as leaving it. Leaving is `departedOn`; this says the residence
 * should never have been listed at all.
 */
export async function withdrawResidence(countryCode: string): Promise<void> {
  try {
    await apiClient.delete(`${ROOT}/${encodeURIComponent(countryCode)}`);
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}
