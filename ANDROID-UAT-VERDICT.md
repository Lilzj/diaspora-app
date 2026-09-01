# Android Pre-Launch UAT — Verdict

> **This file is tracked deliberately.** `.gitignore:92` is `docs/`, so the full UAT record under
> `docs/uat/android/` is **untracked and will not survive a fresh clone** (UAT-115). This summary
> exists so the decision does. The detail — reproductions, evidence, root causes — is in that
> directory on the machine that ran the tests.

**Date:** 31 August 2026 (session 2; session 1 was 27 August)
**Build:** `app-release.apk` · `1.0.1` / versionCode 2 · minSdk 24 · targetSdk 36 · Hermes
**Source:** frontend `5bc2690` **plus an uncommitted working tree**
**Backend:** `https://diaspora-api.fly.dev/v1`, `Production`, Neon PostgreSQL, deployed image v7
**Device:** emulator `Diaspora_API36` — Android 16, 1080×2400 @ 420 dpi, portrait, light mode

---

## ANDROID: **NO-GO** · IOS: **NOT TESTED, NOT CERTIFIED**

> **Session 3 update (31 Aug 2026).** Sign-in moved from a phone one-time code to
> **email + password**, and the whole password lifecycle — change, forgot, reset — was
> built and verified end to end. Nine open findings were closed. **One release blocker
> remains** (UAT-121, listing photographs). UAT-101 drops **S0 → S1**: members can now
> sign in without SMS, but SMS still has to work before launch because phone verification
> gates every write. See §"Session 3" below.

**29 findings across sessions 2–3** — now 1×S0 resolved-to-S1, 5×S1, 13×S2, 8×S3, 1×S4.
**26 fixed and re-verified. 3 open, of which 1 is a release blocker.**

---

## Session 3 — what changed

### Sign-in is email and password

Signing in cost an SMS **every time**. A password costs nothing to deliver, so SMS is now
spent only on phone verification — the one thing a message actually proves, and a
once-per-account event rather than a once-per-session one.

Verified against the live deployment: register **201**, sign in **200 with zero SMS**,
duplicate email **409**, wrong password and unknown email both **401** and
indistinguishable, recovery **200** naming the SMS, reset **200** with the old password
then refused, change-password **403** on a wrong current password and **200** on the right
one. On device: signed in as a Mauritian member, landed on Home, 📍 Mauritius, **0
TypeErrors**.

Two defects surfaced while building it. **The email was collected and thrown away** —
`register.tsx` always asked for it, always required it, and the `register()` call never
sent it, so every account had a null email. And the change-password screen first claimed
*"Your other devices are not affected"* when the server reports *"14 other session(s) were
signed out"* — the exact defect class this audit exists for, reintroduced by the audit.
Both corrected and pinned by tests.

### Nine findings closed

| | |
|---|---|
| **UAT-124** | Wallets follow the member's residence. `CountryCurrency` resolves MU→MUR, NG→NGN and the rest; 10 existing wallets backfilled — every wallet on the platform was empty with zero ledger entries, so it was lossless |
| **UAT-125** | The seller, landlord and employer dashboards resolve by ownership. Verified live: the caller sees their own, another member's still refuses |
| **UAT-127** | Change, forgot and reset password all exist, are reachable, and work |
| **UAT-128** | The tour renders only on its own step's route |
| **UAT-111** | The event page's six fabricated sections are gone; the fixture imports are deleted |
| **UAT-113** | `housing.price.period-required` names the period and lists its members |
| **UAT-115** | The 16 UAT documents and the root verdict are tracked; evidence stays out |
| **UAT-117** | The dead `LocationInput` and its hardcoded London list are deleted |
| **UAT-129** | The perf budget is calibrated per run — verified passing under six competing CPU hogs |

---

## The remaining blocker

### UAT-121 — no listing photograph is visible to anyone · **S1**

A signed URL can be minted only by the **uploader** (404 for every other member); the URL still
requires a bearer token that React Native's `<Image>` never sends; and it comes back relative with
a different prefix from the client's API base.

A listing **cannot be published without a photograph** — the server enforces it. So every listing
has one and nobody can see it. **Server-side; the client half is fixed.**

---

## Three crashes found and fixed

Each killed the app process to the launcher; each was 100 % reproducible from a cold start.

| | Screen | Cause |
|---|---|---|
| **UAT-102** | Housing detail, any listing with a photograph | `coverImage` is `{ mediaId, … }`, not a string; `gallery` is not a field. `.trim()` on an object |
| **UAT-120** | **Discover → Jobs tab**, any job posting | `GET /jobs` sends no `location` object; `location.distanceKm` threw |
| **UAT-126** | Marketplace detail, any real listing | the wire sends `seller.displayName`; the screen read `seller.name`. `.split()` on undefined |

All three are the same defect wearing three hats: **the client's types agree with the client's
fixtures and disagree with the server.** All three were latent behind an empty table.

Alongside them: housing listings that stated a rent **could not be created at all** (UAT-103, S1);
the housing detail rendered `MONTHLY RENT undefined` (UAT-119, S1); every job posting was labelled
**"Expired"** (UAT-122); no marketplace listing displayed its photograph (UAT-106).

---

## Four more open majors, from the full-route sweep

| | |
|---|---|
| **UAT-124** | Every member's wallet is denominated **GBP** — including Mauritius residents whose own listings are priced in MUR. `UserRegisteredConsumer` passes `countryCode` and `currency: null`; the currency resolver never reads the country and falls back to `"GBP"` |
| **UAT-125** | The **seller, landlord and employer** analytics dashboards can never return `canView: true` **for anybody**. `canView` is hard-coded to `subjectType == "creator"`, and the fallback maps *content* types only — `seller` is not one, so the branch is skipped. Three screens, linked from Profile, dead for every user |
| **UAT-127** | There is **no change-password and no forgot-password anywhere in the client** — no screen, no function, no "Forgot" text — yet **account deletion requires the password**, which is set once at registration and never used again because sign-in is OTP-only. The backend already serves `/auth/forgot-password` and `/auth/reset-password` |
| **UAT-128** | A guided tour **follows the member across every screen**. Started on Jobs, it was observed covering *"Withdrawals are not available yet"* on the Withdraw screen while still reading "Filter Openings". `TourProvider` renders on `activeTour` alone and never compares the current route to the step's |

---

## The Mauritius localisation — fixed and verified

A member resident in **Mauritius** was told they were in **Peckham, London**, with every discovery
query scoped to a 5 km circle around Rye Lane and the empty state *"No providers match in London"*.
Their saved locations already held a Home in Peckham and a Work in Brixton they had never entered.

`store/location.ts` no longer ships a default place. The discovery context is seeded from the
member's own `countryOfResidence`, and a country-precision location forces a country-wide radius so
a national centroid is never used as a pin. Fourteen fabricated user-facing values were removed
across nine files, including the welcome screen's `50+ Countries · 10k+ Expats · 200+ Local Guides`
against a platform holding six accounts and zero guides.

**Verified on device with location permission declined** — the stronger test, because it proves the
country comes from the member's record rather than from a fix that happened to work.

---

## Why 8,000 green tests missed all of this

> **An empty table is not a passing test.**

The launch database held **zero housing listings and zero jobs**. Neither screen had ever been
rendered against a real record. Both crashed within seconds of the first one existing.

Underneath that: **the client's types agree with the client's fixtures and disagree with the
server.** `HousingListing` declares `rent: number`, `coverImage: string`, `gallery: string[]`; the
wire sends `price: { amount, currencyCode, … }`, `media: [{ mediaId, … }]` and no `gallery` at all.
`tsc` is content, because both sides of the client agree with each other.

**Counter-measure, now partly in place:** capture one real response per detail screen from the
deployment and assert that every field the screen dereferences exists in it. Three new test files
do exactly that with verbatim captured payloads — 66 new assertions, every one derived from an
observed defect.

---

## Regression at the time of this verdict

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx jest` | ✅ exit 0 — **157 suites, 4,544 tests** |
| `./gradlew assembleRelease` | ✅ `BUILD SUCCESSFUL` |
| On-device sweep, 14 journeys | ✅ **0 crashes, 0 `TypeError`s** |
| **Full route sweep, 203 screens** | ✅ **202 clean; 1 crash found and fixed** |
| Packaged bundle | ✅ `api.diaspora.app` absent; the reachable host inlined |

---

## Conditions for a GO

1. Point SMS at a live provider; prove a code reaches a real handset.
2. Make listing media readable by anyone who can read the listing, and the signed URL
   self-authenticating. Keep 404-not-403 for genuinely private assets.
3. **Commit the tree** and rebuild from a clean checkout — nothing tested in either session exists
   in a commit.
4. Deploy the backend, or hold the client: it calls `/providers/{id}/opening-hours`, which the
   deployment answers **404** (UAT-112).
5. Remove or wire the event page's six fixture-driven sections (UAT-111) — live in the release
   bundle with no dev guard.
6. Add a **top-level error boundary**. Both crashes were reported by React and still killed the
   process; a boundary converts the next one from S0 into S2. Highest-value structural change
   available, and independent of every defect above.
7. Test a second device profile and real hardware. `minSdk` is 24; nothing below API 36 was touched.
8. Run the untouched phases: chat/SignalR (two `Verified` accounts now exist, which unblocks it),
   wallet, monetization, maps, analytics, automation, dark mode, degraded network, soak.

---

## Scope, stated honestly

**203 of 254 screens (80 %). ~60 of 675 CTAs (9 %). 31 of 41 brief phases attempted.**
One device, portrait, light mode, good network.

The session went depth-first because the first two capabilities exercised in earnest both contained
process-killing crashes. That was the right trade, and it means this is **an incomplete UAT that
found blockers**, not a complete one that returned a verdict. Every "PASS" in the full record is
scoped to what was actually driven.
