// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Media, development handlers for the REAL contract
// (Remediation Wave E)
//
// `Diaspora.Modules.Media` serves the upload, asset, capability, content,
// collection and processing routes under `/api/v1/media`. Until this file there
// was **no `/media` handler at all**, so in development every
// `POST /media/uploads/direct` fell through to `mockApi.onAny().passThrough()`
// and hit a network that is not there. Wave E built the whole pipeline and then
// made it unusable under the dev mocks — this closes that.
//
// **Every shape here was read from the .NET source**, not from what
// `lib/media-api.ts` expects:
//
//   UploadEndpoints.cs, MediaAssetEndpoints.cs, MediaCapabilityEndpoints.cs,
//   MediaContentEndpoints.cs, MediaAssetResponse.cs, MediaCapabilitiesResponse.cs,
//   MediaVariantResponse.cs, MediaReferenceResponse.cs, MediaMetadataResponse.cs,
//   SignedUrlResponse.cs, AttachMediaRequest.cs, UpdateMediaRequest.cs,
//   CreateSignedUrlRequest.cs, MediaErrors.cs, MediaErrorCodes.cs,
//   MediaLimits.cs, MediaTypeCatalog.cs, MediaUploadOptions.cs,
//   MediaSecurityOptions.cs, MediaAsset.cs, MediaReference.cs,
//   VirusScanResult.cs, MediaUrlFactory.cs, SignedMediaToken.cs,
//   UploadCoordinator.cs, MediaProcessingPipeline.cs, MediaProcessorRegistry.cs
//   and the six `Domain/Enums` this contract names.
//
// The rule, now proven eight times:
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// That is also why the wire types below are declared here rather than imported
// from `@/types/media`. Typing this file with the client's own types would make
// it impossible for TypeScript to ever show a divergence between the two — the
// mock would agree with the client by construction, which is precisely the
// failure mode. These interfaces are transcribed from the C# records.
//
// ── The six things this file enforces rather than describes ──────────────────
//
//   1. **`/uploads/direct` is multipart or it is nothing.** The route's first
//      statement is `if (!httpRequest.HasFormContentType) return …UploadEmpty`,
//      and its second is the same refusal when `form.Files` is empty. A JSON
//      body — the obvious mistake for anyone adding a sixth upload path — is a
//      400 `media.upload.empty` here, exactly as it is on the server.
//
//   2. **`mediaId` is a GUID, and the route binds it as one.** Every asset route
//      is `{mediaId:guid}`. A non-GUID never reaches a handler; ASP.NET matches
//      no route and answers 404. Reproduced, because `'user-123'`-style
//      identifiers are used all over this codebase and would silently 404 in
//      production while a permissive mock waved them through.
//
//   3. **`scanStatus` is `skipped`, and `malwareScanningEnabled` is false.**
//      `MalwareScanningEnabled = _processors.HasScanner`, and **no
//      `IVirusScanner` implementation exists anywhere in the backend solution** —
//      the interface is declared, referenced by the pipeline and by an
//      architecture test, and implemented by nothing. So the pipeline takes its
//      `candidates.Count == 0` branch and records `VirusScanResult.Skipped`.
//      `skipped` is not `clean`: it means nothing looked at the file. Claiming
//      `clean` here would let a "verified safe" badge be developed against a
//      guarantee the platform does not make.
//
//   4. **An asset is `private`, and nothing in the create flow widens it.**
//      `MediaLimits.DefaultVisibilityFor` returns `Private` for *every* kind —
//      all four switch arms return the same value — so `RequiresSignedAccess`
//      (`Visibility is not Public || Kind is VerificationDocument`) is true, and
//      `url` carries a signed token. The only route that widens visibility is
//      `PATCH /media/{id}` with `visibility`, and no screen calls it. See the
//      note on `coverImage` in `handlers/housing.ts`.
//
//   5. **There are no variants, and `thumbnailUrl` is null.** The registered
//      processors are `HeaderMetadataExtractor` (extractMetadata,
//      validateSignature) and `JpegMetadataStripper` (stripMetadata) and that is
//      the complete list — no imaging library appears in any `.csproj` in the
//      solution. `GetMediaCapabilitiesQueryHandler.AvailableVariants()` asks
//      `_processors.Supports(Image, GenerateThumbnails)`, gets false, and
//      returns an empty list; `MediaUrlFactory.ForThumbnail` returns null when
//      no thumbnail variant exists, "rather than a fallback to the original,
//      deliberately". So this handler advertises `availableVariants: []` and
//      never mints a thumbnail. A mock that produced one would be advertising a
//      rendition the platform cannot make, which is the same lie as the Unsplash
//      fallback this wave removed. `POST /{id}/signed-url` for any variant other
//      than `original` is therefore a 404 `media.variant.not-found`, which is the
//      server's own answer given the same capability set.
//
//   6. **Roles are normalised to lowercase slugs.** `MediaReference.Normalize`
//      lower-cases and slugifies, so the `'Cover'` that `housing/create.tsx`
//      sends comes back as `'cover'`. The comment on that method names the
//      reason: `Cover` versus `cover` versus `coverImage` "is exactly the
//      fragmentation the frontend already suffers from". The listing handlers
//      compare case-insensitively because of it.
//
// ── The one deliberate configuration choice ─────────────────────────────────
//
// `Media:Processing:ProcessInline` defaults to **true**, which means the stock
// deployment runs the whole pipeline before the upload response is written: the
// scan is skipped, `MarkReady` succeeds (`IsSafeToServe` is true for `Skipped`
// as well as `Clean`), and `POST /uploads/direct` answers **`ready` on the first
// response**. A handler that did only that would leave `useMediaUpload`'s
// processing→ready poll completely unexercised in development.
//
// So this handler models a deployment with `ProcessInline: false` — a supported
// setting the module documents for exactly the case where processing is slow —
// and under that setting the honest first status is **`pending`**, not
// `processing`: `MediaAsset` is constructed `Pending`, and `BeginProcessing()`
// is only called by the pipeline, which on that deployment runs on the worker
// afterwards. `MediaAssetStatus` then advances Pending → Processing → Ready, and
// the handler walks an asset along that sequence on successive reads.
//
// That is also what `lib/media-api.ts` and both create screens already say in
// their own comments: "a direct upload answers at `pending` or `processing`".
//
// ── What is deliberately NOT here ───────────────────────────────────────────
//
// **No bytes.** `GET /{id}/content` and `GET /{id}/variants/{variant}` are the
// only two routes on the platform that return bytes rather than the envelope,
// and an axios adapter cannot serve an image to an `<Image src>`. They are left
// unhandled rather than faked, so a screen that renders a media route in
// development shows a broken image — which is true — instead of a stock
// photograph, which is the defect this wave exists to remove.
//
// **No chunked lifecycle.** `POST /media/uploads`, the chunk PUT, complete,
// state and cancel are real routes and `lib/media-api.ts` exposes them, but no
// surface calls them: every picker result in this application is far below the
// 8 MB direct ceiling. `GET /media/uploads` answers an empty list because the
// route exists and its honest answer here is "you have none open".
//
// **No collections and no processing jobs.** Nothing in the client reads them.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

const ROOT = '/media';

/** `ByteSize.BytesPerMegabyte` — 1024 × 1024, not 1,000,000. */
const MB = 1024 * 1024;

type Reply = [number, unknown];

// ── The wire contracts, transcribed ──────────────────────────────────────────
//
// Named exactly as the C# records name them. Two divergences from
// `@/types/media` are visible from here and are reported rather than papered
// over:
//
//   * `MediaVariantResponse` calls the rendition's name **`purpose`**; the
//     client's `MediaVariant` declares `name`. Nothing reads it today (this
//     deployment produces no variants at all), so nothing is broken, but the
//     client type is wrong.
//   * `SignedUrlResponse` carries `mediaId` and `variant` as well as `url` and
//     `expiresAt`; the client's `MediaSignedUrl` declares only the latter two.
//     A subset is harmless, so this handler returns the full record.

interface WireMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  pageCount: number | null;
  orientation: number | null;
  blurHash: string | null;
  contentHash: string | null;
}

interface WireVariant {
  purpose: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

interface WireReference {
  mediaId: string;
  ownerType: string;
  ownerId: string;
  role: string;
  position: number;
}

interface WireAsset {
  mediaId: string;
  kind: string;
  status: string;
  visibility: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
  metadata: WireMetadata;
  variants: WireVariant[];
  altText: string | null;
  caption: string | null;
  reference: WireReference | null;
  scanStatus: string;
  requiresSignedAccess: boolean;
  createdAt: string;
}

// ── Capabilities ─────────────────────────────────────────────────────────────
//
// Composed the way `GetMediaCapabilitiesQueryHandler` composes it: from
// `MediaLimits`, `MediaTypeCatalog`, `MediaUploadOptions`, `MediaSecurityOptions`
// and what the processor registry actually holds. Every number is the source's
// default; none is a guess.

const CAPABILITIES = {
  // `MediaLimits.MaxSizeFor`, for the six kinds the handler enumerates. The
  // verification-document ceiling is 5 MB because the client already says so on
  // screen in two places and Trust's own constant agrees — the source calls it
  // one of the two numbers that "are not choices".
  maxUploadBytes: {
    image: 15 * MB,
    video: 512 * MB,
    audio: 50 * MB,
    document: 25 * MB,
    archive: 100 * MB,
    verificationDocument: 5 * MB,
  } as Record<string, number>,

  directUploadCeilingBytes: 8 * MB,
  chunkSizeBytes: 5 * MB,
  sessionLifetimeHours: 24,
  maxConcurrentUploads: 10,

  acceptedContentTypes: {
    image: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/avif',
      'image/heic',
      'image/heif',
    ],
    video: ['video/mp4', 'video/quicktime', 'video/webm'],
    audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg'],
    document: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ],
    archive: ['application/zip', 'application/x-7z-compressed'],
    // The narrowest list on the platform, and it is the client's own published
    // one: "Supports PDF, PNG, JPG (Max 5MB)".
    verificationDocument: ['application/pdf', 'image/png', 'image/jpeg'],
  } as Record<string, string[]>,

  // Property 5. Empty, because no codec is registered in this deployment.
  availableVariants: [] as string[],

  // `SupportedOperationsFor` filters `Enum.GetValues<ProcessingOperation>()`, so
  // the order is the enum's: ExtractMetadata(0), ValidateSignature(1),
  // StripMetadata(3). `JpegMetadataStripper.CanProcess` accepts Image and
  // VerificationDocument only, which is why those two lists are longer.
  supportedOperations: {
    image: ['extractMetadata', 'validateSignature', 'stripMetadata'],
    video: ['extractMetadata', 'validateSignature'],
    audio: ['extractMetadata', 'validateSignature'],
    document: ['extractMetadata', 'validateSignature'],
    archive: ['extractMetadata', 'validateSignature'],
    verificationDocument: ['extractMetadata', 'validateSignature', 'stripMetadata'],
  } as Record<string, string[]>,

  // Property 3.
  malwareScanningEnabled: false,

  // "True on every deployment: resumption is Media's own behaviour rather than a
  // provider capability."
  resumableUploads: true,

  // `MediaSecurityOptions.SignedUrlMinutes` (15) × 60.
  signedUrlLifetimeSeconds: 900,
};

/** `MediaKind`, camel-cased. `MediaWireNames.Parse` refuses anything else. */
const MEDIA_KINDS = [
  'unknown',
  'image',
  'video',
  'audio',
  'document',
  'archive',
  'verificationDocument',
  'aiAsset',
  'model3D',
];

/** `MediaOwnerType`, camel-cased. `other` is the reserved escape value. */
const OWNER_TYPES = [
  'unassigned',
  'userProfile',
  'verification',
  'community',
  'provider',
  'guide',
  'communityUpdate',
  'job',
  'housingListing',
  'marketplaceListing',
  'event',
  'organization',
  'message',
  'location',
  'aiRequest',
  'comment',
  'other',
];

const VISIBILITIES = ['private', 'authenticated', 'public'];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── The envelope and the problem document ────────────────────────────────────

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/** `PlatformResults.Created` — 201 with the same envelope, no Location header. */
function created(data: unknown): Reply {
  return [201, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

/**
 * `PlatformProblem.Create`, including the `code` extension.
 *
 * The type URI base is `https://diaspora.app/errors/` with the code lower-cased,
 * and `title` is `PlatformResults.TitleFor(error.Type)` — "Validation failed",
 * "Not found", "Forbidden" — rather than the code. `hooks/media.ts` reads
 * `detail` to show the member a sentence, so the detail strings below are the
 * exact ones from `MediaErrors.cs`.
 */
function problem(status: number, code: string, title: string, detail: string): Reply {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title,
      status,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: 'dev',
    },
  ];
}

// The failures this file can actually produce, each one a real `MediaErrors`
// member with its real code, status and sentence.

const uploadEmpty = () =>
  problem(400, 'media.upload.empty', 'Validation failed', 'The file is empty.');

const notAMediaKind = () =>
  problem(400, 'media.upload.type-not-allowed', 'Validation failed', 'That is not a media kind.');

const assetNotFound = () =>
  problem(404, 'media.asset.not-found', 'Not found', 'That file does not exist.');

const assetDeleted = () =>
  problem(404, 'media.asset.deleted', 'Not found', 'That file has been deleted.');

const ownershipRequired = () =>
  problem(403, 'media.asset.ownership-required', 'Forbidden', 'Only the owner of a file can do that.');

const referenceOwnerInvalid = () =>
  problem(400, 'media.reference.owner-invalid', 'Validation failed', 'That is not a valid owner for a file.');

const variantNotFound = () =>
  problem(404, 'media.variant.not-found', 'Not found', 'That version of the file does not exist.');

/**
 * `MediaErrors.TooLarge(actual, limit)`.
 *
 * The direct route measures against the **direct-upload ceiling** rather than
 * the kind ceiling — `UploadCoordinator.UploadDirectAsync` checks
 * `size.Exceeds(ceiling)` with `DirectUploadCeilingMegabytes` before
 * `MediaAsset.Record` ever applies `MaxSizeFor(kind)`. So a 12 MB image is
 * refused by the *direct* limit (8 MB) even though the image limit is 15 MB, and
 * the sentence names 8 MB. Getting that backwards would tell a member their
 * photograph is over a limit it is under.
 */
function tooLarge(actualBytes: number, limitBytes: number): Reply {
  return problem(
    400,
    'media.upload.too-large',
    'Validation failed',
    `That file is ${describeBytes(actualBytes)}; the limit for this kind of file is ${describeBytes(limitBytes)}.`
  );
}

/** `ByteSize.ToString()` — KB below a megabyte, MB above, one decimal place. */
function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${trimZero(bytes / 1024)} KB`;
  return `${trimZero(bytes / MB)} MB`;
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// ── Request reading ──────────────────────────────────────────────────────────

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') {
    const data = config.data;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  }
  try {
    const parsed: unknown = JSON.parse(config.data);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The GUID between `/media/` and the next `/` or `?`, when there is one. */
function mediaIdFrom(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/media\/([^/?]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// ── The multipart body, read defensively ─────────────────────────────────────
//
// `axios-mock-adapter` hands this handler whatever the caller passed, so
// `config.data` for a direct upload is a `FormData`. Which `FormData` depends
// entirely on the runtime: React Native's polyfill stores `{ uri, name, type }`
// parts and exposes `getParts()`; the WHATWG one in Node and on web stores
// `Blob`s and exposes `get()`/`entries()`. Neither is contractual and the shapes
// differ, so everything below **degrades rather than asserts**: a field that
// cannot be read is treated as absent-but-unknowable, not as a refusal.
//
// The single thing that is asserted is the one the server asserts:
// `HasFormContentType`. A body that is not a form at all — a JSON object, a
// string, nothing — is the refusal, and that is decidable in every runtime.

interface FormLike {
  append?: unknown;
  get?: (name: string) => unknown;
  getParts?: () => unknown[];
  entries?: () => Iterable<[string, unknown]>;
}

/**
 * `HttpRequest.HasFormContentType`.
 *
 * True for a real `FormData`, and for anything carrying the duck-typed surface
 * of one — a jest environment may substitute a polyfill that is not
 * `instanceof` the global. Everything else is a non-form body.
 */
function isMultipart(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return true;
  if (typeof data !== 'object') return false;

  const candidate = data as FormLike;
  return typeof candidate.getParts === 'function' || typeof candidate.append === 'function';
}

/** Every `[name, value]` pair we can get at, whichever `FormData` this is. */
function formEntries(data: unknown): [string, unknown][] {
  const form = data as FormLike;
  const entries: [string, unknown][] = [];

  // React Native's polyfill. `_parts` is `[name, value][]`, exposed by
  // `getParts()` as objects carrying a `fieldName`; both are read here because
  // the polyfill's shape has changed between versions and neither is contract.
  if (typeof form.getParts === 'function') {
    try {
      for (const part of form.getParts()) {
        if (part && typeof part === 'object' && 'fieldName' in part) {
          const record = part as Record<string, unknown>;
          entries.push([String(record.fieldName), record.string ?? record]);
        }
      }
      if (entries.length > 0) return entries;
    } catch {
      // Fall through to the WHATWG reading. A polyfill that throws here tells
      // us nothing about the request.
    }
  }

  if (typeof form.entries === 'function') {
    try {
      for (const [name, value] of form.entries()) {
        entries.push([name, value]);
      }
    } catch {
      // Same. Unreadable is not invalid.
    }
  }

  return entries;
}

/** A named text field, when it can be read. `null` means "could not tell". */
function formField(data: unknown, name: string): string | null {
  for (const [key, value] of formEntries(data)) {
    if (key !== name) continue;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof (value as { string?: unknown }).string === 'string') {
      return (value as { string: string }).string;
    }
  }
  return null;
}

interface FormFile {
  name: string | null;
  contentType: string | null;
  /** Only the WHATWG `Blob` knows this. React Native streams from a URI. */
  sizeBytes: number | null;
}

/**
 * `form.Files[0]`, as far as the runtime lets us see it.
 *
 * Returns `undefined` when the form is unreadable — distinct from `null`, which
 * would mean "read it, and there is no file". Only the second is a refusal,
 * because only the second is something the server would refuse.
 */
function formFile(data: unknown): FormFile | null | undefined {
  const entries = formEntries(data);
  if (entries.length === 0) return undefined;

  let sawFileField = false;

  for (const [key, value] of entries) {
    if (key !== 'file') continue;
    sawFileField = true;

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const size = record.size;
      return {
        name: typeof record.name === 'string' ? record.name : null,
        contentType: typeof record.type === 'string' ? record.type : null,
        sizeBytes: typeof size === 'number' ? size : null,
      };
    }
  }

  // The form was readable and carried no file part. `form.Files.Count > 0` is
  // false on the server, and the answer is `UploadEmpty`.
  return sawFileField ? { name: null, contentType: null, sizeBytes: null } : null;
}

// ── The store ────────────────────────────────────────────────────────────────

interface StoredAsset {
  mediaId: string;
  kind: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  visibility: string;
  altText: string | null;
  caption: string | null;
  reference: WireReference | null;
  createdAt: string;
  /**
   * How many times this asset has been read.
   *
   * The whole lifecycle model. `MediaAsset` is constructed `Pending`; the
   * pipeline calls `BeginProcessing()` and then `MarkReady()`. On a deployment
   * with `ProcessInline: false` those two happen on the worker, so a client sees
   * Pending, then Processing, then Ready — which is what a poll is for. Reads
   * advance it here; nothing else does, so an `attach` or a `PATCH` between two
   * polls does not skip the member's photograph forward.
   */
  reads: number;
  deleted: boolean;
}

const assets = new Map<string, StoredAsset>();

let sequence = 0;

/**
 * A GUID-shaped identifier.
 *
 * Shaped, not random: every asset route is `{mediaId:guid}` and a value that
 * does not parse never reaches a handler. Deterministic so that a development
 * log reads the same way twice; version nibble `4` and variant nibble `8` so it
 * is a well-formed v4 rather than something that merely matches a regex.
 */
function newMediaId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/**
 * `MediaAssetStatus`, from how many times the asset has been read.
 *
 * See the header. Pending is what a direct upload answers on a deployment that
 * processes on the worker; the first read finds it Processing and the second
 * finds it Ready, which terminates `useMediaUpload`'s poll on its second attempt
 * — around three seconds, which is roughly what a real thumbnail costs.
 */
function statusOf(asset: StoredAsset): string {
  if (asset.deleted) return 'deleted';
  if (asset.reads <= 0) return 'pending';
  if (asset.reads === 1) return 'processing';
  return 'ready';
}

/**
 * `MediaUrlFactory.ForVariant(asset, Original)`.
 *
 * A route into Media — `/api/v1/media/{id}/content` — and never a provider URL.
 * That is the property that "makes provider migration invisible to consumers",
 * and it is why nothing downstream may store this string.
 *
 * The token is appended because `RequiresSignedAccess` is true for every asset
 * this deployment creates (see property 4). Its parameter names are the frozen
 * ones from `SignedMediaToken`: `v`, `exp`, `aud`, `sig`. `aud` is omitted
 * because this adapter has no signed-in user to bind to, and `sig` is a marker
 * rather than a plausible-looking HMAC: the adapter holds no signing key, and a
 * hex string here would suggest the link resolves. It does not — no route in
 * this file serves bytes.
 */
function contentUrl(mediaId: string, requiresSignedAccess: boolean): string {
  const path = `/api/v1/media/${mediaId}/content`;
  if (!requiresSignedAccess) return path;

  const expiresAt = Math.floor(Date.now() / 1000) + CAPABILITIES.signedUrlLifetimeSeconds;
  return `${path}?v=original&exp=${expiresAt}&sig=development-not-signed`;
}

/** `MediaMapper.ToResponse`. */
function toResponse(asset: StoredAsset): WireAsset {
  // `MediaAsset.RequiresSignedAccess`: anything not public, and every
  // verification document regardless of its visibility.
  const requiresSignedAccess =
    asset.visibility !== 'public' || asset.kind === 'verificationDocument';

  return {
    mediaId: asset.mediaId,
    kind: asset.kind,
    status: statusOf(asset),
    visibility: asset.visibility,
    contentType: asset.contentType,
    // "The name the member gave it, not the sanitised storage form."
    fileName: asset.fileName,
    sizeBytes: asset.sizeBytes,
    url: contentUrl(asset.mediaId, requiresSignedAccess),
    // Property 5. Null, always, on a deployment with no image codec.
    thumbnailUrl: null,
    // Every field null rather than invented. This adapter never receives the
    // bytes — React Native streams the file from a device URI that means nothing
    // in this process — so it cannot know the dimensions and cannot compute the
    // SHA-256 the real pipeline computes. A fabricated `contentHash` would be
    // worse than a null one: Trust's reuse detection reads it.
    metadata: {
      width: null,
      height: null,
      durationSeconds: null,
      pageCount: null,
      orientation: null,
      blurHash: null,
      contentHash: null,
    },
    variants: [],
    altText: asset.altText,
    caption: asset.caption,
    reference: asset.reference,
    // Property 3.
    scanStatus: 'skipped',
    requiresSignedAccess,
    createdAt: asset.createdAt,
  };
}

/** `MediaReference.Normalize` — lower-cased, slugified, `attachment` when blank. */
export function normaliseMediaRole(role: unknown): string {
  if (typeof role !== 'string' || role.trim().length === 0) return 'attachment';

  return role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

export function setupMediaMocks(mock: MockAdapter): void {
  // ── Capabilities ──────────────────────────────────────────────────────────
  //
  // First. `axios-mock-adapter` matches in registration order and a broader
  // `/media/{something}` pattern below would otherwise capture it.

  mock.onGet(new RegExp(`${ROOT}/capabilities$`)).reply(() => ok(CAPABILITIES));

  // ── The direct upload ─────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/uploads/direct$`)).reply((config) => {
    // Property 1. The route's first line. A JSON body never reaches the
    // command handler on the server, and it does not reach the store here.
    if (!isMultipart(config.data)) {
      return uploadEmpty();
    }

    const file = formFile(config.data);

    // `null` is "the form was readable and had no file part" — the server's
    // `form.Files.Count > 0 ? … : null` followed by `if (file is null)`.
    // `undefined` is "this runtime would not let us look", which is not a
    // refusal the server would make and so is not one made here.
    if (file === null) {
      return uploadEmpty();
    }

    // `form["kind"].FirstOrDefault() ?? "image"`, then
    // `MediaWireNames.Parse<MediaKind>` — case-insensitive, and an unknown value
    // is refused rather than defaulted, "because a typo silently becoming
    // Unknown is how an upload ends up with the wrong size ceiling".
    const declaredKind = formField(config.data, 'kind');
    const kind =
      declaredKind === null
        ? 'image'
        : MEDIA_KINDS.find((known) => known.toLowerCase() === declaredKind.trim().toLowerCase());

    if (!kind) {
      return notAMediaKind();
    }

    // The owner fields, when the caller supplied them. `ownerId` binds through
    // `Guid.TryParse(...) ? owner : null`, so a non-GUID becomes *absent* rather
    // than invalid — and a type without an id is then the half-specified owner
    // `ResolveOwner` refuses. That path is worth reproducing precisely because
    // this codebase is full of `'user-123'`-shaped identifiers: sending one as
    // `ownerId` is a 400, not a silent unowned upload.
    const ownerType = formField(config.data, 'ownerType');
    const rawOwnerId = formField(config.data, 'ownerId');
    const ownerId = rawOwnerId !== null && GUID.test(rawOwnerId) ? rawOwnerId : null;

    if ((ownerType !== null && ownerId === null) || (ownerType === null && ownerId !== null)) {
      return referenceOwnerInvalid();
    }

    if (ownerType !== null && !OWNER_TYPES.some((known) => known.toLowerCase() === ownerType.toLowerCase())) {
      return referenceOwnerInvalid();
    }

    // The ceiling, where the size is knowable. It is knowable for a WHATWG
    // `Blob` and never for a React Native `{ uri, name, type }` part, which the
    // bridge streams from the filesystem — the server measures the bytes it
    // received, and this adapter receives none.
    const sizeBytes = file?.sizeBytes ?? null;

    if (sizeBytes !== null && sizeBytes > CAPABILITIES.directUploadCeilingBytes) {
      return tooLarge(sizeBytes, CAPABILITIES.directUploadCeilingBytes);
    }

    // `MediaAsset.Record` refuses a zero-byte file outright.
    if (sizeBytes === 0) {
      return uploadEmpty();
    }

    const mediaId = newMediaId();
    const fileName = file?.name ?? 'upload';

    const stored: StoredAsset = {
      mediaId,
      kind,
      contentType: file?.contentType ?? 'application/octet-stream',
      fileName,
      // Zero would trip the empty check on read and a round number would look
      // measured. This adapter genuinely does not know, and the field is
      // non-nullable on the contract, so it reports the one honest lower bound
      // it has: the size the caller declared, or nothing.
      sizeBytes: sizeBytes ?? 0,
      // Property 4. `MediaLimits.DefaultVisibilityFor` returns Private for every
      // kind. Nothing in the create flow widens it.
      visibility: 'private',
      altText: null,
      caption: null,
      reference:
        ownerType !== null && ownerId !== null
          ? {
              mediaId,
              ownerType,
              ownerId,
              // `AttachTo(owner, role ?? MediaReferenceRoles.Attachment)`.
              role: normaliseMediaRole(formField(config.data, 'role')),
              position: 0,
            }
          : null,
      createdAt: new Date().toISOString(),
      reads: 0,
      deleted: false,
    };

    assets.set(mediaId, stored);

    // `PlatformResults.Created` — 201.
    return created(toResponse(stored));
  });

  // ── The chunked lifecycle ─────────────────────────────────────────────────
  //
  // Only the list, and only so that `/media/uploads` is not swallowed by the
  // non-GUID guard below. The route is real, `ListMyUploadsQuery` returns the
  // caller's open sessions, and this deployment has none because nothing here
  // opens one.

  mock.onGet(new RegExp(`${ROOT}/uploads$`)).reply(() => ok([]));

  // ── Attachments ───────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/attachments$`)).reply((config) => {
    const payload = body(config);

    // `AttachMediaRequest.MediaId` is a `required Guid`. A missing or non-GUID
    // value fails model binding before the handler runs.
    const mediaId = typeof payload.mediaId === 'string' ? payload.mediaId : '';
    if (!GUID.test(mediaId)) {
      return referenceOwnerInvalid();
    }

    const asset = assets.get(mediaId);
    if (!asset) return assetNotFound();
    if (asset.deleted) return assetDeleted();

    const ownerType = typeof payload.ownerType === 'string' ? payload.ownerType : '';
    const ownerId = typeof payload.ownerId === 'string' ? payload.ownerId : '';

    // `ResolveOwner`: both or neither, and the type must parse.
    if (
      !GUID.test(ownerId) ||
      !OWNER_TYPES.some((known) => known.toLowerCase() === ownerType.toLowerCase())
    ) {
      return referenceOwnerInvalid();
    }

    const role = normaliseMediaRole(payload.role);
    const position = typeof payload.position === 'number' && payload.position > 0 ? payload.position : 0;

    // `MediaAsset.AttachTo` refuses a re-attach to a *different* owner, and the
    // reason is worth reproducing: an asset that could be moved between owners
    // is "the housing listing's photo silently becoming a marketplace listing's
    // photo, with a different audience".
    //
    // It is also the refusal that catches the redundant second claim. Housing,
    // Marketplace, Community and Organizations all take media identifiers inline
    // on their own create calls, so a screen that *also* posts here is claiming
    // the same asset twice — harmless when the owner matches, a 403 when it does
    // not.
    if (
      asset.reference &&
      (asset.reference.ownerType.toLowerCase() !== ownerType.toLowerCase() ||
        asset.reference.ownerId !== ownerId)
    ) {
      return ownershipRequired();
    }

    asset.reference = { mediaId, ownerType, ownerId, role, position };

    // 200, not 201: `MapPost("/attachments")` ends in `PlatformResults.Ok`.
    return ok(toResponse(asset));
  });

  // ── Signed links ──────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/[^/]+/signed-url$`)).reply((config) => {
    const mediaId = mediaIdFrom(config.url);

    // The route is `{mediaId:guid}`; a non-GUID matches no route at all.
    if (!mediaId || !GUID.test(mediaId)) return assetNotFound();

    const asset = assets.get(mediaId);
    if (!asset) return assetNotFound();
    if (asset.deleted) return assetDeleted();

    const payload = body(config);
    const variant = typeof payload.variant === 'string' && payload.variant.trim().length > 0
      ? payload.variant.trim()
      : 'original';

    // `if (purpose is not Original && !asset.HasVariant(purpose)) return VariantNotFound`.
    // This deployment has no variants, so every non-original request is a 404 —
    // which is the same answer the server gives with the same capability set,
    // and is consistent with the empty `availableVariants` above.
    if (variant.toLowerCase() !== 'original') {
      return variantNotFound();
    }

    // `SignedUrlLifetime`: fifteen minutes generally, ten for a verification
    // document — "matched to Trust's own DocumentLinkFactory.LinkLifetime",
    // because "a link that outlives the page it was rendered on is a link that
    // ends up pasted into a support ticket".
    const lifetimeSeconds = asset.kind === 'verificationDocument' ? 600 : CAPABILITIES.signedUrlLifetimeSeconds;
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();

    // `SignedUrlResponse` — four fields, not two.
    return ok({
      mediaId,
      url: `/api/v1/media/${mediaId}/content?v=original&exp=${Math.floor(
        Date.parse(expiresAt) / 1000
      )}&sig=development-not-signed`,
      variant: 'original',
      expiresAt,
    });
  });

  // ── One asset ─────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/[0-9a-fA-F-]{36}$`)).reply((config) => {
    const mediaId = mediaIdFrom(config.url);
    if (!mediaId || !GUID.test(mediaId)) return assetNotFound();

    const asset = assets.get(mediaId);
    if (!asset) return assetNotFound();

    // `GetMediaQuery` on a soft-deleted asset: the row survives for audit and
    // the read answers `AssetDeleted`, which is a 404 with its own code so a
    // client can tell "never existed" from "was removed".
    if (asset.deleted) return assetDeleted();

    // The lifecycle advances here and only here. See `StoredAsset.reads`.
    asset.reads += 1;

    return ok(toResponse(asset));
  });

  mock.onPatch(new RegExp(`${ROOT}/[0-9a-fA-F-]{36}$`)).reply((config) => {
    const mediaId = mediaIdFrom(config.url);
    if (!mediaId || !GUID.test(mediaId)) return assetNotFound();

    const asset = assets.get(mediaId);
    if (!asset) return assetNotFound();
    if (asset.deleted) return assetDeleted();

    const payload = body(config);

    // `MediaAsset.Describe` assigns both unconditionally and truncates — it does
    // not merge. Sending only `caption` therefore *clears* `altText` on the real
    // server, which is a genuine sharp edge in the contract and is reproduced
    // rather than smoothed over.
    asset.altText = truncate(payload.altText, 500);
    asset.caption = truncate(payload.caption, 1000);

    if (typeof payload.visibility === 'string' && payload.visibility.trim().length > 0) {
      const visibility = VISIBILITIES.find(
        (known) => known.toLowerCase() === String(payload.visibility).trim().toLowerCase()
      );

      // Surprising, and taken from the source rather than guessed at: an
      // unparseable visibility is returned as `media.asset.access-denied` with
      // the sentence "That is not a visibility level." — a validation failure
      // wearing an access-denied code. It is a 400 because
      // `Error.Validation` decides the status, not the code.
      if (!visibility) {
        return problem(
          400,
          'media.asset.access-denied',
          'Validation failed',
          'That is not a visibility level.'
        );
      }

      // `MediaLimits.CanBePublic` — a verification document may not be made
      // public "at any tier, by any grant", and the refusal comes back as
      // `media.signed-url.not-permitted`, which is a Forbidden.
      if (visibility === 'public' && asset.kind === 'verificationDocument') {
        return problem(
          403,
          'media.signed-url.not-permitted',
          'Forbidden',
          'Signed links cannot be issued for that file.'
        );
      }

      asset.visibility = visibility;
    }

    return ok(toResponse(asset));
  });

  mock.onDelete(new RegExp(`${ROOT}/[0-9a-fA-F-]{36}$`)).reply((config) => {
    const mediaId = mediaIdFrom(config.url);
    if (!mediaId || !GUID.test(mediaId)) return assetNotFound();

    const asset = assets.get(mediaId);
    if (!asset) return assetNotFound();

    // "Soft: the record survives for audit." `Delete` is idempotent — a second
    // call returns success rather than a 404 — so the UI is never left showing
    // an error for something that is already gone.
    asset.deleted = true;

    // `PlatformResults.Ok(context, Result)` — the non-generic overload, which
    // writes `{ data: null, meta }` at 200 rather than a 204.
    return ok(null);
  });

  // ── The route constraint ──────────────────────────────────────────────────
  //
  // Property 2, and it must be last of the `/media/{x}` patterns so it shadows
  // nothing above it. Every asset route is `{mediaId:guid}`: a non-GUID matches
  // no route, so ASP.NET answers 404 before any handler runs. Without this the
  // request would fall through to `mockApi.onAny().passThrough()` and fail as a
  // network error, which looks nothing like what production does.

  // Anchored, unlike the routes above it. This is the only pattern here broad
  // enough to capture a path it was not written for — `/conversations/{id}/media/{x}`
  // ends the same way — and a guard that over-matches turns an unrelated route
  // into a 404 that looks like a platform answer. Anchoring means a URL this
  // does not recognise falls through to the passthrough, which is where it was
  // going before this file existed.
  const nonGuidMediaPath = new RegExp(`^${ROOT}/[^/?]+$`);

  mock.onGet(nonGuidMediaPath).reply(() => assetNotFound());
  mock.onPatch(nonGuidMediaPath).reply(() => assetNotFound());
  mock.onDelete(nonGuidMediaPath).reply(() => assetNotFound());
}

/** `MediaAsset.Truncate` — null for blank, hard cut at the limit. */
function truncate(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

/**
 * The route form for an asset's bytes, for a handler that has to store a string.
 *
 * `MediaUrlFactory` mints `/api/v1/media/{id}/content`, and this is that path
 * without a token. Exported for `handlers/housing.ts` and
 * `handlers/marketplace.ts`, which hold listing shapes with a non-nullable
 * `coverImage: string` and must put *something* in it for a listing that has a
 * photograph.
 *
 * It is deliberately not a signed URL. A signed link is caller-bound and expires
 * in fifteen minutes, and `MediaAssetResponse`'s own summary is that no business
 * module stores a URL at all — a real consumer holds the `mediaId` and reads
 * `MediaAsset.url`, minted per request. The route form is the least-wrong thing
 * a `string` field can hold: it is stable, it is a route into Media rather than
 * a storage location, and it resolves for a public asset.
 *
 * It will not render in development, because nothing serves bytes here. That is
 * the correct outcome — see the header.
 */
export function mediaContentPath(mediaId: string): string {
  return `/api/v1/media/${mediaId}/content`;
}
