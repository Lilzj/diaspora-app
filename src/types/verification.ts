// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Country Verification Types
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationDocumentType =
  | 'PassportStamp'
  | 'ResidencePermit'
  | 'WorkPermit'
  | 'StudentVisa'
  | 'Other';

export type VerificationStatus = 'Pending' | 'Approved' | 'Rejected' | 'NeedMoreInfo';

export interface CountryVerification {
  verificationId: string;
  userId: string;
  countryCode: string;
  countryName: string;

  documentType: VerificationDocumentType;
  documentUrl: string;

  arrivalDate: string | null;
  residencyYears: number | null;
  expertiseAreas: string[];

  status: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;

  createdAt: string;
}

export interface CountryVerificationSummary {
  countryCode: string;
  countryName: string;
  flag: string;
  arrivalYear: number;
  yearsOfResidence: number;
  isVerified: boolean;
  expertiseAreas: string[];
}

export interface VerificationSubmitRequest {
  countryCode: string;
  countryName: string;
  documentType: VerificationDocumentType;
  documentUri: string;
  arrivalDate: string;
  expertiseAreas: string[];
}

export const DOCUMENT_TYPE_LABELS: Record<VerificationDocumentType, string> = {
  PassportStamp: 'Passport Entry Stamp',
  ResidencePermit: 'Residence Permit',
  WorkPermit: 'Work Permit',
  StudentVisa: 'Student Visa',
  Other: 'Other Document',
};
