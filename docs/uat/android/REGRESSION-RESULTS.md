# Diaspora — Android Pre-Launch UAT · Regression Results

**Session 2 · 31 August 2026.** Phase 40. Run after every release-blocking fix in this session.

---

## 1. Automated

| Gate | Command | Result |
|---|---|---|
| **TypeScript** | `npx tsc --noEmit` | ✅ **exit 0**, no diagnostics |
| **Jest** | `npx jest` | ✅ **exit 0** — 157 suites passed, 1 skipped; **4,535 tests passed**, 11 skipped |
| Frontend build | `./gradlew assembleRelease` | ✅ `BUILD SUCCESSFUL` (see UAT-118 for a one-off flake) |
| Bundle artefact check | strings in the packaged Hermes bundle | ✅ see §3 |

`npm test` now exits 0. Session 1 recorded it exiting 1 with an inflated count because a stale git
worktree under `.claude/` was being collected; `jest.config.js` sets
`testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/']` and the figures above are the
real ones.

### Tests added this session

| File | Cases | Pins |
|---|---|---|
| `src/store/__tests__/location-default.test.ts` | 15 | The store ships no default place; `adoptCountry` seeds from residence; `locationLabel` never renders a leading comma; `coordinatesOf` keeps `NaN` off the wire. Includes an assertion that "Peckham" appears nowhere in the initial state. |
| `src/lib/__tests__/listing-place.test.ts` | 28 | The three list-route shapes, read from **captured deployment responses**; `placeOf` never throws on ten malformed shapes; the three cards no longer dereference `location.distanceKm` or `location.areaName`. |
| `src/lib/__tests__/housing-media-shape.test.ts` | 20 | `coverImage` is a media reference, not a URL; `gallery` is not a field; the screen resolves through `createSignedUrl`; the wire's nested `price` / `capacity` / `availability` are flattened; the rent never renders `undefined`. |
| `src/lib/__tests__/housing-create-contract.test.ts` (extended) | +3 | `rentPeriod` is sent with any rent, uses the enum member `PerMonth`, and is omitted when there is no rent. |

**+66 assertions**, every one of them derived from a defect observed on a device or against the
deployment — not from a fixture written to match the code.

---

## 2. On-device regression — release APK, `Diaspora_API36`

Each row was run from a **cold process** on a freshly installed APK.

| # | Journey | Before | After |
|---|---|---|---|
| 1 | Cold start → welcome screen | ✅ | ✅ |
| 2 | Welcome screen statistics | ❌ `50+ / 10k+ / 200+` fabricated | ✅ removed |
| 3 | Sign-in → OTP → Home | ✅ | ✅ |
| 4 | Home header location, residence MU, **GPS declined** | ❌ *Peckham, London* 🇬🇧 | ✅ **Mauritius** 🇲🇺 |
| 5 | Saved locations for a new account | ❌ Home *Peckham*, Work *Brixton* | ✅ empty |
| 6 | Discover header | ❌ *Explore Peckham · London* | ✅ **Explore Mauritius** |
| 7 | Discover recent / popular searches | ❌ *Jollof · Braids · Peckham* etc. | ✅ absent |
| 8 | Guided tour, 7 steps | ✅ never signs out | ✅ |
| 9 | **Housing detail (deep link, cold process)** | ❌ **process killed to launcher** | ✅ **renders, 0 TypeErrors** |
| 10 | Housing rent / deposit / rooms | ❌ `undefined`, `undefined`, "Bedroom" | ✅ **Rs 22000**, **Rs 44000**, **2 Bedrooms** |
| 11 | **Discover → Jobs tab** | ❌ **process killed to launcher** | ✅ **renders, 0 TypeErrors** |
| 12 | Job card place / employer / salary | ❌ blank / blank / `undefinedundefined/mo` | ✅ **Curepipe** · **Okonkwo Consulting Mauritius** · **Salary not disclosed** |
| 13 | Job expiry badge | ❌ **"Expired"** on a posting published minutes earlier | ✅ no badge when there is no closing date |
| 14 | Discovery returns seeded Mauritius content | ❌ *"No providers match in London"* | ✅ Quatre Bornes and Rose Hill listings |

**Crashes across the final sweep: 0. `TypeError` count in logcat: 0.**

---

## 3. Artefact-level verification

Counted in the Hermes bundle extracted from the **signed APK**, because source is not what ships:

| String | Reading |
|---|---|
| `api.diaspora.app` | **0** — UAT-001 stays fixed; the dead host is not in the artefact |
| `diaspora-api.fly.dev` | **1** — the reachable host is inlined by Babel, as designed |
| `Immigration tips` | **0** — the fabricated "popular search" is gone from the bundle |
| `adoptCountry` | **1** — the residence-seeding fix is in the artefact |
| `Set your location` | **1** — the honest empty label ships |
| `Salary not disclosed` | **1** — the honest salary label ships |
| `Peckham` | **35**, down from 38 — none of them a fabricated member-facing value; see `MOCK-DATA-AUDIT.md` §3 |

Residual `Peckham` occurrences remain and are **not** defects: multi-market form placeholders,
the `src/mocks/` fixtures reachable only through the still-open UAT-111, and comment blocks
documenting the removed literal. `MOCK-DATA-AUDIT.md` §3 breaks this down.

---

## 4. What this regression does **not** cover

Stated plainly, because a green regression is easy to over-read:

* **One device profile.** `Diaspora_API36` only. No small phone, no tablet, no API 34, no
  landscape, no 3-button navigation, no physical hardware. See `DEVICE-MATRIX.md`.
* **No dark-mode pass.** Session 1's **UAT-018** (invisible titles on three screens) has not been
  retested and remains open.
* **No chat, no SignalR, no push.** Two `Verified` accounts now exist, which unblocks the two-party
  messaging test, but it was not run.
* **No wallet, monetization, analytics, automation or maps journeys.**
* **No soak test.** The longest continuous session was roughly twenty minutes.
* **Nothing is committed.** Every fix above lives in an uncommitted working tree. A regression pass
  against a commit has not been run because there is no commit.

---

## 5. Verdict on the regression itself

**PASS for what it covers.** Every defect fixed in this session was reproduced before the fix and
re-verified after it on a rebuilt, reinstalled release APK, and the automated gates are green.

That is not the same as a release-ready regression. Two of the three release blockers found this
session are fixed and verified; **UAT-101 remains open and is not a code defect**, so no amount of
regression testing here can close it.
