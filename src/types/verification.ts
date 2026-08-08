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

export type DiasporaDocumentType =
  | 'Passport'
  | 'ResidencePermit'
  | 'WorkPermit'
  | 'OccupationPermit'
  | 'StudentPermit'
  | 'Visa'
  | 'GovernmentImmigrationDocuments'
  | 'Other';

export interface SubmitVerificationRequest {
  nationality: string;
  residenceCountry: string;
  documentType: DiasporaDocumentType;
  issueCountry: string;
  issueDate: string;
  expiryDate: string;
  supportingNotes?: string;
  documentUri: string;
  selfieUri?: string;
}

export interface VerificationResponse {
  verificationId: string;
  userId: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReasonCode?: 'INVALID_DOCUMENT' | 'EXPIRED_DOCUMENT' | 'MISMATCHED_NATIONALITY' | 'ADDITIONAL_DOCS_NEEDED';
  rejectionReasonDetails?: string;
}

export interface AppealSubmissionRequest {
  verificationId: string;
  explanation: string;
  additionalDocuments: string[];
  correctionRequest: boolean;
}
