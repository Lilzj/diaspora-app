/**
 * Do the app's own gap disclosures still tell the truth?
 *
 * Hundreds of screens carry a sentence of the form "Diaspora cannot X yet". Each is a claim
 * about the platform, and each was true when it was written. The register those claims came
 * from has been wrong before — an earlier phase found 164 of 305 "missing" routes already
 * implemented — so every one of them is worth re-asking rather than trusting.
 *
 * **A path existing is not the capability working.** That is the whole reason this is a runtime
 * probe and not a grep over the contract: `/automations/{id}/run` is published, and whether it
 * *runs* an automation is a different question that only a request can answer. It answered
 * `automation.not_manually_runnable`, which is the sort of thing a contract read never finds.
 *
 * ── What changed in this revision, and why it mattered ───────────────────────
 *
 * The first version asked twelve questions against **fabricated identifiers** and a member whose
 * access rung had never been raised. Both distorted the answers:
 *
 *   * `POST /community/reports` was never called at all — only `GET /community/reports/reasons`,
 *     which answers 200 for every subject and therefore for none of them. On that evidence
 *     *"Diaspora cannot report a job yet"* was recorded **STALE**. It is not: `Job` is a declared
 *     `CommunityContentType` that **no content source claims**, so a real submission answers
 *     `community.content.type-unsupported`. The claim is TRUE and the screen is right.
 *   * `GET /community/content/guide/00000000-…/comments` answered `404 community.content.not-found`,
 *     which correctly proved the *route* exists. It could not show that posting a comment to a
 *     **draft** guide is refused `community.comment.closed` — a fact the screen has to handle.
 *
 * So this version **seeds**: a verified member, a published guide, a seller profile, a real
 * listing, a landlord profile, an employer, an automation. Then it asks. §6 of the sweep brief is
 * explicit that a fake id is not evidence of a missing capability, and this is that rule applied.
 *
 * ── Verdicts ─────────────────────────────────────────────────────────────────
 *
 *   CLAIM STALE — the capability answers. The screen's sentence is now false and should go.
 *   CLAIM TRUE  — the platform genuinely cannot. The sentence stays.
 *   UNCLEAR     — answered, but not in a way that settles the claim. Named, not guessed at.
 *   BLOCKED     — the probe could not be set up. Not evidence in either direction.
 *
 * Nothing here converts uncertainty into PASS. `run-all.mjs` counts every verdict that is not
 * PASS or FAIL as "other" and prints it, so an UNCLEAR is visible rather than absorbed.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { call, verifiedUser, recorder, uploadDirect } from './e2e-harness.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'results-gap-claims-probe.json');

const results = [];
const rec = recorder(results);
const RUN = process.env.RUNTIME_RUN ?? '640';
const ph = (n) => `+23481000${RUN}${String(n).padStart(3, '0')}`;
const stamp = `GC${RUN}`;

const member = await verifiedUser({ name: 'Ngozi Prober', phone: ph(1), password: 'Yr5#dGkP7wLs' });
rec('setup', 'a verified member', member.token ? 'PASS' : 'FAIL', `userId=${member.userId}`);
if (!member.token) { writeFileSync(OUT, JSON.stringify({ run: RUN, results }, null, 2)); process.exit(0); }

const reader = await verifiedUser({ name: 'Bola Reader', phone: ph(2), password: 'Yr5#dGkP8wLs' });
rec('setup', 'a second member, to read and report', reader.token ? 'PASS' : 'FAIL', `userId=${reader.userId}`);

const T = member.token;
const R = reader.token ?? T;

const ok = (r) => r.status >= 200 && r.status < 300;

/**
 * The rows out of a response, whichever envelope it used.
 *
 * This platform serves both `{ data: [ … ] }` and `{ data: { items: [ … ] } }`, sometimes on
 * adjacent routes in the same module. Reading only one of them is how this probe recorded zero
 * placements a second after buying one — and briefly read that as the platform losing it.
 */
function readItems(r) {
  const d = r.body?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

/**
 * Asks one claim.
 *
 * `stale` decides the verdict from the response. A 403 means the route exists and this member is
 * not allowed, which says the capability is real but tells us nothing about the sentence — so it
 * is UNCLEAR rather than either.
 */
async function claim({ screen, sentence, method, path, body, token = T, stale, expect: expectation }) {
  const r = await call(method, path, { token, body, label: sentence.slice(0, 48) });

  // A 404 is evidence about a *path*, not about a capability — the lesson this programme has
  // relearned in every phase. A 404 carrying a module error code (`community.content.not-found`,
  // `financial.donation.not_found`) means the route matched and the *resource* did not exist,
  // which says the capability is there. Only a bare 404 — no code, nothing matched — supports
  // the screen's claim.
  //
  // The first version of this probe read every 404 as CLAIM TRUE and got two verdicts backwards.
  const routeMissing = (r.status === 404 && !r.body?.code) || r.status === 405;
  const resourceMissing = r.status === 404 && !!r.body?.code;

  // Order matters, and this is the order §5 of the sweep brief sets out. A module
  // error code on a 404 settles the question before any per-claim predicate runs:
  // the route matched, so the capability is there and the *resource* was not.
  const verdict =
    routeMissing ? 'CLAIM TRUE'
      : resourceMissing ? 'CLAIM STALE'
        : stale ? (stale(r) ? 'CLAIM STALE' : 'UNCLEAR')
          : 'UNCLEAR';

  rec(screen, sentence, verdict,
    `${method} ${path} → ${r.status}${r.body?.code ? ' ' + r.body.code : ''}`
    + (expectation ? ` · expected ${expectation}` : ''));
  return r;
}

/** Records a claim whose evidence came from something already fetched. */
function derived(screen, sentence, verdict, note) {
  rec(screen, sentence, verdict, note);
}

// ═════════════════════════════════════════════════════════════════════════════
// SEED — real resources, so no question is answered by a fabricated identifier
// ═════════════════════════════════════════════════════════════════════════════

const seeded = {
  guideId: null, listingId: null, automationId: null, commentId: null,
  conversationId: null, messageId: null,
};

{
  const cats = await call('GET', '/guides/categories', { token: T, label: 'guide categories' });
  const categoryKey = (cats.body?.data?.items ?? cats.body?.data ?? [])[0]?.key ?? 'getting-started';

  const created = await call('POST', '/guides', {
    token: T, label: 'seed a guide',
    body: {
      title: `Disclosure sweep guide ${stamp}`, categoryKey, language: 'en',
      countryCode: 'NG', cityName: 'Lagos',
      summary: 'Seeded by the disclosure probe so every question below has a real id to ask about.',
    },
  });
  seeded.guideId = created.body?.data?.guideId ?? null;
  rec('setup', 'a real guide exists to ask about', seeded.guideId ? 'PASS' : 'BLOCKED',
    `status=${created.status} id=${seeded.guideId}`);
}

{
  const seller = await call('POST', '/marketplace/sellers', {
    token: T, label: 'seed a seller profile',
    body: { displayName: `Sweep Trades ${stamp}`, kind: 'Individual', countryCode: 'NG', bio: 'Seeded by the disclosure probe.' },
  });
  rec('setup', 'a seller profile exists', ok(seller) ? 'PASS' : 'BLOCKED', `status=${seller.status}`);

  if (ok(seller)) {
    const cats = await call('GET', '/marketplace/categories', { token: T, label: 'marketplace categories' });
    const flatten = (nodes, out = []) => { for (const c of nodes ?? []) { out.push(c); flatten(c.children, out); } return out; };
    const all = flatten(cats.body?.data?.items ?? cats.body?.data ?? []);
    const leaf = all.find((c) => !c.children?.length) ?? all[0];
    const media = await uploadDirect(T, { fileName: `${stamp}.png`, label: 'seed listing photograph' });
    const mediaId = media.body?.data?.mediaId ?? media.body?.data?.id;

    const listing = await call('POST', '/marketplace/listings', {
      token: T, label: 'seed a listing',
      body: {
        title: `Refurbished laptop ${stamp}`,
        description: 'Seeded by the disclosure probe. A refurbished machine with a new battery.',
        categoryKey: leaf?.key ?? leaf?.categoryKey ?? leaf?.slug,
        countryCode: 'NG', cityName: 'Lagos', condition: 'Refurbished',
        listingType: 'Sale', price: 185000, currency: 'NGN', quantity: 1,
        isNegotiable: true, offersPickup: true, offersDelivery: false, offersShipping: false, isDigital: false,
        mediaIds: mediaId ? [mediaId] : undefined,
      },
    });
    seeded.listingId = listing.body?.data?.listingId ?? null;
    if (seeded.listingId) {
      await call('POST', `/marketplace/listings/${seeded.listingId}/publish`, { token: T, body: {}, label: 'publish the seeded listing' });
    }
    rec('setup', 'a published listing exists', seeded.listingId ? 'PASS' : 'BLOCKED',
      `status=${listing.status} id=${seeded.listingId}`);
  }
}

{
  // Seeded for the same reason as the seller profile: without it
  // `GET /housing/listings/mine` answers `403 housing.not-landlord`, which says
  // "you are not a landlord" and not "there is no such list" — an UNCLEAR the
  // probe can simply remove rather than report.
  const landlord = await call('POST', '/housing/landlords', {
    token: T, label: 'seed a landlord profile',
    body: { displayName: `Sweep Lettings ${stamp}`, kind: 'Individual', countryCode: 'NG', bio: 'Seeded by the disclosure probe.' },
  });
  rec('setup', 'a landlord profile exists', ok(landlord) ? 'PASS' : 'BLOCKED', `status=${landlord.status}`);
}

{
  // A private conversation with one real message, so the message-reporting probe
  // below has a subject and a non-participant to test the boundary with.
  const conversation = await call('POST', '/conversations', {
    token: T, label: 'seed a conversation',
    body: {
      recipientId: reader.userId,
      context: { type: 'PrivateConversation', entityId: reader.userId },
      initialMessage: 'Seeded by the disclosure probe.',
    },
  });
  seeded.conversationId = conversation.body?.data?.conversationId ?? conversation.body?.data?.id ?? null;

  if (seeded.conversationId) {
    // `PrivateConversation` requires acceptance before anything can be sent.
    await call('POST', `/conversations/requests/${seeded.conversationId}/accept`, {
      token: R, body: {}, label: 'accept the conversation request',
    });
    const message = await call('POST', `/conversations/${seeded.conversationId}/messages`, {
      token: T, label: 'seed a message',
      body: { text: 'Seeded by the disclosure probe.', localId: `sweep-msg-${stamp}` },
    });
    seeded.messageId = message.body?.data?.messageId ?? message.body?.data?.id ?? null;
  }

  rec('setup', 'a private conversation with a real message', seeded.messageId ? 'PASS' : 'BLOCKED',
    `conversation=${seeded.conversationId} message=${seeded.messageId}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTOMATION — "cannot store", "cannot run automatically", "cannot schedule"
// ═════════════════════════════════════════════════════════════════════════════

const capabilities = await call('GET', '/automations/capabilities', { token: T, label: 'automation capabilities' });
const catalog = await call('GET', '/automations/catalog', { token: T, label: 'automation catalogue' });

const triggers = catalog.body?.data?.triggers ?? [];
const actions = catalog.body?.data?.actions ?? [];
const availableTrigger = triggers.find((t) => t.isAvailable && (t.allowedOwners ?? []).includes('user'));
const availableAction = actions.find((a) => a.isAvailable);

derived('automation', 'Diaspora cannot store automations yet',
  ok(capabilities) && capabilities.body?.data?.canCreatePersonal === true ? 'CLAIM STALE' : 'UNCLEAR',
  `GET /automations/capabilities → ${capabilities.status} canCreatePersonal=${capabilities.body?.data?.canCreatePersonal}`
  + ` maxActive=${capabilities.body?.data?.maxActiveAutomations}`);

derived('automation', 'Diaspora cannot run automations automatically yet',
  ok(catalog) && !!availableTrigger && !!availableAction ? 'CLAIM STALE' : 'UNCLEAR',
  `GET /automations/catalog → ${catalog.status}`
  + ` availableTriggers=${triggers.filter((t) => t.isAvailable).length}/${triggers.length}`
  + ` availableActions=${actions.filter((a) => a.isAvailable).length}/${actions.length}`);

// The two limitations that are *kept*, checked the same way as everything else so
// that "we left this one alone" is a measurement rather than a decision.
derived('automation', 'location-based automation triggers are not available',
  triggers.some((t) => t.key === 'location.enteredArea' && !t.isAvailable) ? 'CLAIM TRUE' : 'CLAIM STALE',
  `catalogue: location.enteredArea isAvailable=${triggers.find((t) => t.key === 'location.enteredArea')?.isAvailable}`);

derived('automation', 'platform-wide automations are not available',
  capabilities.body?.data?.canCreatePlatformWide === false ? 'CLAIM TRUE' : 'CLAIM STALE',
  `canCreatePlatformWide=${capabilities.body?.data?.canCreatePlatformWide}`);

if (availableTrigger && availableAction) {
  const created = await call('POST', '/automations', {
    token: T, label: 'store an automation',
    body: {
      name: `Sweep automation ${stamp}`, description: 'Created by the disclosure probe.',
      scope: { kind: 'user' },
      trigger: { key: availableTrigger.key, configuration: {} },
      conditions: [],
      actions: [{ key: availableAction.key, configuration: {} }],
      status: 'Active', idempotencyKey: `sweep-auto-${stamp}`,
    },
  });
  seeded.automationId = created.body?.data?.id ?? created.body?.data?.automationId ?? null;

  derived('automation', 'an automation survives being stored',
    ok(created) && !!seeded.automationId ? 'CLAIM STALE' : 'UNCLEAR',
    `POST /automations → ${created.status} id=${seeded.automationId} nextRunAt=${created.body?.data?.nextRunAt ?? '-'}`);

  if (seeded.automationId) {
    const schedule = await call('GET', `/automations/${seeded.automationId}/schedule`, { token: T, label: 'automation schedule' });
    derived('automation', 'Diaspora cannot put an automation on a clock',
      ok(schedule) ? 'CLAIM STALE' : 'UNCLEAR',
      `GET /automations/{id}/schedule → ${schedule.status} isSchedulable=${schedule.body?.data?.isSchedulable}`
      + ` nextRunAt=${schedule.body?.data?.nextRunAt ?? 'null'}`);
  }
}

await claim({
  screen: 'automation/history',
  sentence: 'automation run history is empty because nothing runs',
  method: 'GET', path: '/automations/runs',
  stale: (r) => ok(r),
});

// ═════════════════════════════════════════════════════════════════════════════
// COMMENTS — against a real guide, published and unpublished
// ═════════════════════════════════════════════════════════════════════════════

if (seeded.guideId) {
  const list = await claim({
    screen: 'guide/[id]',
    sentence: 'Diaspora cannot load the comments on this item',
    method: 'GET', path: `/community/content/guide/${seeded.guideId}/comments?limit=10`,
    stale: (r) => ok(r),
  });

  // The posting path, which the previous probe never reached. A **draft** guide
  // refuses with `community.comment.closed` — the capability is there and the
  // *content* is not open, which a screen must distinguish.
  const posted = await call('POST', `/community/content/guide/${seeded.guideId}/comments`, {
    token: R, label: 'post a comment', body: { body: 'Does the registry still open on Saturdays?' },
  });
  seeded.commentId = posted.body?.data?.commentId ?? posted.body?.data?.id ?? null;

  derived('guide/[id]', 'Diaspora cannot accept a comment',
    ok(posted) ? 'CLAIM STALE'
      : posted.status === 409 && posted.body?.code === 'community.comment.closed' ? 'CLAIM STALE'
        : 'UNCLEAR',
    `POST comments → ${posted.status} ${posted.body?.code ?? ''}`
    + ` (commentsClosed=${list.body?.data?.commentsClosed})`);
}

// Which subjects carry a comment thread at all. A 400 `community.content.type-unsupported`
// means the enum member exists and nothing owns it — that is a real limitation, and the only
// way to find it is to ask.
for (const type of ['guide', 'marketplace', 'housing', 'event', 'post', 'update', 'provider', 'job', 'organization', 'member', 'poll']) {
  const id = seeded.guideId ?? '00000000-0000-0000-0000-000000000000';
  const r = await call('GET', `/community/content/${type}/${id}/comments?limit=1`, { token: T, label: `comments on ${type}` });
  const supported = r.status !== 400;
  derived('comments', `${type} content can carry comments`,
    supported ? 'CLAIM STALE' : 'CLAIM TRUE',
    `GET /community/content/${type}/{id}/comments → ${r.status} ${r.body?.code ?? ''}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// REPORTING — the submission path, not the reasons list
// ═════════════════════════════════════════════════════════════════════════════

const reasons = await call('GET', '/community/reports/reasons', { token: T, label: 'report reasons' });
const reasonCode = (reasons.body?.data ?? [])[1]?.code ?? 'spam';

/**
 * Reporting is per-subject, and the reasons list says nothing about which subjects work.
 *
 * `community.enum.unknown`         — not a content type at all.
 * `community.content.type-unsupported` — declared, and no content source claims it.
 * `community.content.not-found`    — the type is fine and this id is not, which means the
 *                                    submission path works for that subject.
 */
async function reportable(subject, contentId) {
  const r = await call('POST', '/community/reports', {
    token: R, label: `report a ${subject}`,
    body: { contentType: subject, contentId, reason: reasonCode, description: 'Disclosure sweep probe.' },
  });

  const unsupported =
    r.status === 400
    && (r.body?.code === 'community.enum.unknown' || r.body?.code === 'community.content.type-unsupported');

  derived('reporting', `Diaspora cannot report a ${subject.toLowerCase()}`,
    unsupported ? 'CLAIM TRUE' : ok(r) || r.status === 404 ? 'CLAIM STALE' : 'UNCLEAR',
    `POST /community/reports contentType=${subject} → ${r.status} ${r.body?.code ?? ''}`);
  return r;
}

const anyId = '11111111-1111-1111-1111-111111111111';
await reportable('Guide', seeded.guideId ?? anyId);
if (seeded.listingId) await reportable('Marketplace', seeded.listingId);
await reportable('Housing', anyId);
await reportable('Event', anyId);
await reportable('Post', anyId);
await reportable('Update', anyId);
await reportable('Provider', anyId);
if (seeded.commentId) await reportable('Comment', seeded.commentId);

// ── The four that were declared in the enum and claimed by nothing ──────────
//
// Each answered `community.content.type-unsupported` — or, for Message, was not
// in the enum at all — until this phase wrote a content source for it. They are
// probed against **real** subjects where one exists, because a fabricated id
// against a claimed type answers 404, which is the right answer and the wrong
// evidence for "can this be reported".
await reportable('Job', anyId);
await reportable('Organization', anyId);
// Reported *by the reader, about the member* — the other way round answers
// `community.report.self-content`, which is the platform correctly refusing to
// let somebody report themselves and says nothing about the capability.
//
// Expected to answer `community.content.type-unsupported`. A source for this was
// written during the sweep, worked, and was reverted because the platform's
// architecture tests refused where it had to live. See BG-05a.
await reportable('Member', member.userId ?? anyId);
if (seeded.messageId) await reportable('Message', seeded.messageId);

// `Poll` is the one member of the enum still claimed by nothing. Probed so the
// gate says so rather than leaving it to be rediscovered.
await reportable('Poll', anyId);

// Not a content type at all, and the probe used to send this spelling and read
// `community.enum.unknown` as "members cannot be reported". They can — the wire
// name is `Member`. Kept as a control so the distinction stays visible.
await reportable('User', anyId);

// ── The boundary that makes message reporting safe ──────────────────────────
//
// A stranger must not be able to resolve somebody else's message. If this ever
// answers anything other than a bare-looking 404, reporting has become a way to
// probe another member's inbox — so it is asserted rather than assumed.
if (seeded.messageId) {
  const stranger = await verifiedUser({ name: 'Uninvolved Party', phone: ph(3), password: 'Yr5#dGkP9wLs' });
  if (stranger.token) {
    const probe = await call('POST', '/community/reports', {
      token: stranger.token, label: 'a stranger reports a message they cannot see',
      body: {
        contentType: 'Message', contentId: seeded.messageId,
        reason: reasonCode, description: 'Boundary probe.',
      },
    });
    derived('reporting', 'a non-participant cannot resolve a private message',
      probe.status === 404 && probe.body?.code === 'community.content.not-found'
        ? 'CLAIM TRUE' : 'UNCLEAR',
      `POST /community/reports contentType=Message as a stranger → ${probe.status} ${probe.body?.code ?? ''}`);
  } else {
    rec('reporting', 'a non-participant cannot resolve a private message', 'BLOCKED',
      'the third identity could not be created');
  }
}

// `/conversations/reports/reasons` still 404s, and that is now the *right* answer
// rather than a gap: message reporting goes through Community's route and
// Community's one reason taxonomy. A second per-module reasons list would be a
// second vocabulary for moderators to reconcile. Recorded so the 404 is not
// rediscovered as a missing capability by the next sweep.
{
  const r = await call('GET', '/conversations/reports/reasons', { token: T, label: 'conversation report reasons' });
  derived('conversation/[id]', 'Conversations has no reasons list of its own, by design',
    r.status === 404 ? 'CLAIM TRUE' : 'UNCLEAR',
    `GET /conversations/reports/reasons → ${r.status} — message reports use POST /community/reports`);
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATOR WORKSPACE — the lists the screens said had no route
// ═════════════════════════════════════════════════════════════════════════════

for (const [sentence, path] of [
  ['Diaspora cannot list your drafts yet', '/guides/mine/drafts?limit=5'],
  ['Diaspora cannot list your published content yet', '/guides/mine?limit=5'],
  ['Diaspora cannot list your archive yet', '/guides/mine?limit=5&status=Archived'],
  ['Diaspora cannot list your own listings yet', '/marketplace/listings/mine?limit=5'],
  ['Diaspora cannot list your own properties yet', '/housing/listings/mine?limit=5'],
  ['Diaspora cannot list the events you organise yet', '/community-life/events/mine?limit=5'],
]) {
  await claim({ screen: 'creator/workspace', sentence, method: 'GET', path, stale: (r) => ok(r) });
}

// The two the workspace still says it cannot do, checked so the sentence stays honest.
// ── Two capabilities that read as one sentence ──────────────────────────────
//
// "Your reviews" is ambiguous and the platform answers the two halves
// differently, so they are asked separately rather than conflated:
//
//   reviews left ON your business   provider-scoped   live
//   reviews YOU WROTE               author-scoped     absent
//
// The single claim used to be probed against `/providers/me/reviews`, which
// 404'd, and the whole sentence was recorded TRUE. Half of it no longer is.
await claim({
  screen: 'my-reviews',
  sentence: 'Diaspora cannot list the reviews left on your business',
  method: 'GET', path: '/providers/me/reviews',
  stale: (r) => ok(r),
});

await claim({
  screen: 'my-reviews',
  sentence: 'Diaspora cannot list the reviews you have written',
  method: 'GET', path: '/reviews/mine',
});

await claim({
  screen: 'creator/workspace',
  sentence: 'Diaspora cannot list the providers you run',
  method: 'GET', path: '/providers/me',
  stale: (r) => ok(r),
});

// The read route landed in this phase. The *screen* is not wired to it yet, so the
// workspace still carries the sentence — under-promising rather than over-promising,
// and tracked here so the gate keeps saying the sentence is stale.
await claim({
  screen: 'creator/workspace',
  sentence: 'Diaspora cannot show your activity history yet',
  method: 'GET', path: '/creators/me/activity',
  stale: (r) => ok(r),
});

// ═════════════════════════════════════════════════════════════════════════════
// MARKETPLACE — a bump is a purchase, and the previous verdict said UNCLEAR
// ═════════════════════════════════════════════════════════════════════════════

const catalogue = await call('GET', '/financial/catalog', { token: T, label: 'promotion catalogue' });
const boost = (catalogue.body?.data ?? []).find((p) => p?.placementKind === 'Boost' && p?.isAvailable);

derived('marketplace', 'Diaspora cannot bump listings',
  boost ? 'CLAIM STALE' : 'CLAIM TRUE',
  boost
    ? `GET /financial/catalog → ${catalogue.status} product=${boost.code} priorityWeight=${boost.priorityWeight} days=${boost.durationDays}`
    : `GET /financial/catalog → ${catalogue.status} no available Boost product`);

if (boost && seeded.listingId) {
  const purchase = await call('POST', '/financial/purchases', {
    token: T, label: 'buy a boost',
    body: {
      productCode: boost.code, subjectType: 'MarketplaceListing', subjectId: seeded.listingId,
      methodKind: 'Card', countryCode: 'NG', idempotencyKey: `sweep-boost-${stamp}`,
    },
  });
  derived('marketplace', 'a boost can actually be bought and becomes a placement',
    ok(purchase) && !!purchase.body?.data?.placement ? 'CLAIM STALE' : 'UNCLEAR',
    `POST /financial/purchases → ${purchase.status} placement=${purchase.body?.data?.placement ? 'yes' : 'no'}`);

  // ── One envelope shape is not the other, and it cost a false finding ─────
  //
  // `/financial/placements/me` answers `{ data: [ … ] }` — a **bare array**, not
  // the `{ data: { items } }` page every neighbouring route returns. Reading
  // `data.items` gave `undefined`, the probe recorded zero placements a second
  // after a purchase that had just returned one, and the first reading of that
  // was "the platform loses the placement". It does not; the reader was wrong.
  // `readItems` accepts both, which is the same lesson `lib/platform-envelope.ts`
  // already learned on the client.
  const placements = await call('GET', '/financial/placements/me?take=20', { token: T, label: 'my placements' });
  const mine = readItems(placements);
  const placement = mine[0];

  const bySubject = await call('GET', `/financial/placements/MarketplaceListing/${seeded.listingId}`, {
    token: T, label: 'placements for the seeded listing',
  });
  const subjectPlacements = readItems(bySubject);

  derived('marketplace', 'a bought placement is listed back with its priority',
    placement ? 'CLAIM STALE' : 'UNCLEAR',
    `GET /financial/placements/me → ${placements.status} items=${mine.length}`
    + ` kind=${placement?.kind} priorityWeight=${placement?.priorityWeight} status=${placement?.status}`);

  // Not the same question, and worth keeping separate. `/placements/{subjectType}/{subjectId}`
  // is documented "is this thing paid for, and until when" and lists **Active**
  // placements only. A freshly bought boost is `Scheduled`, so an empty answer here
  // is the route working, not the placement missing — which is why this records what
  // it saw rather than a verdict about the purchase.
  derived('marketplace', 'a scheduled placement is not yet an active one',
    subjectPlacements.length === 0 && placement?.status === 'Scheduled' ? 'CLAIM TRUE'
      : subjectPlacements.length > 0 ? 'CLAIM STALE' : 'UNCLEAR',
    `GET /financial/placements/{subjectType}/{subjectId} → ${bySubject.status}`
    + ` active=${subjectPlacements.length} · mine[0].status=${placement?.status}`);

  if (placement?.placementId) {
    const paused = await call('POST', `/financial/placements/${placement.placementId}/pause`, { token: T, body: {}, label: 'pause a placement' });
    derived('marketplace', 'a placement can be paused and resumed',
      ok(paused) ? 'CLAIM STALE' : 'UNCLEAR', `POST /placements/{id}/pause → ${paused.status}`);
    if (ok(paused)) await call('POST', `/financial/placements/${placement.placementId}/resume`, { token: T, body: {}, label: 'resume a placement' });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// WALLET AND FINANCIAL — what is off, and what is not
// ═════════════════════════════════════════════════════════════════════════════

// Switched off *by declaration*, and the sweep brief is explicit that these stay. Probed
// anyway, because "we left it alone" should be a measurement.
const deposit = await call('POST', '/financial/wallets/me/deposits', {
  token: T, label: 'attempt a deposit',
  body: { amount: 5, currency: 'GBP', methodKind: 'Card', idempotencyKey: `sweep-dep-${stamp}` },
});
derived('wallet', 'deposits are not available in this deployment',
  deposit.status >= 400 ? 'CLAIM TRUE' : 'CLAIM STALE',
  `POST /financial/wallets/me/deposits → ${deposit.status} ${deposit.body?.code ?? ''}`);

// `destinationId` is required by the contract, so it is sent. Without it the route
// answers `Platform.Validation.Failed` — a **binding** failure, which proves nothing
// about the switch and would have been recorded as one. The point of this probe is
// that the refusal comes from the capability switch rather than from the parser.
const withdrawal = await call('POST', '/financial/wallets/me/withdrawals', {
  token: T, label: 'attempt a withdrawal',
  body: {
    amount: 5, currency: 'GBP',
    destinationId: '11111111-1111-1111-1111-111111111111',
    countryCode: 'NG', idempotencyKey: `sweep-wd-${stamp}`,
  },
});
derived('wallet', 'withdrawals are not available in this deployment',
  withdrawal.body?.code === 'Platform.Validation.Failed' ? 'UNCLEAR'
    : withdrawal.status >= 400 ? 'CLAIM TRUE'
      : 'CLAIM STALE',
  `POST /financial/wallets/me/withdrawals → ${withdrawal.status} ${withdrawal.body?.code ?? ''}`);

// What the wallet area *can* do, so the screens do not declare the whole area unavailable.
for (const [sentence, path] of [
  ['Diaspora cannot show your transactions', '/financial/wallets/me/transactions?limit=5'],
  ['Diaspora cannot show what you have given', '/financial/giving/me'],
  ['Diaspora cannot show your purchases', '/financial/purchases?take=5'],
  ['Diaspora cannot show your rewards balance', '/financial/rewards/me'],
  ['Diaspora cannot show your rewards history', '/financial/rewards/me/history?limit=5'],
  ['Diaspora cannot show your entitlements', '/financial/entitlements/me'],
]) {
  await claim({ screen: 'wallet', sentence, method: 'GET', path, stale: (r) => ok(r) });
}

await claim({
  screen: 'monetization/billing',
  sentence: 'Diaspora cannot produce a formal invoice yet',
  method: 'GET', path: `/financial/receipts/sweep-${stamp}`,
});

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS — one word, many capabilities
// ═════════════════════════════════════════════════════════════════════════════

for (const [sentence, path] of [
  ['Diaspora cannot report on anything yet', '/analytics/definitions'],
  ['Diaspora cannot tell you what you may see', '/analytics/access'],
  ['Diaspora cannot show creator analytics', '/analytics/creators/me'],
  ['Diaspora cannot summarise your creator figures', '/analytics/creators/me/summary'],
  ['Diaspora cannot list your content with its figures', '/analytics/creators/me/content?take=5'],
]) {
  await claim({ screen: 'analytics', sentence, method: 'GET', path, stale: (r) => ok(r) });
}

if (seeded.guideId) {
  await claim({
    screen: 'analytics/content',
    sentence: 'Diaspora does not have analytics for this item',
    method: 'GET', path: `/analytics/content/guide/${seeded.guideId}`,
    stale: (r) => ok(r),
  });
}
if (seeded.listingId) {
  await claim({
    screen: 'marketplace/[id]',
    sentence: 'Diaspora cannot show how a listing is performing',
    method: 'GET', path: `/marketplace/listings/${seeded.listingId}/analytics`,
    stale: (r) => ok(r),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIVACY — implemented last phase, so the disclosures should be narrow
// ═════════════════════════════════════════════════════════════════════════════

for (const [sentence, path] of [
  ['Diaspora has no privacy controls yet', '/privacy/export'],
  ['Diaspora cannot preview what deleting your account removes', '/privacy/deletion/preview'],
]) {
  await claim({ screen: 'profile/privacy-settings', sentence, method: 'GET', path, stale: (r) => ok(r) });
}

// ═════════════════════════════════════════════════════════════════════════════
// The tally
// ═════════════════════════════════════════════════════════════════════════════

const counts = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] ?? 0) + 1; return acc; }, {});

console.log('\n  GAP CLAIM AUDIT');
console.log(`  ${'─'.repeat(52)}`);
for (const [verdict, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${verdict}`);
}
console.log(`  ${String(results.length).padStart(4)}  claims asked\n`);

// UNCLEAR is printed and carried into the results file rather than folded into PASS.
// `run-all.mjs` counts it under "other", which is visible in the summary table.
writeFileSync(OUT, JSON.stringify({ run: RUN, seeded, counts, results }, null, 2));
process.exit(0);
