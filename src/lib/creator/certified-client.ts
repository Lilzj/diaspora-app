// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy, certified arm (Remediation Wave C-03)
//
// `lib/creator-gap-api.ts` opens by saying, correctly for its time:
//
//   > ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   >   BACKEND. See `src/config/creator-gaps.ts`. ⚠
//
// `Diaspora.Modules.Creator` now serves thirty-one of them, under six prefixes
// the register itself chose — `/api/v1/creators`, `/challenges`, `/grants`,
// `/academy`, `/referrals`, `/rewards`. `CreatorModuleMetadata` says so in as
// many words: "the whole point of closing a gap is that the client's
// `/creator-gap/v0` prefix becomes these and nothing else moves."
//
// This file is the client that makes that true. It is deliberately separate
// from `creator-gap-api.ts`, which still owns the capabilities the backend
// genuinely does not serve — the dashboard summary, the creator reputation
// projection, creator analytics, creator recommendations and the
// sponsored-content view. Those stay simulated, stay marked, and stay behind
// `/creator-gap/v0`.
//
// **Revenue and earnings left that list.** `Diaspora.Modules.Creator` now
// records an earning against every payment it can attribute and serves both
// `/creators/me/earnings` and `/creators/me/revenue/summary`. The mapping is
// substantial enough to want its own file and its own reasoning, so it lives in
// `lib/creator-earning-api.ts` and is re-exported at the foot of this one — one
// import surface for the hooks, two files for two sets of decisions.
//
// ── Seven things the register could not have known ───────────────────────────
//
// Each was found by reading `Diaspora.Modules.Creator` rather than by trusting
// the declared contract, and each would have produced a broken screen.
//
// **1. Enum wire casing is PascalCase, with one deliberate exception.** The
// mapper is `.ToString()` on the enum throughout — `CreatorMilestoneResponse`,
// `GrantApplicationResponse`, `CreatorCourseResponse.Level`,
// `CreatorLessonResponse.Kind`, `GrantApplicationFieldResponse.Kind`. The
// exception is lesson content: `LessonBlockResponse.Kind` is mapped through an
// explicit `switch` to lower case, and `Tone` is `.ToString().ToLowerInvariant()`.
// So `state` is `Completed` and `kind` is `heading`, on the same payload, and
// both are correct. The client's own unions were written lower-case for
// `CourseLevel`, `LessonKind` and `GrantFieldKind` and PascalCase for
// everything else, so exactly those three are folded here and nothing else is.
//
// **2. `GET /rewards/rules` does not return an array.** It returns
// `{ rules, catalogueVersion, expiryPolicy, expiryDescription, updatedAt }`, and
// `GET /rewards/catalogue` likewise returns `{ rewards, catalogueVersion,
// availablePoints, updatedAt }`. Both were declared in the register as bare
// lists. A client reading `data` as an array gets `undefined.map` — or, if it
// went through `readPage`, an empty page with no error at all. Both row names
// are recorded in `backend-row-property-drift.test.ts`.
//
// **3. A grant declaration is accepted by KEY, and the client was sending the
// text.** `GrantApplication.SaveAnswers` matches `acceptedDeclarations` against
// `grant.Declarations[].Key`; the served form carries `{ key, text }` pairs. The
// client's `GrantApplicationForm.declarations` was `string[]` and the grant
// screen posted the sentences the member had read. Against the real backend
// every submission would have been refused with `GrantDeclarationRequired` — a
// refusal the member cannot act on, on the last screen of a funding
// application. The frontend type now carries the pair; the screen renders
// `text` and sends `key`.
//
// **4. Idempotency is accepted in the body *and* in the header, and the header
// wins.** `CreatorIdempotency.Normalise(operation, header, body)` prefers the
// header and scopes the result by operation. This is worth stating because
// Automation ships no header reader at all and requires the key in the body,
// while this module ships `IdempotencyHeader` and reads both — a developer
// generalising from either one alone would break the other. Both are sent here:
// the body field because every Phase 7 mutation already carries it, the header
// because it is the one the server prefers and the one a gateway can log.
//
// **5. Money is `{ minorUnits, currency, exponent }` and carries no `amount`.**
// The client's `Money` requires one. `fromMinorUnits` is the single place that
// derives it, which is display arithmetic over a served figure rather than the
// client deciding an amount.
//
// **6. `GrantApplicationResponse` names attachments `attachmentIds: string[]`,**
// not the evidence records the client's type declared. The client held
// `CreatorVerificationEvidence[]`, which has a server-issued `label`, a `status`
// and an `uploadedAt` — three fields this route does not serve and which a
// client must not invent. The frontend type now carries the identifiers.
//
// **7. `reach` is served as zero with `reachAvailable: false` beside it.**
// `CreatorAudienceResponse` says so outright: reach is an audience measurement,
// it belongs to CREATOR-GAP-007, and B19 has not landed. The flag is carried
// through so a screen can say "not measured" rather than printing a zero that
// reads as "nobody". This is NG-39: a field that answers 200 and is switched
// off.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';
import { FinancialError, toFinancialError } from '../financial-errors';
import { fromMinorUnits } from '../money';
import type { Money } from '@/types/financial';
import type {
  CommunityGrant,
  CreatorAcademySection,
  CreatorCertificate,
  CreatorChallenge,
  CreatorCourse,
  CreatorCourseProgress,
  CreatorLeaderboard,
  CreatorLesson,
  CreatorMilestone,
  CreatorPointRule,
  CreatorProfile,
  CreatorReferralPage,
  CreatorReferralProgramme,
  CreatorReward,
  CreatorRewardRedemption,
  CreatorVerification,
  GrantApplication,
  GrantApplicationField,
  GrantApplicationForm,
  LessonBlock,
  LessonQuizResult,
  PublicCreator,
  SignupBonus,
  SubmitCreatorVerificationRequest,
  SubmitGrantApplicationRequest,
} from '@/types/creator-economy';
import type { CreatorDirectoryPage, UpdateCreatorProfileRequest } from '../creator-gap-api';

// ─────────────────────────────────────────────────────────────────────────────
// Transport
//
// No `assertEnabled`. These are certified routes and they must answer in a
// release build — that is the whole difference between this file and the gap
// arm, and it is why the two are separate modules rather than one module with a
// flag in it.
// ─────────────────────────────────────────────────────────────────────────────

interface Envelope<T> {
  data: T;
}

/** The platform envelope's `data`, or a transport failure classified as a read. */
async function read<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(path, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the financial client does, so
 * a transport failure on a grant submission becomes an *indeterminate* outcome
 * rather than a failed one. "Did my grant application send?" is precisely the
 * question a member must never be left guessing at.
 *
 * `idempotencyKey` is sent as a header as well as in the body when the caller
 * supplied one, because the server prefers the header and a gateway that
 * retries can only see the header.
 */
async function write<T>(
  method: 'post' | 'put',
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  try {
    const config =
      idempotencyKey === undefined || idempotencyKey === ''
        ? undefined
        : { headers: { 'Idempotency-Key': idempotencyKey } };

    const response =
      method === 'put'
        ? await apiClient.put<Envelope<T>>(path, body, config)
        : await apiClient.post<Envelope<T>>(path, body, config);

    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire shapes
//
// Declared rather than inferred, because the point of this file is that the
// two shapes are *different* and a structural `as` cast would hide exactly the
// differences it exists to reconcile. Only the fields that are read are
// declared; the module serves several more (`statusPolicyVersion`,
// `contentVersion`, `hasBeenRevised`, `viewerIsOptedOut`) which the client has
// nowhere to render yet and which are deliberately not invented a home for.
// ─────────────────────────────────────────────────────────────────────────────

interface WireMoney {
  minorUnits: number;
  currency: string;
  exponent: number;
}

interface WireCourse {
  courseId: string;
  slug: string;
  title: string;
  summary: string;
  sectionKey?: string | null;
  level: string;
  estimatedMinutes: number;
  coverImageUrl?: string | null;
  icon?: string | null;
  tags: string[];
  lessonCount: number;
  awardsCertificate: boolean;
  awardsBadgeKey?: string | null;
  /** Slugs on the wire; the client's field is named `prerequisiteCourseIds`. */
  prerequisiteCourseSlugs: string[];
  progress?: CreatorCourseProgress | null;
  isSaved: boolean;
  sortOrder: number;
}

interface WireLessonBlock {
  kind: string;
  text?: string | null;
  title?: string | null;
  tone?: string | null;
  ordered?: boolean | null;
  route?: string | null;
  items?: string[] | null;
}

interface WireLesson {
  lessonId: string;
  courseId: string;
  title: string;
  kind: string;
  estimatedMinutes: number;
  blocks: WireLessonBlock[];
  quiz?: CreatorLesson['quiz'];
  isComplete: boolean;
  completedAt?: string | null;
  sortOrder: number;
}

interface WireGrantField {
  key: string;
  label: string;
  helpText?: string | null;
  kind: string;
  isRequired: boolean;
  maxLength?: number | null;
  options?: { value: string; label: string }[] | null;
}

interface WireGrantForm {
  grantId: string;
  fields: WireGrantField[];
  declarations: { key: string; text: string }[];
  allowsAttachments: boolean;
  allowsAmountRequest: boolean;
}

interface WireGrant extends Omit<CommunityGrant, 'fundingAmount' | 'fundingMinimum' | 'fundingMaximum'> {
  fundingAmount: WireMoney;
  fundingMinimum?: WireMoney | null;
  fundingMaximum?: WireMoney | null;
}

interface WireGrantApplication
  extends Omit<GrantApplication, 'requestedAmount' | 'awardedAmount'> {
  requestedAmount?: WireMoney | null;
  awardedAmount?: WireMoney | null;
}

interface WirePointRules {
  rules: CreatorPointRule[];
  catalogueVersion: string;
  expiryPolicy: string;
  expiryDescription: string;
  updatedAt: string;
}

interface WireRewardCatalogue {
  rewards: CreatorReward[];
  catalogueVersion: string;
  availablePoints: number;
  updatedAt: string;
}

interface WireDirectoryPage {
  /** Named `creators`, not `items`. See the row-property ledger. */
  creators: PublicCreator[];
  nextCursor?: string | null;
  hasMore: boolean;
}

interface WireReferralPage {
  /** Named `referrals`, not `items`. See the row-property ledger. */
  referrals: CreatorReferralPage['referrals'];
  nextCursor?: string | null;
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Folds a PascalCase enum name to the lower-camel form the client's union uses.
 *
 * Applied to exactly three fields — `CourseLevel`, `LessonKind` and
 * `GrantFieldKind` — because those are the three whose client-side unions were
 * written lower-case. Every other enum on this module's wire is PascalCase on
 * both sides and is passed through untouched: folding them would turn
 * `Completed` into `completed` and silently fail every `state === 'Completed'`
 * comparison in the app.
 *
 * `LongText` becomes `longText` rather than `longtext`, which is why this is a
 * first-character fold and not a `toLowerCase()`.
 */
function foldEnum(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function toMoney(value: WireMoney | null | undefined): Money | null {
  if (!value) return null;
  return fromMinorUnits(value.minorUnits, value.currency, value.exponent);
}

/**
 * One served content block as the viewer's discriminated union.
 *
 * The wire kind is already lower-case — the mapper spells the seven out rather
 * than calling `.ToString()` — so the discriminant matches without folding. What
 * this does have to do is fill the fields each arm requires from the flat
 * record the wire carries, and refuse anything outside the closed set.
 *
 * An unrecognised kind becomes a paragraph rather than being dropped, which is
 * what the server does with one on the way out. A dropped block would leave a
 * lesson silently missing a step; a paragraph shows the text.
 */
function toLessonBlock(block: WireLessonBlock): LessonBlock {
  const text = block.text ?? '';

  switch (block.kind) {
    case 'heading':
      return { kind: 'heading', text };
    case 'list':
      return { kind: 'list', ordered: block.ordered ?? false, items: block.items ?? [] };
    case 'callout':
      return {
        kind: 'callout',
        // The one enum this module lower-cases on the way out, so it arrives
        // ready. Anything unexpected renders as information rather than as a
        // warning: guessing "warning" would put a red block on a neutral note.
        tone:
          block.tone === 'success' || block.tone === 'warning' ? block.tone : 'info',
        title: block.title ?? undefined,
        text,
      };
    case 'checklist':
      return { kind: 'checklist', items: block.items ?? [] };
    case 'quote':
      // `attribution` has no field on the wire. Absent rather than filled from
      // `title`, which is the callout's heading and would print a section name
      // where a person's name belongs.
      return { kind: 'quote', text };
    case 'action':
      // A route is required by the union and by the renderer. Without one there
      // is nothing to navigate to, so it degrades to the paragraph the text
      // already reads as rather than a button that goes nowhere.
      return block.route
        ? { kind: 'action', label: block.title ?? text, route: block.route, description: block.title ? text : undefined }
        : { kind: 'paragraph', text };
    case 'paragraph':
    default:
      return { kind: 'paragraph', text };
  }
}

function toCourse(course: WireCourse): CreatorCourse {
  const { prerequisiteCourseSlugs, level, ...rest } = course;
  return {
    ...rest,
    level: foldEnum(level),
    // The server identifies a prerequisite by slug. The client's field is named
    // `prerequisiteCourseIds` and is rendered as a notice rather than resolved
    // to a course, so the rename is the whole of the adaptation — but the name
    // is left alone rather than corrected, because renaming it would touch
    // every Academy screen for no behavioural gain.
    prerequisiteCourseIds: prerequisiteCourseSlugs,
  };
}

function toLesson(lesson: WireLesson): CreatorLesson {
  return {
    ...lesson,
    kind: foldEnum(lesson.kind),
    blocks: lesson.blocks.map(toLessonBlock),
  };
}

function toGrantField(field: WireGrantField): GrantApplicationField {
  return { ...field, kind: foldEnum(field.kind) };
}

function toGrantForm(form: WireGrantForm): GrantApplicationForm {
  return {
    grantId: form.grantId,
    fields: form.fields.map(toGrantField),
    declarations: form.declarations,
    allowsAttachments: form.allowsAttachments,
    allowsAmountRequest: form.allowsAmountRequest,
  };
}

function toGrant(grant: WireGrant): CommunityGrant {
  return {
    ...grant,
    fundingAmount: toMoney(grant.fundingAmount) ?? fromMinorUnits(0, 'GBP', 2),
    fundingMinimum: toMoney(grant.fundingMinimum),
    fundingMaximum: toMoney(grant.fundingMaximum),
  };
}

function toGrantApplication(application: WireGrantApplication): GrantApplication {
  return {
    ...application,
    requestedAmount: toMoney(application.requestedAmount),
    awardedAmount: toMoney(application.awardedAmount),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-001 — the creator projection
//
// `CreatorProfileEndpoints`, `CreatorDiscoveryEndpoints`
// (Api/CreatorEndpoints.cs:22, :31, :236, :204).
// ═════════════════════════════════════════════════════════════════════════════

export function fetchCreatorProfile(): Promise<CreatorProfile> {
  return read<CreatorProfile>('/creators/me');
}

/**
 * Edits the creator-facing fields.
 *
 * **`displayName` is not sent.** `UpdateCreatorProfileRequest` on the server
 * carries bio, categories, expertise, languages, coverImageUrl and
 * isDiscoverable and nothing else — the display name is Identity's, and a field
 * the server does not bind is a field the member watches revert. The client's
 * request type keeps it because the gap adapter accepted it; it is dropped here
 * rather than sent and ignored.
 */
export function updateCreatorProfile(request: UpdateCreatorProfileRequest): Promise<CreatorProfile> {
  const { bio, categories, expertise, languages, coverImageUrl, isDiscoverable } = request;
  return write<CreatorProfile>('put', '/creators/me', {
    bio,
    categories,
    expertise,
    languages,
    coverImageUrl,
    isDiscoverable,
  });
}

export function fetchPublicCreator(creatorId: string): Promise<PublicCreator> {
  return read<PublicCreator>(`/creators/${creatorId}`);
}

/**
 * `CreatorDirectoryResponse` as the client's directory page.
 *
 * **Named and exported because the row-property ledger points at it.** The rows
 * are `creators`, not `items`, so `readPage` would key on `payload.items`, find
 * nothing, and return an empty page with **no error at all** — a directory that
 * renders "no creators found" for every search. `backend-row-property-drift.test.ts`
 * asserts this function exists, which is what stops the adapter being quietly
 * inlined and then quietly replaced with a `readPage` call.
 */
export function toCreatorDirectoryPage(page: WireDirectoryPage): CreatorDirectoryPage {
  return {
    creators: page.creators ?? [],
    nextCursor: page.nextCursor ?? null,
    hasMore: page.hasMore ?? false,
  };
}

export async function fetchCreatorDirectory(params: {
  query?: string;
  country?: string;
  category?: string;
  expertise?: string;
  language?: string;
  verified?: boolean;
  cursor?: string;
  take?: number;
}): Promise<CreatorDirectoryPage> {
  return toCreatorDirectoryPage(await read<WireDirectoryPage>('/creators', params));
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-002 — the creator-programme verification
//
// `CreatorVerificationEndpoints` (Api/CreatorEndpoints.cs:52, :60, :68, :81, :98).
// The reviewer's `/verification/{id}/decide` is deliberately not exposed here:
// it needs `creator:verification:review`, which no member screen holds, and a
// client function for it would be a control nothing may press.
// ═════════════════════════════════════════════════════════════════════════════

export function fetchCreatorVerification(): Promise<CreatorVerification> {
  return read<CreatorVerification>('/creators/me/verification');
}

export function startCreatorVerification(): Promise<CreatorVerification> {
  return write<CreatorVerification>('post', '/creators/me/verification');
}

/**
 * Attaches supporting material.
 *
 * **A kind, and nothing else.** `AttachCreatorEvidenceRequest` carries one
 * required `Kind` — no file, no URI, no document number and, since a test caught
 * it on the server, no client-supplied label either. A client that sent a local
 * path got it stored and served back to a reviewer.
 */
export function attachCreatorEvidence(
  kind: string
): Promise<CreatorVerification['evidence'][number]> {
  return write<CreatorVerification['evidence'][number]>(
    'post',
    '/creators/me/verification/evidence',
    { kind }
  );
}

export function submitCreatorVerification(
  request: SubmitCreatorVerificationRequest
): Promise<CreatorVerification> {
  return write<CreatorVerification>(
    'post',
    '/creators/me/verification/submit',
    request,
    request.idempotencyKey
  );
}

export function appealCreatorVerification(reason: string): Promise<CreatorVerification> {
  return write<CreatorVerification>('post', '/creators/me/verification/appeal', { reason });
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-003 — milestones
//
// `CreatorMilestoneEndpoints` (Api/CreatorEndpoints.cs:140, :149).
// ═════════════════════════════════════════════════════════════════════════════

export function fetchMilestones(): Promise<CreatorMilestone[]> {
  return read<CreatorMilestone[]>('/creators/me/milestones');
}

export function claimMilestone(
  milestoneId: string,
  idempotencyKey?: string
): Promise<CreatorMilestone> {
  return write<CreatorMilestone>(
    'post',
    `/creators/me/milestones/${milestoneId}/claim`,
    { idempotencyKey },
    idempotencyKey
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-004 — challenges
//
// `ChallengeEndpoints` (Api/ProgrammeEndpoints.cs:23, :38, :50, :64, :83).
// ═════════════════════════════════════════════════════════════════════════════

export function fetchChallenges(
  params: { state?: string; take?: number } = {}
): Promise<CreatorChallenge[]> {
  return read<CreatorChallenge[]>('/challenges', params);
}

export function fetchChallenge(challengeId: string): Promise<CreatorChallenge> {
  return read<CreatorChallenge>(`/challenges/${challengeId}`);
}

export function joinChallenge(
  challengeId: string,
  idempotencyKey?: string
): Promise<CreatorChallenge> {
  return write<CreatorChallenge>(
    'post',
    `/challenges/${challengeId}/join`,
    { idempotencyKey },
    idempotencyKey
  );
}

export function claimChallenge(
  challengeId: string,
  idempotencyKey?: string
): Promise<CreatorChallenge> {
  return write<CreatorChallenge>(
    'post',
    `/challenges/${challengeId}/claim`,
    { idempotencyKey },
    idempotencyKey
  );
}

export function fetchChallengeLeaderboard(challengeId: string): Promise<CreatorLeaderboard> {
  return read<CreatorLeaderboard>(`/challenges/${challengeId}/leaderboard`);
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-005 — community grants
//
// `GrantEndpoints` (Api/ProgrammeEndpoints.cs:111, :134, :162, :175, :213,
// :224, :237, :251).
//
// **The register declared `POST /grants/applications/{id}/submit` and the
// backend serves `POST /grants/{grantId}/applications/submit`.** The register's
// line is not in the drift baseline because it carries no `?` and no `{}` the
// parser could match — it is simply a route that has never existed. The gap
// adapter happened to call the real shape; that is luck rather than agreement,
// and it is recorded here so the next reader does not re-derive it.
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchGrants(
  params: { category?: string; country?: string; state?: string; take?: number } = {}
): Promise<CommunityGrant[]> {
  const grants = await read<WireGrant[]>('/grants', params);
  return grants.map(toGrant);
}

export async function fetchGrant(grantId: string): Promise<CommunityGrant> {
  return toGrant(await read<WireGrant>(`/grants/${grantId}`));
}

/** The form as data. §24: the frontend does not hard-code a grant's questions. */
export async function fetchGrantForm(grantId: string): Promise<GrantApplicationForm> {
  return toGrantForm(await read<WireGrantForm>(`/grants/${grantId}/form`));
}

export async function fetchGrantApplications(): Promise<GrantApplication[]> {
  const applications = await read<WireGrantApplication[]>('/grants/applications/me');
  return applications.map(toGrantApplication);
}

export async function saveGrantDraft(
  grantId: string,
  answers: Record<string, string>
): Promise<GrantApplication> {
  return toGrantApplication(
    await write<WireGrantApplication>('post', `/grants/${grantId}/applications`, { answers })
  );
}

/**
 * Submits.
 *
 * `acceptedDeclarations` carries declaration **keys**. See the header: the
 * server matches them against `grant.Declarations[].Key`, and the sentences the
 * member read are not keys.
 */
export async function submitGrantApplication(
  request: SubmitGrantApplicationRequest
): Promise<GrantApplication> {
  return toGrantApplication(
    await write<WireGrantApplication>(
      'post',
      `/grants/${request.grantId}/applications/submit`,
      {
        answers: request.answers,
        requestedAmountMinorUnits: request.requestedAmountMinorUnits ?? undefined,
        attachmentIds: request.attachmentIds,
        acceptedDeclarations: request.acceptedDeclarations,
        idempotencyKey: request.idempotencyKey,
      },
      request.idempotencyKey
    )
  );
}

export async function withdrawGrantApplication(applicationId: string): Promise<GrantApplication> {
  return toGrantApplication(
    await write<WireGrantApplication>(
      'post',
      `/grants/applications/${applicationId}/withdraw`
    )
  );
}

/**
 * Files a report against an active grant.
 *
 * Returns the whole application rather than the report, which is the server's
 * shape: a report's state is a property of the application it belongs to, and
 * returning it alone would leave the client re-reading to find out whether the
 * next report is now due.
 */
export async function submitGrantReport(
  applicationId: string,
  reportId: string,
  summary?: string
): Promise<GrantApplication> {
  return toGrantApplication(
    await write<WireGrantApplication>(
      'post',
      `/grants/applications/${applicationId}/reports`,
      { reportId, summary }
    )
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-006 — the Creator Academy
//
// `AcademyEndpoints` (Api/ProgrammeEndpoints.cs:279, :286, :300, :313, :327,
// :342, :356).
//
// There is no `GET /academy/courses/{id}` and no `GET /academy/lessons/{id}`.
// A single course comes from the catalogue and a single lesson from its
// course's lesson list, which is what the two hooks below do rather than
// calling a route that does not exist.
// ═════════════════════════════════════════════════════════════════════════════

export function fetchAcademySections(): Promise<CreatorAcademySection[]> {
  return read<CreatorAcademySection[]>('/academy/sections');
}

export async function fetchCourses(
  params: { section?: string; level?: string } = {}
): Promise<CreatorCourse[]> {
  const courses = await read<WireCourse[]>('/academy/courses', params);
  return courses.map(toCourse);
}

export async function fetchCourseLessons(courseId: string): Promise<CreatorLesson[]> {
  const lessons = await read<WireLesson[]>(`/academy/courses/${courseId}/lessons`);
  return lessons.map(toLesson);
}

/**
 * The refusal for a course or lesson the catalogue does not contain.
 *
 * A real `notFound` rather than a thrown string, so the two readers below fail
 * the way every other absent resource in this app fails and the screen's
 * existing error rendering covers them without a new branch.
 */
function notFound(what: string): FinancialError {
  return new FinancialError({
    kind: 'notFound',
    code: `creator.academy.${what}_not_found`,
    message: `That ${what} is not in the Academy.`,
    hint: 'It may have been withdrawn. Go back to the Academy and pick another.',
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
  });
}

/**
 * One course.
 *
 * **Derived from the catalogue, because there is no `GET /academy/courses/{id}`.**
 * `AcademyEndpoints` maps `/sections`, `/courses`, `/courses/{id}/lessons`,
 * `/courses/{id}/saved`, `/lessons/{id}/complete`, `/quizzes/{id}/submit` and
 * `/certificates/me` — seven routes, and a single-course read is not one of
 * them. The catalogue is a small, hour-stale reference list that the Academy
 * screen has usually loaded already, and it carries this member's progress
 * folded in, so reading a course out of it is a cache hit rather than a second
 * request in practice.
 *
 * Deriving rather than declaring a route that does not exist is the point: a
 * client function named after an absent endpoint is how a screen comes to 404
 * and report "check your connection".
 */
export async function fetchCourse(courseId: string): Promise<CreatorCourse> {
  const course = (await fetchCourses()).find((item) => item.courseId === courseId);
  if (course === undefined) throw notFound('course');
  return course;
}

/**
 * One lesson, within its course.
 *
 * **Takes the course id as well, because there is no `GET /academy/lessons/{id}`.**
 * A lesson is only addressable through its course's ordered list. The lesson
 * screen therefore carries `courseId` in its route, and where it does not have
 * one — an old deep link — the caller falls back to the simulated arm rather
 * than guessing a course.
 */
export async function fetchLesson(courseId: string, lessonId: string): Promise<CreatorLesson> {
  const lesson = (await fetchCourseLessons(courseId)).find(
    (item) => item.lessonId === lessonId
  );
  if (lesson === undefined) throw notFound('lesson');
  return lesson;
}

export function completeLesson(
  lessonId: string,
  idempotencyKey?: string
): Promise<CreatorCourseProgress> {
  return write<CreatorCourseProgress>(
    'post',
    `/academy/lessons/${lessonId}/complete`,
    { idempotencyKey },
    idempotencyKey
  );
}

/**
 * Grades a quiz.
 *
 * `SubmitQuizRequest.Answers` is a **map of questionId → optionId**, not the
 * array of pairs the gap adapter accepted. A JSON array posted into a
 * `Dictionary<Guid, Guid>` is a model-binding failure, so the shape is built
 * here rather than at the call site — the screens keep the array they already
 * produce.
 */
export function submitQuiz(
  quizId: string,
  answers: { questionId: string; optionId: string }[]
): Promise<LessonQuizResult> {
  const map: Record<string, string> = {};
  for (const answer of answers) map[answer.questionId] = answer.optionId;

  return write<LessonQuizResult>('post', `/academy/quizzes/${quizId}/submit`, { answers: map });
}

export async function setCourseSaved(courseId: string, isSaved: boolean): Promise<CreatorCourse> {
  return toCourse(
    await write<WireCourse>('put', `/academy/courses/${courseId}/saved`, { isSaved })
  );
}

export function fetchCertificates(): Promise<CreatorCertificate[]> {
  return read<CreatorCertificate[]>('/academy/certificates/me');
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-009 — referrals
//
// `ReferralEndpoints` (Api/ProgrammeEndpoints.cs:372, :381, :395).
// ═════════════════════════════════════════════════════════════════════════════

export function fetchReferralProgramme(): Promise<CreatorReferralProgramme> {
  return read<CreatorReferralProgramme>('/referrals/me');
}

/**
 * `CreatorReferralPageResponse` as the client's referral page.
 *
 * The same defect class as the directory above and the same reason for being a
 * named export: the rows are `referrals`. A referral history that silently
 * renders empty is worse than most, because "nobody used my code" is a
 * plausible answer and a member would believe it.
 */
export function toReferralHistoryPage(page: WireReferralPage): CreatorReferralPage {
  return {
    referrals: page.referrals ?? [],
    nextCursor: page.nextCursor ?? null,
    hasMore: page.hasMore ?? false,
  };
}

export async function fetchReferralHistory(
  params: { cursor?: string; take?: number } = {}
): Promise<CreatorReferralPage> {
  return toReferralHistoryPage(await read<WireReferralPage>('/referrals/me/history', params));
}

/** Issues a code where none exists. Idempotent on the creator. */
export function issueReferralCode(idempotencyKey?: string): Promise<CreatorReferralProgramme> {
  return write<CreatorReferralProgramme>(
    'post',
    '/referrals/code',
    { idempotencyKey },
    idempotencyKey
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-010 and -011 — the sign-up bonus, the rules, the catalogue
//
// `RewardEndpoints` (Api/ProgrammeEndpoints.cs:416, :425, :434, :445, :464,
// :471).
//
// **This prefix serves no points balance.** `CreatorRewardEndpointContributor`
// says so: B15 serves the balance at `/api/v1/financial/rewards/me` and the two
// spaces do not collide. `useCreatorPoints` continues to read Phase 5's adapter
// and is untouched by this wave.
// ═════════════════════════════════════════════════════════════════════════════

export function fetchSignupBonus(): Promise<SignupBonus> {
  return read<SignupBonus>('/rewards/signup-bonus/me');
}

/**
 * Records that the member accepted the bonus.
 *
 * §19: the frontend never awards a point. This returns the *state* the server
 * decided, and the balance is re-read from B15 rather than incremented here.
 */
export function acknowledgeSignupBonus(idempotencyKey?: string): Promise<SignupBonus> {
  return write<SignupBonus>(
    'post',
    '/rewards/signup-bonus/acknowledge',
    { idempotencyKey },
    idempotencyKey
  );
}

/** The rules catalogue's own metadata, served alongside the rules themselves. */
export interface CreatorPointRulesResult {
  rules: CreatorPointRule[];
  catalogueVersion: string;
  /** `Never`, `AfterPeriod` or `AfterInactivity`. PascalCase on the wire. */
  expiryPolicy: string;
  /** The platform's own sentence about expiry. Rendered, never composed. */
  expiryDescription: string;
  updatedAt: string;
}

/**
 * The point rules.
 *
 * Returns the whole envelope rather than the array, because the version and the
 * expiry statement are the two things the register asked for and dropping them
 * here would leave the screen unable to answer "do my points expire" with
 * anything but a guess.
 */
export function fetchPointRules(): Promise<CreatorPointRulesResult> {
  return read<WirePointRules>('/rewards/rules');
}

export interface CreatorRewardCatalogueResult {
  rewards: CreatorReward[];
  catalogueVersion: string;
  /** The caller's spendable balance, read by the server from B15. */
  availablePoints: number;
  updatedAt: string;
}

export function fetchRewardCatalogue(): Promise<CreatorRewardCatalogueResult> {
  return read<WireRewardCatalogue>('/rewards/catalogue');
}

export function fetchRedemptions(take?: number): Promise<CreatorRewardRedemption[]> {
  return read<CreatorRewardRedemption[]>('/rewards/redemptions/me', { take });
}

/**
 * Redeems a reward.
 *
 * The request carries a reward identifier and a key and **no points figure at
 * all** — the server loads the authoritative catalogue and charges what it says.
 * §31: "A malicious client must not be able to POST /rewards/redemptions with
 * points = 999999 and influence the outcome."
 */
export function redeemReward(
  rewardId: string,
  idempotencyKey?: string
): Promise<CreatorRewardRedemption> {
  return write<CreatorRewardRedemption>(
    'post',
    '/rewards/redemptions',
    { rewardId, idempotencyKey },
    idempotencyKey
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR-GAP-012 — the leaderboard
//
// `CreatorDiscoveryEndpoints` (Api/CreatorEndpoints.cs:178). Mapped before the
// parameterised sibling so `/creators/leaderboard` is not read as a creator id.
// ═════════════════════════════════════════════════════════════════════════════

export function fetchLeaderboard(params: {
  scope: string;
  period?: string;
  country?: string;
  communityId?: string;
  take?: number;
}): Promise<CreatorLeaderboard> {
  return read<CreatorLeaderboard>('/creators/leaderboard', params);
}

// ═════════════════════════════════════════════════════════════════════════════
// EARNINGS · CREATOR-GAP-008
//
// Re-exported rather than reimplemented. See `lib/creator-earning-api.ts` for
// why the gross/share split, the opaque cursor and the absent payouts route are
// each the shape they are.
// ═════════════════════════════════════════════════════════════════════════════

export { fetchEarnings, fetchRevenueSummary } from '../creator-earning-api';
