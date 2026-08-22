// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Media (Remediation Wave E)
//
// A typed mirror of `Diaspora.Modules.Media/Contracts/V1`, named as the wire
// names it. Renaming at the boundary is how the two repositories stopped
// agreeing in the first place, so nothing is renamed here — the mapping to a
// screen's view model happens at the screen, visibly.
//
// ── The one constraint this module exists to impose ──────────────────────────
//
// `MediaAssetResponse`'s own summary states it plainly:
//
//   > Every business module stores `mediaId` and renders from this; none of them
//   > stores a URL, a bucket name, or a storage key.
//
// The client has been doing the opposite. `ImagePickerInput` handed back
// `result.assets[0].uri` — a `file:///…` path on the device — and the create
// screens sent that string to the server as `coverImage`. It is meaningless to
// the server, meaningless to every other device, and meaningless to the same
// device after the OS clears its cache. Wave E is the fix.
//
// ── Enum values are strings, and that is deliberate on the server's side ─────
//
// `MediaWireNames` camel-cases every enum onto the wire and parses back
// case-insensitively, refusing an unknown value rather than defaulting it —
// because *"a typo silently becoming `Unknown` is how an upload ends up with the
// wrong size ceiling"*. The string unions below are that vocabulary, so a typo
// is a compile error on this side too.
// ─────────────────────────────────────────────────────────────────────────────

/** `MediaKind`. `unknown` is the state an upload session starts in. */
export type MediaKind =
  | 'unknown'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  /** Immigration and residence evidence. Private, small, never public. */
  | 'verificationDocument'
  | 'aiAsset'
  | 'model3D';

/** `MediaAsset.Status`. */
export type MediaStatus = 'pending' | 'processing' | 'ready' | 'quarantined' | 'failed';

/**
 * `MediaVisibility`.
 *
 * `authenticated` is still served through the API and never as a bare bucket
 * URL — the distinction from `public` is who may read, not how.
 */
export type MediaVisibility = 'private' | 'authenticated' | 'public';

/**
 * `ScanStatus`.
 *
 * **`skipped` is not `clean`.** It means this deployment has no scanner
 * registered, and the two are distinct on purpose: a client showing a "verified
 * safe" badge must not show it for a file nothing looked at.
 */
export type MediaScanStatus =
  | 'notScanned'
  | 'scanning'
  | 'clean'
  | 'infected'
  | 'failed'
  | 'skipped';

/** `MediaOwnerType`. What an asset belongs to. */
export type MediaOwnerType =
  | 'unassigned'
  | 'userProfile'
  | 'verification'
  | 'community'
  | 'provider'
  | 'guide'
  | 'communityUpdate'
  | 'job'
  | 'housingListing'
  | 'marketplaceListing'
  | 'event'
  | 'organization'
  | 'message'
  | 'location'
  | 'aiRequest'
  | 'comment';

/** The role an asset plays for its owner. Free-form server-side; these are the documented ones. */
export type MediaRole = 'cover' | 'gallery' | 'avatar' | 'logo' | 'document' | 'attachment';

export interface MediaMetadata {
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  pageCount?: number | null;
  contentHash?: string | null;
  [key: string]: unknown;
}

/**
 * One derived rendition.
 *
 * **Corrected in the Wave E handler pass.** This declared `name` for the
 * rendition's identity; `MediaVariantResponse` calls it **`purpose`**, and the
 * contract names the closed set it may hold — `thumbnail`, `small`, `medium`,
 * `large`, `preview`, `poster`, `transcoded`, `extractedText`. A client reading
 * `variant.name` would have read `undefined` on every variant the platform ever
 * sent. Nothing did, because no deployment produces a variant yet: the only
 * registered processors are a header metadata extractor and a JPEG metadata
 * stripper, so `capabilities.availableVariants` is empty and `variants` is
 * always `[]`. The field was wrong all the same, and would have been found by a
 * screen rather than by a compiler on the day a codec was installed.
 *
 * `contentType` and `sizeBytes` are `required` on the record and are not
 * optional here either.
 */
export interface MediaVariant {
  purpose: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}

/** What an asset is to the thing that owns it. An identifier, an owner and a role. */
export interface MediaReference {
  mediaId: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  role: string;
  /** Order within the role. Zero when the role holds one asset. */
  position: number;
}

/**
 * One digital asset, as every consumer sees it.
 *
 * `url` and `thumbnailUrl` are conveniences over `variants` and are **routes
 * into Media, never provider URLs** — which is what makes changing storage
 * provider invisible here.
 */
export interface MediaAsset {
  mediaId: string;
  kind: MediaKind;
  status: MediaStatus;
  visibility: MediaVisibility;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
  metadata: MediaMetadata;
  variants: MediaVariant[];
  altText: string | null;
  caption: string | null;
  /** What the asset was uploaded for. Null while it is unclaimed. */
  reference: MediaReference | null;
  scanStatus: MediaScanStatus;
  /** Whether reading this asset needs a signed link. */
  requiresSignedAccess: boolean;
  createdAt: string;
}

/**
 * What this deployment can actually do with media.
 *
 * Read rather than assumed. A client that hardcodes the ceiling is a client that
 * lets a member upload 400 MB before finding out, and one that assumes scanning
 * is a client that shows a safety badge it has not earned.
 */
export interface MediaCapabilities {
  /** Largest upload accepted, keyed by media kind. */
  maxUploadBytes: Record<string, number>;
  /** Above this, a chunked session is required. */
  directUploadCeilingBytes: number;
  chunkSizeBytes: number;
  sessionLifetimeHours: number;
  maxConcurrentUploads: number;
  acceptedContentTypes: Record<string, string[]>;
  /** Variant names this deployment can produce. Empty when no codec is registered. */
  availableVariants: string[];
  supportedOperations: Record<string, string[]>;
  /** False when this deployment has no malware scanner registered. */
  malwareScanningEnabled: boolean;
  resumableUploads: boolean;
  signedUrlLifetimeSeconds: number;
}

/** `UploadSessionResponse`. The resumable path's state. */
export interface MediaUploadSession {
  sessionId: string;
  state: 'pending' | 'uploading' | 'paused' | 'completing' | 'completed' | 'cancelled' | 'failed';
  kind: MediaKind;
  fileName: string;
  totalBytes: number;
  receivedBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  receivedChunks: number[];
  expiresAt: string;
  mediaId: string | null;
}

export interface MediaSignedUrl {
  url: string;
  expiresAt: string;
}

/**
 * What a picker hands over.
 *
 * Deliberately the smallest thing an upload needs, rather than an
 * `ImagePicker.ImagePickerAsset` — so the pipeline has one entry point and a
 * caller with a camera result, a document result or a file from anywhere else
 * uses the same one.
 */
export interface LocalFile {
  /** The device URI. `file:///…` on native, a blob or data URI on web. */
  uri: string;
  /** The name the member's device gave it. Sent as-is; the server stores its own safe form. */
  name: string;
  /** The MIME type. Guessed from the extension when the picker does not say. */
  mimeType: string;
  /** Bytes, where the picker reported it. Used to refuse an over-ceiling upload before sending. */
  sizeBytes?: number | null;
}

/**
 * One photograph a member has chosen, as a create screen holds it.
 *
 * The pair exists because the two halves answer different questions and only
 * one of them is sendable. `mediaId` is what goes to the server — the whole
 * point of this wave. `previewUri` is only ever rendered, and starts as the
 * device's own copy because that is the only image that exists while the
 * platform is still deriving renditions.
 *
 * It lives here rather than in each screen because housing and marketplace both
 * hold a cover and a gallery of these, and two definitions of the same pair
 * would be two definitions to drift apart — which is the failure mode this
 * whole remediation is about.
 */
export interface ChosenPhoto {
  /** The platform's identifier for the asset. **This is what gets posted.** */
  mediaId: string;
  /**
   * Something to render *now*.
   *
   * The device's copy until the platform has a rendition of its own, then that.
   * Never posted, never stored — see `MediaAsset.url`, which is a route into
   * Media minted at read time rather than a location.
   */
  previewUri: string;
}

/** Where an upload is, for a progress indicator that is not a lie. */
export type MediaUploadPhase =
  | 'idle'
  /** Bytes are moving. `progress` is meaningful. */
  | 'uploading'
  /**
   * The bytes arrived and the platform is deriving variants.
   *
   * Distinct from `uploading` because the member's *waiting* is not over and a
   * progress bar at 100% that is still spinning is worse than one that says what
   * it is doing.
   */
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface MediaUploadState {
  phase: MediaUploadPhase;
  /** 0–1, and only meaningful while `uploading`. */
  progress: number;
  asset: MediaAsset | null;
  error: string | null;
}
