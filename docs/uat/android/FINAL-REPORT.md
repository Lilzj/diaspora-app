# Diaspora — Android Pre-Launch UAT · Final Report

**Session 2 · 31 August 2026.** Read `FINAL-VERDICT.md` first for the decision; this document is
the analysis behind it. `BUG-REGISTER.md` carries the reproductions.

---

## 1. Scorecard (Phase 41)

| Measure | Value |
|---|---|
| Total screens discovered | ~254 route files |
| Screens tested | **~30** (12 %) |
| Screens not tested | ~224 |
| Total CTAs discovered | ~675 |
| CTAs tested | **~60** (9 %) |
| CTAs failed | 4 (Use GPS Location; Jobs tab; two deep links into detail screens) |
| Navigation paths tested | ~40 |
| Navigation failures | 2 (both process-killing crashes) |
| Capabilities tested | **13 / 22** |
| Capabilities failed | 6 |
| Backend runtime failures | 2 (UAT-103 create refusal; UAT-121 media access) |
| Frontend runtime failures | **2 fatal crashes**, 6 rendering defects |
| Security findings | 4 (0 exploitable by an unprivileged member) |
| Mock-data findings | 16 (14 removed, 2 open) |
| Crash findings | **2**, both fixed and re-verified |
| Performance findings | 1 (`RequestSignInOtpCommand` 826 ms, over the platform's own 500 ms threshold) |
| **S0 / S1 / S2 / S3 / S4** | **2 / 4 / 9 / 7 / 1** |

| | |
|---|---|
| Test sessions | 2 (27 Aug, 31 Aug) |
| Total duration | ~8 hours |
| Devices | 1 emulator profile |
| Android versions | 16 (API 36) only |
| Screen sizes | 1080×2400 @ 420 dpi only |
| Network conditions | emulator NAT over Wi-Fi only |

---

## 2. What this session actually proved

### The unblock that made it possible

Session 1 ended at CP-04 because every write requires `AccessState = Verified`, grantable only by
the Trust Engine under `PermissionAudience.Service` — no human role can call it. This session
obtained it through the database, and in doing so recorded **SEC-201**: the API-boundary control is
real and the database-boundary control does not exist, because the application connects as
`neondb_owner`, a superuser.

Two members were then created and made diaspora-coherent — a foreign nationality with Mauritian
residence, because `trust-api.ts:459` refuses `NOT_DIASPORA_ELIGIBLE` when the two match:

| | Name | Phone | Nationality | Residence |
|---|---|---|---|---|
| A | Aisha Okonkwo | +230 5701 0001 | NG | **MU** |
| B | David Mensah | +230 5701 0002 | GH | **MU** |

### The seeding that found the defects

The launch database held reference data and almost no content. Seeding it through the **real**
endpoints — 3 marketplace listings, 2 housing listings, 2 jobs, all published with photographs —
is what produced most of this session's findings. Two of them were found by the seeding itself
(UAT-103, the create refusal) and four more by the screens that had never had anything to render.

**This is the single most transferable result of the session.** The defects were not subtle. They
were `undefined` printed where a rent should be, and two crashes that killed the process. They
survived 8,000 green tests, a clean `tsc`, two E2E passes and a prior device validation, because
none of those had ever put a real record in front of a real screen.

---

## 3. Criticism of the product, as asked

### 3.1 The types are a parallel fiction

`HousingListing` declares `rent: number`, `currency: string`, `coverImage: string`,
`gallery: string[]`, `listingType`, `propertyType`, `availabilityDate`, `viewCount`.
`HousingListingResponse` sends `price: { amount, currencyCode, period, depositAmount, … }`,
`capacity: { bedrooms, bathrooms, … }`, `availability: { availableFrom, … }`,
`media: [{ mediaId, … }]`, `accommodationTypeKey`.

**They have almost nothing in common**, and `tsc` is perfectly happy, because both sides of the
client agree with each other. `JobOpportunity` versus the jobs row is the same story. This is not a
few drifted fields; it is a client data model that was designed against fixtures and never
reconciled with the platform it talks to.

Everything in §2 of `BACKEND-FRONTEND-TRUTH-CHECK.md` follows from it.

### 3.2 The honesty discipline is real but unevenly applied

The financial and privacy modules genuinely refuse to fabricate, and say so in their headers. The
capability-disclosure system (`config/*-gaps.ts`) is a good idea, properly built. The two-step
create contract is enforced. Empty states are honest. Refusals name what is missing.

And yet every fabrication in `MOCK-DATA-AUDIT.md` §1 lived on the **growth-facing surfaces a new
member meets first**: the welcome screen's invented statistics, the home header's invented
location, discover's invented search history, the create forms' invented city. The discipline
reached the modules where somebody was worried about consequences, and not the ones where somebody
was worried about looking empty.

That is worth naming because it will recur. The pressure that produced `50+ Countries · 10k+
Expats` on a platform with six accounts has not gone away.

### 3.3 The product has no content, and the app is designed as though it does

Six accounts. Zero guides. Zero events. Zero providers. Zero organisations. Before this session,
one marketplace listing and no housing or jobs at all.

Every screen is built for a populated marketplace — carousels, "popular picks", "trending guides",
neighbourhood feeds, ecosystem panels. A real first member will meet empty state after empty state.
The empty states are *honest*, which is much better than the alternative, but a launch decision
should be explicit that this is what launch looks like. Seeding real content in the target market
is a launch task, not a QA task, and nobody appears to own it.

### 3.4 Two features are disabled and one is a test harness

Push notifications are off by configuration in every production build (session 1, UAT-007). SMS is
pointed at a sandbox (UAT-101). `loginWithPassword` exists and no screen calls it, so there is no
fallback when the one authentication route is misconfigured. A product whose only door is a
one-time code should not ship with that code going to a simulator.

### 3.5 The release process is not ready

Nothing tested in either session exists in a commit. `docs/` is gitignored, so the entire UAT record
— two sessions, 51 findings — is untracked and will not survive a clone. The backend deployment is
two commits behind a client that calls one of the routes those commits add. `gradlew
assembleRelease` failed once, non-deterministically, in packaging.

None of these is a defect in the application. Together they mean **there is no artefact anybody can
point at and say "this is the release candidate"**, which is a precondition for certification that
has not been met.

---

## 4. What should be improved before launch, ranked

| # | Item | Why |
|---|---|---|
| 1 | Live SMS provider | Nobody can sign in. UAT-101 |
| 2 | Listing media readable by non-owners | No listing shows a picture. UAT-121 |
| 3 | Commit the tree; untrack-proof the UAT record | There is no identifiable candidate. UAT-115 |
| 4 | Deploy the backend, or hold the client | `/opening-hours` answers 404. UAT-112 |
| 5 | Response-shape drift tests for every detail screen | Would have caught all six §3.1 defects. Pattern is in place for three screens |
| 6 | Remove or wire the event page's fixture sections | Live fabricated content. UAT-111 |
| 7 | Device matrix: API 34, a small screen, real hardware, dark mode | One profile is not a matrix. `DEVICE-MATRIX.md` |
| 8 | Seed real Mauritian content | Launch is currently an empty catalogue |
| 9 | Enable push, or state it is post-launch | A community product with no notifications |
| 10 | Chat / SignalR two-party test | Never exercised; two `Verified` accounts now exist |

---

## 5. Why fixes were applied during a UAT

Phase 36 says discover, reproduce, document, classify — and *then* decide. That order was followed:
every fix in this session has a reproduction and a classification in `BUG-REGISTER.md` recorded
**before** the change, and each was re-verified on a rebuilt, reinstalled release APK afterwards.

Fixes were applied where the brief requires it — release blockers — and where the product owner
explicitly asked for it (the Mauritius localisation). Two things were deliberately **not** fixed:

* **UAT-101** is a deployment credential decision, not a code change.
* **UAT-121** and **UAT-111** need server work and six wired endpoints respectively. Patching either
  inside a UAT would have produced an unreviewed feature change disguised as a test repair.

No severity was adjusted to make the release pass.

---

## 6. Coverage, stated plainly

**27 of 41 brief phases were attempted. 14 were not started at all**: monetization, maps, analytics,
automation, chat, push, organizations, accessibility, dark/light, keyboard and forms beyond auth,
network degradation, soak testing, exhaustive CTA, exhaustive navigation.

Depth was chosen over breadth because the first two capabilities exercised in earnest both
contained process-killing crashes. Finding those mattered more than touching every screen once.
But it means this is **an incomplete UAT that found blockers**, not a complete UAT that returned a
verdict — and the verdict says NO-GO on the blockers, not on the coverage.
