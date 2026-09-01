# Diaspora — Android Pre-Launch UAT · Bug Register

**Session 2** — 31 August 2026. Frontend `5bc2690` + uncommitted working tree · backend deployed
image v7 (`dd5286c`) · `https://diaspora-api.fly.dev/v1` · `ASPNETCORE_ENVIRONMENT=Production` ·
Neon PostgreSQL · emulator `Diaspora_API36`, Android 16 (API 36), 1080×2400 @ 420 dpi.

Session 1 (27 Aug) findings are `UAT-0xx` and live in the sibling documents. This session's are
`UAT-1xx`. Where a session-1 finding was retested, its row says so.

**Severity** — S0 release blocker / data loss / security · S1 critical functionality failure ·
S2 major defect · S3 moderate · S4 minor.

---

## Standing findings — this session

| ID | Sev | Pri | Title | State |
|---|---|---|---|---|
| **UAT-101** | **S0** | P0 | Launch environment sends every one-time code to the Africa's Talking **sandbox**; sign-in is OTP-only, so no real member can get in | **OPEN** |
| **UAT-102** | **S1** | P0 | Housing detail screen crashes the app to the launcher for every listing with a photograph | **FIXED, verified on device** |
| **UAT-103** | **S1** | P0 | Housing listings that state a rent cannot be created — `400 housing.price.required` | **FIXED, verified against the API** |
| **UAT-104** | **S1** | P1 | Discovery scoped every query to a 5 km circle in Peckham, London, for a member resident in Mauritius | **FIXED, verified on device** |
| **UAT-105** | **S2** | P1 | "Use GPS Location" fails silently — sheet closes, location unchanged, no message | **FIXED, retest pending** |
| **UAT-106** | **S2** | P1 | No marketplace listing ever displays its photograph | **FIXED, retest pending** |
| **UAT-107** | **S2** | P1 | Welcome screen states `50+ Countries · 10k+ Expats · 200+ Local Guides` against 6 accounts and 0 guides | **FIXED, verified on device** |
| **UAT-108** | **S2** | P2 | Saved locations pre-seeded with a "Home" in Peckham and a "Work" in Brixton the member never entered | **FIXED, verified on device** |
| **UAT-109** | **S2** | P2 | Discover shows fabricated recent searches (*Jollof, Braids, Peckham*) and hardcoded London "popular" searches | **FIXED, verified on device** |
| **UAT-110** | **S2** | P2 | Event and organisation create forms default to London / Peckham / `Europe/London` | **FIXED, retest pending** |
| **UAT-111** | **S2** | P2 | Event detail page builds its whole "nearby ecosystem" from hardcoded fixtures, with no dev guard | **OPEN** |
| **UAT-112** | **S2** | P1 | Two backend commits are not deployed; `/v1/housing/.../opening-hours` and `/v1/payouts/providers` answer 404 | **OPEN** |
| **UAT-113** | **S3** | P2 | `housing.price.required` is returned when the *period* is unparseable, naming the wrong field | **OPEN** (backend) |
| **UAT-114** | **S3** | P2 | Community update composer defaulted its location to "Peckham, London" and its templates named London streets | **FIXED, retest pending** |
| **UAT-115** | **S3** | P3 | `docs/` is gitignored, so every UAT deliverable in this programme is untracked | **OPEN** |
| **UAT-116** | **S4** | P3 | Sign-in placeholder and hint offer only `+234` / `+44` examples | **FIXED** |
| **UAT-117** | **S4** | P3 | `LocationInput` ships a hardcoded ten-item London suggestion list and is imported by nothing | **OPEN** (dead code) |
| **UAT-118** | **S3** | P3 | `gradlew assembleRelease` intermittently fails in `packageRelease`; a bare retry succeeds | **OPEN** (build) |
| **UAT-119** | **S1** | P0 | Housing detail rendered `MONTHLY RENT undefined`, `Deposit: undefined`, `BEDROOMS Bedroom` | **FIXED, verified on device** |
| **UAT-120** | **S0** | P0 | **Discover → Jobs tab crashed the app** for every job posting | **FIXED, verified on device** |
| **UAT-121** | **S1** | P0 | Listing photographs are readable only by the uploader, and the "signed" URL still needs a bearer token — so no photograph is visible to anyone | **FIXED** (backend); not re-verified on device |
| **UAT-122** | **S2** | P1 | Every job posting was labelled **"Expired"**; `closingAt: null` parsed as the Unix epoch | **FIXED, verified on device** |
| **UAT-123** | **S3** | P2 | `Explore Mauritius · ▾` and `Address: · Quatre Bornes` — stray separators where an empty field used to be filled | **FIXED** |
| **UAT-124** | **S2** | P1 | Every member's wallet is denominated **GBP**, including Mauritius residents pricing in MUR | **FIXED** (backend); not re-verified on device |
| **UAT-125** | **S2** | P1 | The **seller, landlord and employer** analytics dashboards can never return `canView: true` for anybody | **OPEN** (backend) |
| **UAT-126** | **S1** | P0 | Marketplace detail crashed the app on a real listing — `seller.name` is `seller.displayName` on the wire | **FIXED, verified on device** |
| **UAT-127** | **S2** | P1 | No change-password and no forgot-password anywhere in the client, yet **account deletion requires the password** | **OPEN** |
| **UAT-128** | **S2** | P2 | A guided tour follows the member across every screen, describing the wrong one and covering content | **OPEN** |
| **UAT-129** | **S3** | P3 | A wall-clock budget assertion in the unit suite fails under load (253 ms vs 250 ms) | **FIXED** — budget calibrated per run |
| **UAT-130** | **S3** | P2 | `POST /auth/otp/sign-in` answers **400** to a wrong code and **404** to a replayed registration code, where the route documents **401** | **OPEN** (backend) |
| **UAT-131** | **S2** | P1 | **A fresh clone of the backend does not compile** — two analyzer files the build requires are gitignored | **OPEN** (build) |
| **UAT-132** | **S1** | P0 | **Housing photographs were minted and never fetched** — a `w-screen` carousel slide measured zero wide on Android, and a zero-sized image issues no request | **FIXED, verified on device** |
| **UAT-133** | **S3** | P2 | Discover read **"No providers match in "** — the heading interpolated a `cityName` that a country-precision location does not have | **FIXED, verified on device** |

### Session 3 — resolutions

| ID | Was | Now |
|---|---|---|
| **UAT-101** | **S0** — nobody can sign in; SMS sandbox, OTP-only | **S2** — sign-in is email + password and needs no SMS. Sandbox accepted for testing by the product owner (1 Sep 2026); switching to a live provider is a **launch condition**, because phone verification gates every write |
| **UAT-111** | **S2** OPEN — event page built six sections from fixtures | **FIXED** — the fabricated content is gone; the sections render honest empty states and the fixture imports are deleted |
| **UAT-113** | **S3** OPEN — `housing.price.required` named the wrong field | **FIXED** — new `housing.price.period-required`, naming the period and listing its members |
| **UAT-115** | **S3** OPEN — `docs/` gitignored | **FIXED** — the 16 UAT documents and the root verdict are tracked; screenshot evidence stays out |
| **UAT-117** | **S4** OPEN — dead `LocationInput` with a hardcoded London list | **FIXED** — deleted; it was imported by nothing |
| **UAT-124** | **S2** OPEN — every wallet denominated GBP | **FIXED** — `CountryCurrency` resolves from residence; 10 existing wallets backfilled (all empty, so lossless) |
| **UAT-125** | **S2** OPEN — seller/landlord/employer analytics unviewable by anyone | **FIXED** — role subjects resolve by ownership; verified live, and another member's subject still refuses |
| **UAT-127** | **S2** OPEN — no password change or recovery anywhere | **FIXED** — three screens built, wired and verified end to end |
| **UAT-128** | **S2** OPEN — a tour followed the member across the app | **FIXED** — the overlay renders only on its own step's route |
| **UAT-129** | **S3** OPEN — wall-clock test flake | **FIXED** — budget calibrated against the machine, verified under six competing CPU hogs |

---

## UAT-101 — the launch environment cannot deliver a one-time code

**Severity S0 · Priority P0 · OPEN · Feature: authentication · Screen: Sign in / Register**

### Reproduction

```bash
flyctl ssh console -a diaspora-api -C "printenv Sms__AfricasTalking__UseSandbox"
flyctl ssh console -a diaspora-api -C "printenv Sms__DefaultProvider"
```

### Expected

A production deployment sends one-time codes to real handsets.

### Actual

```
Sms__AfricasTalking__UseSandbox = true
Sms__DefaultProvider            = AfricasTalking
```

Every code is posted to `https://api.sandbox.africastalking.com/version1/messaging`. The sandbox
**accepts** the request and returns `statusCode 101 Success` — it just never delivers to a handset.
Backend log for a real sign-in attempt:

```
Diaspora.Sms.RoutedSmsOtpDeliveryService
A SignIn code was accepted by AfricasTalking for +23***001 (ATXid_67a9e3606e5887d32078482f066654c2).
```

### Why it is S0

`loginWithPassword` exists in `auth-api.ts:355` and **no screen calls it** (session 1, UAT-021).
SMS is therefore the only route into the product. A member who installs from the Play Store enters
their number, waits, and never receives a code. Registration and sign-in are both dead.

### Evidence that the sandbox is not the constraint

A direct probe with the deployment's own credentials shows the sandbox *does* accept Mauritian
numbers, so this is purely a configuration switch, not a provider limitation:

```
+23057010001  ->  201 {"status":"Success","statusCode":101}   (Mauritius)
+2348100200001 -> 201 {"status":"Success","statusCode":101}   (Nigeria)
```

> This also **corrects a standing belief** carried into this session — that the sandbox rejects
> `+230` with `403 InvalidPhoneNumber` inside an HTTP 201. It does not, at least not now.

### Fix

Set `Sms__AfricasTalking__UseSandbox=false` with live Africa's Talking credentials, or set
`Sms__DefaultProvider=Twilio` with a route for African calling codes. Then re-run Phase 2 and
Phase 3 end to end on a real handset. **Not fixed in this session: it is a deployment credential
decision, not a code change.**

---

## UAT-102 — opening any housing listing kills the app

**Severity S1 · Priority P0 · FIXED, retest pending · Screen: `app/housing/[id].tsx`**

### Reproduction — 100 %, from a cold process

```bash
adb shell am force-stop com.diaspora.app
adb shell monkey -p com.diaspora.app -c android.intent.category.LAUNCHER 1
adb shell am start -a android.intent.action.VIEW \
  -d "diaspora:///housing/01a05770-234c-704b-a2a6-1c2b51579912" com.diaspora.app
```

### Expected

The listing detail renders.

### Actual

The screen goes white and the process dies. `topResumedActivity` becomes
`com.android.settings/.FallbackHome` — the app is gone, not backgrounded.

```
E/ReactNativeJS: { [TypeError: undefined is not a function]
  componentStack: '\n    at HousingDetailScreen (address at index.android.bundle:1:3016053) …',
  isComponentError: true }
W/InputDispatcher: channel 'com.diaspora.app/.MainActivity' ~ Consumer closed input channel
```

### Root cause

Resolved through the release source map — `index.android.bundle.map`, generated column `3016053`
→ `/src/app/housing/[id].tsx`. The throw site is the carousel construction:

```js
const photos = [
  ...(listing.gallery ?? []),
  ...(listing.coverImage ? [listing.coverImage] : []),
].filter((uri, index, all) => uri.trim().length > 0 && all.indexOf(uri) === index);
```

Both reads are wrong against the deployed contract. `GET /housing/listings/{id}` returns:

```json
"coverImage": { "mediaId": "ddcb0b0d-…", "role": "Gallery", "order": 0, "caption": null },
"media":      [ { "mediaId": "ddcb0b0d-…", "role": "Gallery", "order": 0, "caption": null } ]
```

There is **no `gallery` field**, and `coverImage` is an object. So `uri` was an object, `uri.trim`
was `undefined`, and calling it threw during render.

### Why this is a blocker, not an edge case

Publication **requires** a photograph — `POST /housing/listings/{id}/publish` refuses with
*"Before this listing can be published it still needs at least one photograph"*. So every listing a
member can ever browse has one, and every one of them crashed the app.

### Why nothing caught it

The database held **zero housing listings**. `tsc` passed because the client's own
`HousingListing` type declares `coverImage: string` and `gallery: string[]` — a shape the server has
never sent. Drift that both sides agree on internally and disagree on across the wire is invisible
to type-checking and to any test that builds its own fixture.

### Fix

`src/types/housing.ts` gains `HousingMediaRef`, `coverImageUri()` and `housingMediaIds()`;
`coverImage` is widened to `string | HousingMediaRef | null` and `media` declared. The screen
resolves identifiers through `POST /media/{id}/signed-url`. Guarded by
`src/lib/__tests__/housing-media-shape.test.ts` (11 assertions).

---

## UAT-103 — a housing listing that states a rent cannot be created

**Severity S1 · Priority P0 · FIXED, retest pending · Screen: `app/housing/create.tsx`**

### Reproduction

Three identical payloads against the live deployment, differing only in the price fields:

| Payload | Result |
|---|---|
| **A** — the client's payload exactly as shipped (`rentAmount: 22000`, no `rentPeriod`) | **400 `housing.price.required`** |
| **B** — same, plus `rentPeriod: "PerMonth"` | **201 Created** |
| **C** — same, with `rentAmount` omitted | **201 Created** |

### Actual

*"State the rent, or mark the price as on application."* — shown to a landlord who has just typed
the rent into a field labelled **Monthly Rent Amount**.

### Root cause

`CreateHousingListingCommandHandler.BuildPrice`:

```csharp
if (request.RentAmount is null)
    return Result.Success(HousingPrice.OnApplication(…));

if (!Enum.TryParse<RentPeriod>(request.RentPeriod, ignoreCase: true, out var period)
    || period == RentPeriod.None)
    return Result.Failure<HousingPrice>(HousingErrors.PriceRequired);
```

`app/housing/create.tsx` never sent `rentPeriod`. A missing rent is a success (price on
application); a rent with no period is a failure. **The only housing listings the screen could
publish were ones with no price.**

### Why the drift checker missed it

`RentPeriod` is `string?` on the DTO — *optional*. `backend-request-binding-drift.test.ts` compares
the payload against the contract's `required` members, so an optional field the handler treats as
mandatory is exactly its blind spot.

### Fix

`rentPeriod: rent ? 'PerMonth' : undefined` — `PerMonth` is the enum member and matches the only
rent field the form has. Guarded by three new cases in
`src/lib/__tests__/housing-create-contract.test.ts`. A per-week or per-night let needs a period
selector on the form before it can be offered.

---

## UAT-104 — a member in Mauritius was placed in Peckham, London

**Severity S1 · Priority P1 · FIXED, verified on device**

### Reproduction

Sign in as a member whose `countryOfResidence` is `MU`, on a device whose GPS is fixed to Port Louis
(−20.1609, 57.5012), with `ACCESS_FINE_LOCATION` granted.

### Actual (before)

| Surface | What it said |
|---|---|
| Home header | 📍 **Peckham, London** · 🇬🇧 |
| Discover header | *"Explore **Peckham** · London"* |
| Discovery radius | **5 km** — a circle around Rye Lane |
| Discover empty state | *"No providers match in **London**"* |
| Location sheet | ACTIVE DISCOVERY LOCATION: **Peckham, London** |

### Root cause

`store/location.ts` initialised `currentLocation` to a literal:

```js
export const DEFAULT_LOCATION = {
  countryCode: 'GB', cityName: 'London', neighborhood: 'Peckham', street: 'Rye Lane',
  latitude: 51.4742, longitude: -0.0691, displayName: 'Peckham, London',
};
```

A previous wave had fixed `detectLocation` so a failed fix no longer *overwrites* the stored
location — but the value it declines to overwrite **is** London. The seed was never addressed.

### Fix

- `DEFAULT_LOCATION` and `MAURITIUS_DEFAULT` are deleted. The store opens on `UNKNOWN_LOCATION`:
  no country, no city, no neighbourhood, a non-finite coordinate, and the label *"Set your
  location"*.
- `adoptCountry(countryCode)` seeds the discovery context from the member's own
  `countryOfResidence`, pushed by the auth store on both routes into `authenticated`. It only ever
  upgrades — a location the member chose, or one the handset measured, is never downgraded.
- A country-precision location forces `searchRadius = -2` ("entire country"), which every query
  builder already reads as "send no proximity filter". A national centroid therefore centres a map
  and never claims a distance.
- `src/lib/location/country-centroids.ts` carries real centroids for the served countries and the
  diaspora corridors; an unlisted country gets no pin rather than `0, 0`.
- `coordinatesOf()` keeps a non-finite coordinate off the wire at the six discovery query sites.

### Retest — on device, 31 Aug, release APK, location **declined**

| | |
|---|---|
| Home header | 📍 **Mauritius** · 🇲🇺 |
| Discovery results | *Furnished 2-bedroom apartment, **Quatre Bornes*** · *Single room… **Rose Hill*** |
| Radius | entire country |

Guarded by `src/store/__tests__/location-default.test.ts` (15 assertions), including one that
asserts the string "Peckham" appears nowhere in the store's initial state.

---

## UAT-105 — "Use GPS Location" fails silently

**Severity S2 · Priority P1 · FIXED, retest pending · Screen: `components/GlobalLocationSelector.tsx`**

### Reproduction

Open the location sheet, press **Use GPS Location** on a device where the fix or the reverse
geocode fails.

### Actual

The spinner runs, the sheet closes, the location is unchanged, and **nothing is said**.

### Root cause

```js
const handleGPSDetect = async () => {
  try {
    await store.detectLocation();   // returns null on failure — never throws
    onClose();                       // runs regardless
  } catch (err) {
    setGpsError('Could not detect location…');   // unreachable
  }
};
```

`detectLocation` returns `null` for a declined permission and for a failed fix alike. The `catch`
was dead code and `gpsError` — which the component already renders — could never be set.

### Fix

Read the return value. Distinguish a refusal from a failure using `permissionStatus`, because one
is a permission the member can grant and the other is not their doing. Keep the sheet open so the
search field is right there.

---

## UAT-106 — no marketplace listing displays its photograph

**Severity S2 · Priority P1 · FIXED, retest pending · Screen: `app/marketplace/[id].tsx`**

Same contract drift as UAT-102, different symptom. `GET /marketplace/listings/{id}` returns:

```
coverImage = undefined      gallery = undefined
media      = [{ "mediaId": "9d9f1cd3-…", "role": "Cover", "order": 0, "caption": null }]
```

The screen read `listing.gallery` and `listing.coverImage`, got `undefined` for both, and rendered
*"No photos of this item"* for every listing — including the ones whose seller uploaded a
photograph, which is all of them, because publication requires one. It did not crash only because
it does not call `.trim()` on the entries.

**Fixed** by resolving `media` identifiers through `POST /media/{id}/signed-url`.

---

## UAT-107 — fabricated platform statistics on the first screen

**Severity S2 · Priority P1 · FIXED, verified on device · Screen: `app/(auth)/index.tsx`**

The welcome screen — the first thing a Play Store install opens on — read:

```
50+ COUNTRIES     10k+ EXPATS     200+ LOCAL GUIDES
🔒 Private community for people living abroad · Trusted by thousands
```

None of the three was read from anything; all were literals. At the time of testing the platform
held **6 accounts, 0 published guides and 2 supported countries**.

Beyond being untrue, an unfounded scale claim on a store-listing screen is a Play policy exposure.

**Fixed:** the counts and "Trusted by thousands" are removed. The callout now says what the product
*is* rather than how big it is. A real count needs an endpoint that serves one.

---

## UAT-108 — saved locations the member never saved

**Severity S2 · Priority P2 · FIXED, verified on device**

The location sheet listed, for a four-minute-old account:

```
SAVED LOCATIONS
  Home   Peckham, London      🗑
  Work   Brixton, London      🗑
RECENT SEARCHES
  Peckham 🇬🇧
```

`savedLocations` was initialised with `Home: DEFAULT_LOCATION` and a literal Brixton `Work`;
`recentLocations` was seeded with two entries. Presented as the member's own data, with a delete
button next to each.

**Fixed:** all three start empty.

---

## UAT-111 — the event page's "nearby ecosystem" is entirely fixtures

**Severity S2 · Priority P2 · OPEN · Screen: `app/community-life/event/[id].tsx`**

```js
const updates  = mockCommunityUpdates.filter(i => i.location.cityName.toLowerCase() === city)…
const jobs     = mockJobs.filter(…)
const housing  = mockHousingListings.filter(…)
const services = mockListings.filter(…)
const guides   = mockGuides.filter(…)
const orgs     = mockOrganizations.filter(…)
```

Six sections of an event detail page — nearby updates, jobs, housing, services, guides and
organisations — are built from hardcoded fixtures in `src/mocks/`, filtered by city name. **No
`__DEV__` guard and no gap-preview flag**, so this is live in the release bundle. For a London
event it presents fabricated jobs and homes as platform content; for a Mauritian one the city
filter matches nothing, which hides it by accident rather than by design.

**Not fixed in this session** — it needs the six real endpoints wired, which is a feature-sized
change, not a UAT repair. Recommend gating the section behind real data before launch.

---

## UAT-112 — the deployed backend is behind the backend repository

**Severity S2 · Priority P1 · OPEN**

`diaspora-api` last deployed 28 Aug 09:52 (image v7). `diaspora-backend` HEAD is `a998d57`,
31 Aug 10:16. Two commits are undeployed:

```
a998d57  feat: a provider's services and opening hours can be managed
c3e3fc6  feat: payouts choose a provider, and only a refusal releases a hold
```

Probed against the deployment:

```
GET /v1/providers/{id}/opening-hours   -> 404      (route absent)
GET /v1/payouts/providers              -> 404      (route absent)
```

The frontend working tree contains `src/lib/provider-registration-api.ts` and a rewritten
`app/(tabs)/post.tsx` that call these routes. **Shipping the current client against the current
deployment would fail the provider listing flow at the opening-hours step.** Either deploy the
backend or hold the client.

---

## UAT-113 — `housing.price.required` names the wrong field

**Severity S3 · Priority P2 · OPEN · backend**

A rent that is present with a period that will not parse returns `HousingErrors.PriceRequired`,
rendered as *"State the rent, or mark the price as on application."* The rent was stated; the
period was the problem. A member reading this will retype a correct price indefinitely.

Suggested: a distinct `housing.price.period-invalid` naming `RentPeriod` and listing its members.

---

## UAT-115 — the UAT record is untracked

**Severity S3 · Priority P3 · OPEN**

`.gitignore:92` is `docs/`. Every document this programme has produced under `docs/uat/` and
`docs/release-readiness/` is untracked and will not survive a fresh clone. The repository's tracked
convention is root-level `*.md`.

---

## UAT-118 — release packaging is flaky

**Severity S3 · Priority P3 · OPEN · build**

`./gradlew assembleRelease` failed once in `:app:packageRelease`
(`PackageAndroidArtifact$IncrementalSplitterRunnable`) and succeeded on a bare retry with no code
change. It deleted the previous APK before failing, so a CI job would publish nothing and report a
red build for a non-deterministic reason. Worth pinning before release automation depends on it.

---

## UAT-120 — the Discover Jobs tab crashes the app

**Severity S0 · Priority P0 · FIXED, verified on device · Component: `components/JobCard.tsx`**

### Reproduction — 100 %, from a cold process

Sign in, open **Discover**, tap **Jobs**.

### Actual

The process dies to the launcher.

```
E/ReactNativeJS: { [TypeError: Cannot read property 'distanceKm' of undefined]
  componentStack: '    at JobCard (address at index.android.bundle:1:2030402)…',
  isComponentError: true }
E/AndroidRuntime: com.facebook.react.common.JavascriptException:
  TypeError: Cannot read property 'distanceKm' of undefined
```

### Root cause

`JobCard` destructured `location` off the row and read `location.distanceKm`. **`GET /jobs` sends
no `location` object.** The row is flat:

```json
{ "jobId": "…", "title": "…", "employerName": "…", "categoryKey": "healthcare",
  "jobType": "FullTime", "countryCode": "MU", "locationLabel": "Curepipe",
  "salary": { "isDisclosed": false, "minimum": null, "currencyCode": null, "period": null } }
```

`employer`, `benefitsFlags` and the salary's `amount` / `currency` / `frequency` are equally
absent, so the same card also rendered a blank employer and `undefinedundefined/mo`.

### Blast radius

`JobCard` is rendered by **seven** screens: `(tabs)/discover.tsx`, `community-life/event/[id].tsx`,
`employer/[id].tsx`, `housing/[id].tsx`, `job/[id].tsx`, `marketplace/[id].tsx` and
`community-directory/CommunityContentSection.tsx`. One of them is a **primary tab**.

It had never fired because the jobs table was empty. It fired within seconds of the first posting
existing — which is also how the housing crash was found, and it is the pattern worth taking from
this session.

### The same defect, two more places

`HousingCard` had the identical line. `MarketplaceCard` did not crash but read `location.areaName`
(the wire sends `neighbourhood`) and `location.distanceKm` (the wire puts it at the **top level**),
so its place was always blank and its distance never appeared.

### Fix

`src/lib/listing-place.ts` — one reader for all three shapes that **never throws and never
invents**: `placeLabelOf`, `distanceKmOf`, `formatDistance`, `placeOf`. All three cards use it.
Guarded by `src/lib/__tests__/listing-place.test.ts` (28 cases) whose fixtures are **verbatim rows
captured from the deployment**, including ten malformed shapes asserted not to throw.

### Retest

Discover → Jobs, cold process, release APK: renders both seeded postings with
📍 **Curepipe** / **Port Louis**, employer **Okonkwo Consulting Mauritius**, and
**"Salary not disclosed"**. **0 TypeErrors in logcat.**

---

## UAT-121 — no listing photograph is visible to anyone

**Severity S1 · Priority P0 · OPEN · backend**

Three independent problems that compound:

**1. Owner-only.** Probed with two real members' tokens:

| Actor | `POST /v1/media/{id}/signed-url` |
|---|---|
| the uploader | **200** |
| any other member | **404 `media.asset.not-found`** |

**2. The signed URL is not self-authenticating.**

```
GET https://diaspora-api.fly.dev/api/v1/media/{id}/content?v=original&exp=…&sig=…
    without Authorization  ->  403 media.asset.access-denied
    with    Authorization  ->  200 image/png, 60256 bytes
```

React Native's `<Image source={{ uri }}>` sends no `Authorization` header, so **even the owner
cannot see their own photograph on the device**.

**3. The URL is relative and its prefix differs.** It returns `/api/v1/media/…` while the client's
base is `https://diaspora-api.fly.dev/v1`; a naive join yields `/v1/api/v1/…`.

### Consequence

Every marketplace and housing listing shows its "no photo" panel — for listings that **could not
have been published without a photograph**, because `publish` refuses without one. Observed on
device: *"NO PHOTOS OF THIS PROPERTY"* on a listing whose photograph is in `media_assets`.

### The fix

All three faults were server-side, and each had a distinct root cause.

**1. Owner-only — a declared extension point that was never wired.** Media publishes
`IMediaAccessPolicy` so a vertical can answer "may this member see the thing this file is attached
to?". Its `MediaAccessDecision` documents three outcomes — `Allow`, `Deny`, `Abstain` — and
`MediaAccessGuard` only ever read `IsDenial`. **`Allow` was dead code**: identical in effect to
`Abstain`, so no vertical could make anything readable, and the interface's own summary
("*a policy can only narrow*") contradicted `Allow`'s ("*the vertical grants access on its own
authority*"). The guard now honours a grant — for reads only, and only after the state floor has
passed. `MarketplaceListingMediaPolicy` and `HousingListingMediaPolicy` implement it by delegating
to the same `CanSeeAsync` the detail screens use, so a photograph is visible exactly when its
listing is. Both **grant or abstain and never deny**, so the change can only widen: nobody loses
access they had before.

**2. The signed URL was not self-authenticating.** `GetMediaContentQueryHandler` verified the
signature and then called `CanReadContentAsync` anyway — which re-derives the caller from the
request. An `<Image>` load carries no `Authorization` header, so the caller was nobody and the
asset was private: **403 on every signed URL, including one the owner had just minted for their
own photograph**. Redemption now checks what a signature genuinely cannot vouch for — quarantine,
deletion, and the owning vertical's withdrawal — and takes the identity from the token.

A fourth fault surfaced while fixing the third: `MediaUrlFactory` bound every embedded URL's token
to the *current caller*, which an image loader can never present. That binding is now kept only
for verification documents, which are fetched by code that does hold a token.

**3. The relative URL.** `Media:Storage:PublicBaseUrl` was never set on the deployment, and the
factory silently emitted a bare path. It now falls back to the request's own origin — so the trap
cannot be re-armed by forgetting a setting — and `fly.toml` sets the value explicitly for the
background worker, which has no request to read.

Returning 404 rather than 403 for a genuinely private asset is unchanged; it is the right
behaviour and was kept.

### What proves it

`MediaAccessGuard` **had no tests at all** — 188 media tests passed throughout the outage. There
are now 12, half of them asserting what a grant *cannot* reach: not past quarantine, not past
deletion, not past an unscanned file, not into management.

The integration test that mattered most already existed and stopped one assertion short:
`A_signed_link_opens_a_private_asset_and_reports_its_expiry` checked that the URL *contained*
`sig=` and never fetched it. It now fetches it with a client carrying no token and asserts the
PNG comes back byte-for-byte — which is the failure the device saw.

| Suite | Result |
|---|---|
| Backend unit | 4,593 passed (+34) |
| Architecture | 694 passed (+1) |
| Integration — Media | 32 passed |
| API host | 3 passed |

### What is still needed

**Not re-verified on device.** The backend is not deployed and the APK has not been rebuilt. This
programme has already learned that green tests are not the oracle — UAT-102, UAT-103 and UAT-104
all passed CI while killing the app. Deploy, rebuild, and confirm a photograph renders for a
member who did not upload it before treating this as closed.

---

## UAT-122 — every job posting says "Expired"

**Severity S2 · Priority P1 · FIXED, verified on device · Component: `components/JobCard.tsx`**

Two postings published minutes earlier both carried an **Expired** badge.

```js
const expiry = new Date(expiresAt).getTime();   // expiresAt is null
if (diff <= 0) return 'Expired';
```

`GET /jobs` sends `closingAt: null` for a posting with no deadline — which most have.
`new Date(null).getTime()` is **0**, the Unix epoch, so `diff` was about −1.8 × 10¹² and every open
posting was labelled expired. An absent closing date means the posting is open, not lapsed.

**Fixed:** no badge at all when there is no closing date, and a non-finite parse is treated the
same way.

---

## UAT-123 — stray separators where a field used to be filled

**Severity S3 · Priority P2 · FIXED**

Three places built a label by concatenating fields that are now legitimately empty:

| Screen | Rendered |
|---|---|
| Home location banner | *"Using manual fallback: **, .**"* |
| Discover header | *"Explore Mauritius **·** ▾"* |
| Housing detail | *"📍 Address: **·** Quatre Bornes"* |

The first two are consequences of UAT-104's fix — a country-precision location has no city or
neighbourhood — and the third of `addressLine` being null whenever a landlord chooses
`NeighborhoodOnly` disclosure, which is the default.

**Fixed:** all label construction goes through `locationLabel()` or `placeLabelOf()`, which join
only the parts that exist. The banner's wording was also corrected — "manual fallback" described
something nobody had entered manually.

---

# Session 2b — the full-route screen sweep (31 August 2026)

The first part of session 2 went depth-first on two crashes. This part went **breadth-first**: every
one of the application's **254 route files** was enumerated, and **203 screens** were opened on the
release APK — 179 static routes by deep link, plus 24 dynamic routes driven with **real entity
identifiers** created earlier in the session.

Method: deep-link each route, wait, screenshot, then read `dumpsys activity` to confirm the process
survived and `logcat` for JS errors. One CSV row per screen.

| | |
|---|---|
| Route files in the tree | **254** |
| Screens opened | **203** (80 %) |
| Process deaths | **1** (marketplace detail — fixed) |
| Screens with JS errors | **1** (the same one) |
| Screens rendered clean | **202** |

---

## UAT-124 — every member's wallet is denominated in GBP · S2 · FIXED (backend)

The Wallet opens on **`£0.00` / `GBP`** for a member resident in Mauritius whose own marketplace
listings are priced `Rs 11500 MUR`. Confirmed on two screens (Wallet, Creator Revenue) and in the
database:

```
SELECT "OwnerId","WalletType","Currency" FROM financial.financial_wallets …
 2b5f8fb0…  Primary      GBP
 2b5f8fb0…  Promotional  GBP
 0dc73f0c…  Primary      GBP
 0dc73f0c…  Promotional  GBP
```

**Not a client default.** The client reads `wallet?.currency`; the server sent GBP. And MUR is
supported — the table already holds 4 MUR wallets alongside KES, GHS, CAD, AED, NGN, EUR.

### Root cause

`UserRegisteredConsumer` passes the member's country **and** a null currency:

```csharp
await _identities.GetOrCreateAsync(
    integrationEvent.UserId,
    FinancialAccountType.Personal,
    currency: null,                                   // ← nothing chooses one
    displayName: integrationEvent.FullName,
    countryCode: integrationEvent.CountryOfResidence, // ← passed, then ignored
    …);
```

and `FinancialIdentityService.GetOrCreateAsync` resolves it without consulting the country:

```csharp
var normalized = Money.NormalizeCurrency(currency) ?? DefaultCurrency;   // → "GBP"
var account = FinancialAccount.Open(…, normalized, …, countryCode);      // stored, unused
await EnsureWalletsAsync(account, normalized, …);                        // wallets in GBP
```

`DefaultCurrency` falls back to `"GBP"`. The country of residence is one line above the decision
that ignores it.

**Consequence.** Every member of a platform that exists to serve Nigeria, Ghana, Kenya, South
Africa and Mauritius is given a Pound Sterling wallet. Deposits and withdrawals are disabled today,
which is the only reason this is S2 rather than S1 — `money.ts:380` states the platform **never
converts**, so the day money moves this becomes a settlement defect.

---

## UAT-125 — the seller, landlord and employer dashboards can never be viewed · S2 · OPEN (backend)

`/analytics/seller` renders *"Not available to you"* for a member who **has a seller profile and
three published listings**. Same for landlord and employer.

Probed directly against the deployment, as the owner of each subject:

| `GET /v1/analytics/access?subjectType=…` | `canView` |
|---|---|
| `creator` | **true** |
| `seller` | **false** |
| `landlord` | **false** |
| `employer` | **false** |

Re-probed with the **correct profile id** rather than the user id — still `false`.

### Root cause

`GetAnalyticsAccessQueryHandler`:

```csharp
var canView = subjectType == "creator";

if (!canView && Guid.TryParse(query.SubjectId, out var contentId))
{
    var contentType = AnalyticsContentTypes.FromRouteSegment(subjectType);
    if (contentType != AnalyticsContentType.Unknown) { … canView = owner.IsSuccess; }
}
```

`FromRouteSegment` maps **content** types only — `post, guide, listing, job, housing, marketplace,
event, organization`. `seller`, `landlord` and `employer` are **role** subjects, so it returns
`Unknown`, the block is skipped, and `canView` stays `false`.

**There is no input for which these three screens return true.** They are linked from Profile →
Analytics and are dead for every user on the platform. This is not a permission the member is
missing — the branch that would grant it does not handle role subjects at all.

> Worth noting the counterpart: the platform-wide reports (`/analytics/platform`, `/growth`,
> `/retention`, …) correctly refuse a normal member with the same panel. The refusal mechanism is
> right; three subjects are on the wrong side of it.

---

## UAT-126 — marketplace detail crashed on a real listing · S1 · FIXED, verified

Found by the sweep, on the **only** route of 203 that killed the process.

```
TypeError: Cannot read property 'split' of undefined
  at ListingDetailScreen
```

from `listing.seller.name.split(' ')`. The wire sends `seller.displayName`:

```json
"seller": { "sellerId": "…", "displayName": "David Mensah Electronics",
            "slug": "…", "sellerType": "Individual", "isVerified": false, "rating": null }
```

**Exactly the housing screen's `landlord`/`host` mismatch, on the sibling screen** — and, like it,
invisible until a real listing existed to open. `price` is nested the same way (`{isDisclosed,
amount, currency, isNegotiable, …}`) while the render read `listing.price` as a number, and the id
is `listingId` not `id`.

**Fixed** by normalising at the fetch site, as housing does; the initials call and the price render
are guarded independently, because a crash on an avatar's initials is never worth it. Guarded by 13
new cases in `listing-place.test.ts` carrying the captured response.

**Retested:** marketplace, housing and job detail all render from a cold process — **0 TypeErrors**.
The listing shows **Rs 11500**, `NEGOTIABLE`, and the honest no-escrow disclosure.

---

## UAT-127 — a member who forgets their password can never delete their account · S2 · OPEN

`settings/delete-account` requires the password, and its reasoning is sound — *"only a password says
the person pressing the button owns the account"*, which is right for a stolen unlocked phone.

But:

| | |
|---|---|
| Sign-in | **OTP only.** `loginWithPassword` is called by no screen |
| Password set | once, at registration |
| Change password | **no screen exists** |
| Forgot password | **no screen, no client function, no "Forgot" text anywhere in `src/app`** |
| Backend support | `POST /auth/forgot-password` **and** `POST /auth/reset-password` both exist |

So the password is set once, never used again, never changeable, never recoverable — and is the
**only** key to account deletion. Forgetting it is the *expected* outcome, not the edge case, and
the result is that the member cannot exercise erasure.

The endpoints to fix this are already deployed and answering. The client simply does not call them.

---

## UAT-128 — a guided tour follows the member across the whole app · S2 · OPEN

Start the Jobs tour, then navigate anywhere. The tour card stays on screen, still reading
**"STEP 1 OF 3 — Filter Openings — Filter listings by full-time, part-time, visa sponsorship…"**,
spotlighting coordinates that belong to the screen it was started on.

Observed over the **Wallet** (spotlighting the balance card) and over **Withdraw**, where it
covered the disclosure *"Withdrawals are not available yet"* — the sentence the screen exists to
say.

### Root cause

`components/explore/TourProvider.tsx` renders the overlay on `activeTour` alone:

```js
if (!activeTour) return null;
```

`TourNavigator` pushes each step's route, but nothing compares the **current** route to the step's.
A member who navigates themselves — back button, tab, deep link — keeps the overlay.

The member's only escape is to find **Skip Tour**. Not fixed here because whether the tour should
pause or end on divergence is a product decision, but hiding the overlay when the route does not
match the step is the obvious floor.

---

## UAT-129 — a wall-clock assertion in the test suite · S3 · OPEN (CI)

`multi-community-performance.test.ts` asserts `duration < 250 ms`. Under load it measured **253 ms**
and **273 ms** and failed the whole suite; run in isolation on the same machine it passes in 18 s.

The suite took **297 s** in the failing run against ~50 s normally — an emulator and a Gradle build
were running. A CI agent will be at least as loaded. A wall-clock budget in a unit suite is a
guaranteed intermittent red build; measure work done, not elapsed milliseconds.

---


---

## UAT-130 — the one-time-code sign-in reports the wrong status

**Severity S3 · Priority P2 · OPEN · backend**

Found on 31 Aug 2026 while establishing a regression baseline, and **confirmed pre-existing**: the
two failures reproduce identically on a clean worktree of `HEAD`, so they predate every change in
this programme.

| Request | Documented | Actual |
|---|---|---|
| `POST /auth/otp/sign-in` with a wrong code | 401 | **400** |
| `POST /auth/otp/sign-in` replaying a registration code | 401 | **404** |

The route declares `ProducesResponseType(Status401Unauthorized)`. The first is
`OtpErrors.IncorrectCode`, which is an `Error.Validation` and therefore maps to 400. The second
reaches a purpose mismatch — no `SignIn` challenge exists — and surfaces as a not-found.

**Why it is only S3.** The refusal is correct; only its shape is wrong. No client reads it: the
app's sole sign-in is now email and password, and `otp/sign-in` is deployed but uncalled. It is
recorded because a status that contradicts a route's own contract is the kind of thing a future
client will trust and be wrong about — and because `A_wrong_code_is_refused_indistinguishably`
asserts an *indistinguishability* property that a 400-versus-404 split quietly breaks.

**Not fixed here** because it is unrelated to the media work that surfaced it, and changing an
authentication route's status codes deserves its own decision.

---

## UAT-131 — a fresh clone of the backend does not compile

**Severity S2 · Priority P1 · OPEN · build**

```
CSC : error CS2001: Source file 'src/Diaspora.Analyzers/AnalyzerReleases.Shipped.md'
      could not be found.
CSC : error CS2001: Source file 'src/Diaspora.Analyzers/AnalyzerReleases.Unshipped.md'
      could not be found.
```

`git worktree add` at `HEAD` produced a tree that will not build. Both files are required by
`Diaspora.Analyzers.csproj` and both are **gitignored** — a `.md` rule that was written with
documentation in mind and caught two build inputs that happen to share the extension.

They exist in the working tree, so nothing local ever fails. **The only place this appears is a
clean checkout**, which is to say CI, a new machine, and a release build.

This is the same shape as **UAT-115** (`docs/` gitignored, so the entire UAT record is untracked)
and it compounds the same underlying risk: the tree that was tested is not a tree anybody else can
reproduce. It is worth resolving in the same pass.

**Fix:** un-ignore both paths, e.g. `!src/**/AnalyzerReleases.*.md`, and prove it by building from
a fresh `git worktree add`.


---

## UAT-132 — housing photographs were requested and then never fetched

**Severity S1 · Priority P0 · FIXED, verified on device · Component: `app/housing/[id].tsx`**

Found on 1 Sep 2026, immediately after UAT-121 was fixed and deployed — and it is the reason
UAT-121 looked only half-fixed on the device.

With the backend serving photographs correctly, a marketplace listing rendered its picture and a
housing listing still showed **"NO PHOTOS OF THIS PROPERTY"**. Both screens resolve media the same
way, through `createSignedUrl`, and both were given the same identifiers by the same API.

### What the server saw

| Screen | mint | fetch |
|---|---|---|
| Marketplace | `POST /media/{id}/signed-url` → **200** | `GET /media/{id}/content` → **200** |
| Housing | `POST /media/{id}/signed-url` → **200** | — **nothing** |

The housing screen minted a signed URL for every photograph and then **never requested one of
them**. That is the whole defect, and it is invisible from the outside: a photograph that was never
asked for and a photograph that was asked for and not shown produce the identical empty band.

### Cause

```jsx
<View style={{ width: Platform.OS === 'web' ? 450 : undefined }} className="w-screen h-60">
  <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} />
</View>
```

`w-screen` is `100vw` — a web unit. On Android the slide measured **zero** wide, so the image was
`100%` of nothing, and **`expo-image` does not issue a request for a zero-sized view**. The
marketplace carousel has always sized its image with an explicit pixel width, which is the only
reason it worked.

### Fix

The slide takes a real number from `useWindowDimensions()`. `src/lib/__tests__/gallery-sizing.test.ts`
pins the property: a gallery slide is sized by a number, never by a viewport utility class, and
marketplace keeps the explicit width that made it the control.

### Verified

Rebuilt the APK, reinstalled, cold-loaded both seeded properties:

* **Quatre Bornes** — the listing that read "NO PHOTOS" now fills the band with its photograph.
* **Rose Hill** — renders a **different** photograph, so this is real per-listing content rather
  than one shared placeholder.
* The server log shows `POST …/signed-url 200` **followed by** `GET …/content 200` for both
  assets — the fetch that was entirely absent before.

### Why nothing caught it

`tsc` passes, `housing-media-shape.test.ts` passes against the real wire shape, the media module is
correct and the backend is correct. Every layer was right and the photograph still did not appear.
It was found by reading the API's own request log while a device rendered the page — the one place
the difference between "not requested" and "not displayed" is visible.

## What the sweep confirmed is working

Worth recording, because it is most of the application:

| | |
|---|---|
| **202 of 203 screens** rendered without a crash or a JS error | ✅ |
| Platform-wide analytics correctly refuse a normal member, with an honest panel | ✅ |
| **`settings/delete-account`** — real counts from the member's own record (11 sessions, 4 devices, 11 one-time codes), names what is **kept** and why, and lists all **21 modules** that cannot yet auto-erase | ✅ **exemplary** |
| Wallet discloses disabled capability rather than faking it — *"Withdrawals are not available yet"*, Add money / Withdraw / Rewards visibly disabled | ✅ |
| Capability gaps declared and surfaced — *"Diaspora cannot do this yet. We will let you know as soon as it arrives."* | ✅ |
| Listing prices use the **listing's own** currency (Rs / MUR), so UAT-124 is a wallet defect, not a pricing one | ✅ |
| Escrow disclosure on every payment CTA — *"Diaspora does not hold this money"* | ✅ |

**383 capability gaps** are declared across 11 registries in `src/config/*-gaps.ts`. That the app
tells the truth about all of them is a real strength. That there are 383 of them is a fact a launch
decision should hold explicitly.

---
---

# Session 3 — sign-in moved to email and password (31 August 2026)

A product decision, not a defect fix: **signing in cost an SMS every time**, and a
password costs nothing to deliver. SMS is now spent only on phone verification — the one
thing a message actually proves, and a once-per-account event rather than a
once-per-session one.

It also removed the single point of failure behind **UAT-101**. The launch deployment
points at the Africa's Talking sandbox, which accepts every code and delivers none, so
sign-in was dead for every real user. Sign-in no longer depends on a message arriving.

> **UAT-101 is downgraded, not closed.** SMS still has to work before launch, because
> phone verification gates every write on the platform: a member who cannot verify their
> phone reaches `LimitedAccess` and no further. What changed is that they can now get *in*.
> **S0 → S1.**

## What changed

### Backend

| | |
|---|---|
| `RegisterRequest` | gains a **required** `Email`, unique across the platform |
| `LoginRequest` | `PhoneNumber` → `Email` |
| `ForgotPasswordRequest` / `ResetPasswordRequest` | `PhoneNumber` → `Email` |
| `LoginCommandHandler`, `PasswordAuthenticationProvider` | resolve by `GetByEmailAsync` |
| `IUserRepository` | gains `GetByEmailWithPasswordHistoryAsync`, so reset still checks history |
| `EmailAddress` | gains `TryCreate`, because four screens now parse a member-typed address |
| `UserConfiguration` | the email index becomes **unique**, filtered on `IS NOT NULL` |
| Migration | `20260831155625_EmailAsSignInCredential` |

The `ForgotPassword` acknowledgement names the **SMS**, because the deployment has no
configured email sender — the only `IEmailSender` registration is `UnconfiguredEmailSender`,
which fails every send. The member is identified by the credential they use; the code goes
where it can actually arrive.

### Client

| | |
|---|---|
| `(auth)/login.tsx` | rewritten: email + password, reveal toggle, **Forgot password?** |
| `(auth)/forgot-password.tsx` | **new** |
| `(auth)/reset-password.tsx` | **new** |
| `profile/change-password.tsx` | **new**, linked from Account Security |
| `(auth)/enable-location.tsx` | now **sends** the email registration always collected and then dropped |
| `lib/auth-api.ts` | `forgotPassword`, `resetPassword`, `changePassword` |
| `lib/auth-destination.ts` | **new** — the post-sign-in routing rule, shared with the OTP screen |
| `lib/password-policy.ts` | **new** — one `MIN_PASSWORD_LENGTH` for all four screens |

## Two things found while building it

**The email was collected and thrown away.** `register.tsx` has always asked for an
address and required it to submit, and `RegistrationDraft` has always carried it — and
the `register()` call never sent it. Every account on the platform was created with a
null email. Harmless while sign-in was a code; it would have made every new account
unsignable-into the moment the address became the credential.

**The change-password screen described an outcome the server does not produce.** It first
read *"Your other devices are not affected."* The server answered *"Your password has
been changed. **14 other session(s) were signed out.**"* Corrected before it shipped, and
pinned by a test — this is the exact defect class the whole audit was for, reintroduced by
the person auditing it.

## Verified end to end against the deployment

| Case | Result |
|---|---|
| Register with an email | **201** |
| Sign in by email + password | **200**, token issued, **zero SMS** |
| Duplicate email | **409** |
| Wrong password | **401** |
| Unknown email | **401** — indistinguishable from the above |
| Registration with no email | **400** |
| `forgot-password` | **200**, and the message names the SMS |
| `reset-password` with the code | **200**; old password **401**, new password **200** |
| `change-password` wrong current | **403** |
| `change-password` correct | **200**, and it reports the sessions it ended |
| Password containing the member's name | **400**, naming the rule |

**On device:** signed in as Aisha with email and password, landed on Home, 📍 Mauritius,
Mauritian housing showing, **0 TypeErrors**. Change-password and recovery both render and
are reachable from their real entry points.

## What did not change

`verify-phone`, `resend-otp` and `otp/sign-in` are untouched. Phone verification is still
SMS and still gates contribution. `POST /auth/otp/sign-in` remains deployed but **no
screen calls it** — the client's only sign-in is the password.
