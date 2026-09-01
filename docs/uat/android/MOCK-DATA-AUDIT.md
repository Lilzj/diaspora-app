# Diaspora — Android Pre-Launch UAT · Mock and Placeholder Data Audit

**Session 2 · 31 August 2026.** Scope is the **release path** — anything reachable from a
production build. Occurrences in `__tests__`, in documentation, and behind a `__DEV__` or
`EXPO_PUBLIC_ENABLE_GAP_PREVIEW` guard are listed separately and are not defects.

The distinction that matters here is not *"is the word `mock` in this file"* but
**"can a member on a Play Store build be shown something the platform did not produce"**.

---

## 1. User-facing fabrications found in the release path

| # | Where | What a member saw | Sev | State |
|---|---|---|---|---|
| 1 | `app/(auth)/index.tsx` | `50+ COUNTRIES · 10k+ EXPATS · 200+ LOCAL GUIDES` | S2 | **removed** |
| 2 | `app/(auth)/index.tsx` | *"· Trusted by thousands"* | S3 | **removed** |
| 3 | `store/location.ts` | `currentLocation` = Peckham, London, **Rye Lane** | S1 | **removed** |
| 4 | `store/location.ts` | saved **Home: Peckham**, saved **Work: Brixton** | S2 | **removed** |
| 5 | `store/location.ts` | two seeded `recentLocations` | S2 | **removed** |
| 6 | `store/location.ts` | travel mode defaulted to **Rose Hill, Mauritius** | S3 | **removed** |
| 7 | `app/(tabs)/discover.tsx` | recent searches *Jollof · Braids · Peckham* | S2 | **removed** |
| 8 | `app/(tabs)/discover.tsx` | popular searches *Mama Afrika · Visa application · Brixton market · Immigration tips* | S2 | **removed** |
| 9 | `community-life/event/create.tsx` | form opened on city **London**, area **Peckham**, zone **Europe/London** | S2 | **removed** |
| 10 | `community-life/org/create.tsx` | form opened on city **London**, area **Peckham** | S2 | **removed** |
| 11 | `app/update/create.tsx` | alert location defaulted to *"Peckham, London"* | S3 | **removed** |
| 12 | `app/update/create.tsx` | two quick templates named *Peckham High Street* and *Atlantic Road* | S3 | **removed** |
| 13 | `store/map-session.ts` | every map opened over south London at zoom 3 | S3 | **removed** |
| 14 | `maps/providers/device-location.ts` | the simulated handset was seeded to Peckham | S4 | **removed** |
| 15 | **`community-life/event/[id].tsx`** | six sections of an event page built from fixtures | **S2** | **OPEN** |
| 16 | `components/LocationInput.tsx` | a hardcoded ten-item London suggestion list | S4 | **OPEN** (dead) |

Items 3–14 are the same root cause as **UAT-104** and were removed together. Item 1–2 is
**UAT-107**; item 7–8 is **UAT-109**; item 9–11 is **UAT-110**/**UAT-114**.

---

## 2. The one that is still live — UAT-111

`src/app/community-life/event/[id].tsx`, lines ~243–275:

```js
const updates  = mockCommunityUpdates.filter(i => i.location.cityName.toLowerCase() === city)…
const jobs     = mockJobs.filter(i => i.location.cityName.toLowerCase() === city)…
const housing  = mockHousingListings.filter(…)
const services = mockListings.filter(…)
const guides   = mockGuides.filter(…)
const orgs     = mockOrganizations.filter(…)
```

Six sections of the event detail page — *nearby updates, jobs, housing, services, guides,
organisations* — are assembled from `src/mocks/`, filtered by city name. There is **no `__DEV__`
guard and no gap-preview flag**: this is live in the signed release bundle.

The fixtures behind it are substantial. `src/mocks/community-data.ts` alone contains full
multi-paragraph guide articles naming real businesses in Peckham, Brixton and Woolwich, complete
with author records. For a London event the page presents them as platform content. For a Mauritian
event the city filter matches nothing, so the section renders empty — which conceals the problem
rather than solving it.

**Recommendation:** gate the section on real endpoints, or remove it, before launch. It is not a
UAT-sized repair — six routes have to be wired — which is why it is documented rather than patched.

---

## 3. Verified at the artefact level

Strings were counted in the packaged Hermes bundle extracted from the signed APK, not in source,
because the question is what ships:

```
unzip -p app-release.apk assets/index.android.bundle | grep -c "<string>"
```

| String | Before | After | Reading |
|---|---|---|---|
| `Immigration tips` | 1 | **0** | fabricated popular search, gone |
| `api.diaspora.app` | 0 | **0** | UAT-001 stays fixed |
| `diaspora-api.fly.dev` | 1 | 1 | the real host is inlined |
| `adoptCountry` | — | 1 | the fix is in the artefact |
| `Mama Afrika` | 1 | 1 | remains only in `mocks/`, reachable through UAT-111 |
| `Salary not disclosed` | — | 1 | the honest salary label ships |
| `Set your location` | — | 1 | the honest empty label ships |
| `Peckham` | 38 | **35** | **see below** |

**The residual `Peckham` count is expected and is not a defect.** What remains is:

* form **placeholders** (grey hint text) — now multi-market, e.g. *"e.g. Rose Hill, Peckham, East
  Legon"*;
* `src/mocks/community-data.ts` and `community-life-data.ts` — reachable only through UAT-111;
* comment blocks in `store/location.ts`, `country-centroids.ts` and the new tests that **document
  the removed literal**. An earlier wave in this programme recorded the rule that
  *documenting a removed lie must not be indistinguishable from committing it* — the tests strip
  comments before asserting, for exactly this reason.

---

## 4. Occurrences that are **not** defects

| Pattern | Count (src, non-test) | Assessment |
|---|---|---|
| `src/mocks/countries.ts` — `allCountries` | imported by 4 auth screens | **Reference data, not a mock.** 192 ISO countries with flags and calling codes. Mis-named; the file should move out of `mocks/`. |
| `mockCategories`, `mockJobCategories`, `mockHousingCategories`, `mockMarketplaceCategories` | 5 create screens | **Category catalogues.** The equivalents are served (`/marketplace/categories`, `/jobs/categories`, `/housing/accommodation-types` all answer), so these are stale duplicates rather than fictions. Low severity; worth replacing with the served lists. |
| `mockLanguages` | `choose-language.tsx` | A static language list. Legitimate. |
| `config/*-gaps.ts` | 8 files | **Capability disclosure, the opposite of mock data.** These declare what the platform cannot yet do so the UI can say so. |
| `areSimulatedFeaturesEnabled()` | media upload, maps providers | Correctly gated on `EXPO_PUBLIC_ENABLE_GAP_PREVIEW`, which the `production` profile does not set. |
| `setSimulatedCountry` | `detect-country.ts` | Guarded on `__DEV__` alone — deliberately stricter than the repo's usual gate, and correctly so, since it defeats a residency check. |

---

## 5. `TODO` / `FIXME` / "coming soon" sweep

No `TODO` or `FIXME` markers were found on any user-visible string in the release path. Phrases of
the *"not implemented"* family that do appear are **intentional capability disclosure** raised from
`config/*-gaps.ts` — for example the financial module's refusals, which name the missing endpoint
rather than faking a transaction. That discipline is real and holds where it was applied.

**The finding worth carrying forward** is that it was applied unevenly. The financial and privacy
modules refuse to fabricate and say so in their headers. The growth-facing surfaces a new member
meets first — the welcome screen, the home header, discover, the create forms — were where every
fabrication in section 1 lived.
