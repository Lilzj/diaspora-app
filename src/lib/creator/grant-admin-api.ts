// ─────────────────────────────────────────────────────────────────────────────
// The administrators' grants: `/grants/admin` (since 4 Nov 2026)
//
// `creator:programme:manage`, which the platform gives Admin and SuperAdmin. A
// member without it is answered 403, and the screen says so rather than
// showing an empty list.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import { unwrapEnvelope } from '@/lib/platform-envelope';
import type { SaveGrantRequest } from '@/lib/creator/grant-admin-form';

const ROOT = '/grants/admin';

/** `AdminGrantResponse`. */
export interface AdminGrant {
  grantId: string;
  key: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  /** Upcoming, Open, ClosingSoon or Closed. An unpublished grant reads Upcoming. */
  state: string;
  isPublished: boolean;
  fundingAmount: { minorUnits: number; currency: string; exponent: number };
  fundingMinimum: { minorUnits: number; currency: string; exponent: number } | null;
  opensAt: string | null;
  deadlineAt: string | null;
  minimumStatus: string;
  requiresVerifiedCreator: boolean;
  applicantCount: number;
  countryCodes: string[];
  fields: { key: string; label: string }[];
}

export type GrantWindowAction = 'publish' | 'unpublish' | 'close';

function grantOf(body: unknown): AdminGrant {
  const grant = unwrapEnvelope<AdminGrant>(body);
  if (!grant) throw new Error('The server sent no grant.');
  return grant;
}

export async function fetchAdminGrants(): Promise<AdminGrant[]> {
  const response = await apiClient.get(ROOT, { params: { take: 100 } });
  return unwrapEnvelope<AdminGrant[]>(response.data) ?? [];
}

export async function createGrant(request: SaveGrantRequest): Promise<AdminGrant> {
  return grantOf((await apiClient.post(ROOT, request)).data);
}

export async function updateGrant(grantId: string, request: SaveGrantRequest): Promise<AdminGrant> {
  const { publish: _publish, ...details } = request;
  return grantOf((await apiClient.put(`${ROOT}/${grantId}`, details)).data);
}

/** One literal path per action, so the contract check can read every route this calls. */
export async function setGrantWindow(grantId: string, action: GrantWindowAction): Promise<AdminGrant> {
  const response =
    action === 'publish'
      ? await apiClient.post(`${ROOT}/${grantId}/publish`)
      : action === 'unpublish'
        ? await apiClient.post(`${ROOT}/${grantId}/unpublish`)
        : await apiClient.post(`${ROOT}/${grantId}/close`);
  return grantOf(response.data);
}

/** True when the server refused because the caller may not manage grants. */
export function isGrantAdminRefusal(cause: unknown): boolean {
  return (cause as { response?: { status?: number } })?.response?.status === 403;
}
