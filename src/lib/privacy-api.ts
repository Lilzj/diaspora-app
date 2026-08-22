// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — subject rights
//
// The two things a member can do to their own account that nothing else on this
// platform can undo: take their data out, and leave.
//
// Every route below was read from `Diaspora.Api/Identity/Controllers/PrivacyController.cs`
// and confirmed against the published contract, not inferred from a screen:
//
//   GET  /privacy/export             -> PersonalDataExport
//   GET  /privacy/deletion/preview   -> AccountErasureReceipt (isPreview: true)
//   POST /privacy/deletion           -> AccountErasureReceipt (isPreview: false)
//
// ── Why deletion asks for the password ───────────────────────────────────────
//
// The server requires it, and the reason is worth carrying into the client's
// copy rather than presenting as a hoop: a bearer token sitting on an unlocked
// phone is enough to reach this endpoint. It is not enough to use it.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';

/** What a module did with a member's data, or would do. */
export type ErasureOutcome = 'Deleted' | 'Anonymized' | 'NothingHeld' | 'Retained';

export interface ErasureResult {
  module: string;
  dataSet: string;
  outcome: ErasureOutcome;
  recordsAffected: number;
  /** Populated when the outcome is `Retained`, and only then. */
  reason: string | null;
}

export interface AccountErasureReceipt {
  userId: string;
  completedAt: string | null;
  isPreview: boolean;
  results: ErasureResult[];
  /**
   * Modules that hold data and have no erasure provider — that is, the ones that
   * could not be asked.
   *
   * Rendered rather than hidden. A receipt listing only what was erased reads as a
   * complete one, and this is the difference between "Diaspora erased everything"
   * and "Diaspora erased everything it can currently reach".
   */
  modulesWithoutErasureProvider: string[];
  /** Modules whose erasure threw. Empty is the expected case. */
  failures: string[];
  isComplete: boolean;
}

export interface ExportSection {
  module: string;
  dataSet: string;
  records: Record<string, unknown>[];
}

export interface PersonalDataExport {
  userId: string;
  generatedAt: string;
  sections: ExportSection[];
  /** The modules absent from this export. Shown for the same reason as above. */
  modulesWithoutExportProvider: string[];
}

/** Everything the platform holds that the member gave it. */
export async function exportMyData(): Promise<PersonalDataExport> {
  const response = await apiClient.get<{ data: PersonalDataExport }>('/privacy/export');
  return response.data.data;
}

/** What deleting this account would do. Changes nothing. */
export async function previewAccountDeletion(): Promise<AccountErasureReceipt> {
  const response = await apiClient.get<{ data: AccountErasureReceipt }>('/privacy/deletion/preview');
  return response.data.data;
}

/** The literal word the server requires. Exported so the screen and the call cannot disagree. */
export const DELETION_CONFIRMATION = 'DELETE';

/**
 * Erases the account. Irreversible.
 *
 * Returns the receipt, which is the last thing this account will ever be shown — so
 * the caller should render it before signing out rather than discarding it.
 */
export async function deleteMyAccount(
  currentPassword: string,
  confirmation: string,
): Promise<AccountErasureReceipt> {
  const response = await apiClient.post<{ data: AccountErasureReceipt }>('/privacy/deletion', {
    currentPassword,
    confirmation,
  });

  return response.data.data;
}

/**
 * A human summary of one line of a receipt.
 *
 * The outcome names are the server's enum and are not phrasing anybody should read.
 * `Anonymized` in particular needs saying out loud: the record survives, the person
 * in it does not, and a member who is told only "erased" would be surprised to find
 * their old messages still in somebody else's thread.
 */
export function describeErasureResult(result: ErasureResult): string {
  switch (result.outcome) {
    case 'Deleted':
      return result.recordsAffected === 0
        ? `${result.dataSet} — nothing to remove`
        : `${result.dataSet} — ${result.recordsAffected} removed`;
    case 'Anonymized':
      return `${result.dataSet} — kept, with everything identifying you removed`;
    case 'NothingHeld':
      return `${result.dataSet} — nothing held`;
    case 'Retained':
      return `${result.dataSet} — kept${result.reason ? `: ${result.reason}` : ''}`;
    default:
      return result.dataSet;
  }
}
