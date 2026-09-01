# Diaspora — Android Pre-Launch UAT · Backend / Frontend Truth Check

**Phase 34.** For each capability: does what the screen renders correspond to what the platform
actually holds? Every row below was checked by driving the real deployment
(`https://diaspora-api.fly.dev/v1`) and comparing the response against what the screen reads.

This is the phase that produced most of this session's findings, and the reason is worth stating
first: **the client's own types agree with the client's own fixtures, and disagree with the
server.** `tsc` cannot see that. Neither can a unit test that builds its own fixture. It took
seeding real content and opening the screens.

---

## 1. The pattern

| Module | Client reads | Server sends | Symptom |
|---|---|---|---|
| **Housing detail** | `listing.gallery` | *(no such field)* | — |
| | `listing.coverImage` as a **string** | `{ mediaId, role, order, caption }` | **crash** — `.trim()` on an object |
| | `listing.rent` | `price.amount` | rendered **`undefined`** |
| | `listing.deposit` | `price.depositAmount` | rendered **`undefined`** |
| | `listing.currency` | `price.currencyCode` | wrong/absent symbol |
| | `listing.bedrooms` | `capacity.bedrooms` | rendered **"Bedroom"** with no number |
| | `listing.bathrooms` | `capacity.bathrooms` | rendered **"Bathroom"** with no number |
| | `listing.availabilityDate` | `availability.availableFrom` | blank |
| | `listing.furnished` | `furnishedStatus` | blank |
| | `listing.leaseDuration` | `leaseType` | blank |
| | `location.latitude` | `address.latitude` | distance never computed |
| **Marketplace detail** | `listing.gallery` / `listing.coverImage` | `media[]` | **no photo ever shown** |
| **Jobs list** | `job.location.distanceKm` | *(no `location` object)* | **crash** on the Jobs tab |
| | `job.location.areaName` | `locationLabel` | blank place |
| | `job.employer.name` | `employerName` | blank employer |
| | `salary.amount` / `.currency` / `.frequency` | `salary.{minimum,maximum,currencyCode,period,isDisclosed}` | `undefinedundefined/mo` |
| **Marketplace list** | `location.areaName` | `location.neighbourhood` *(British spelling)* | blank place |
| | `location.distanceKm` | `distanceKm` *(top level)* | distance never shown |

Two of these were **process-killing crashes**. The rest were silent: a screen that renders is not a
screen that is correct.

---

## 2. Truth check by capability

Legend: ✅ UI matches persistence · ⚠️ renders but misrepresents · ❌ broken · ⬜ not exercised

| Capability | UI → HTTP | HTTP → persistence | persistence → UI refresh | Verdict |
|---|---|---|---|---|
| Registration | ✅ | ✅ row created, `PhoneVerificationPending` | ✅ | ✅ |
| Phone verification | ✅ | ✅ `phone_verified_at` set, tokens issued | ✅ | ✅ |
| Sign-in (OTP) | ✅ | ✅ session + refresh token rows | ✅ | ✅ |
| **SMS delivery** | ✅ request sent | ❌ **sandbox only — never delivered** | n/a | ❌ **UAT-101** |
| Seller profile → listing → publish | ✅ | ✅ 3 listings `Active` in `marketplace_listings` | ✅ visible in discovery | ✅ |
| Marketplace photographs | ✅ uploaded | ✅ `media_assets` row created | ❌ never rendered | ❌ **UAT-106** |
| Landlord profile | ✅ | ✅ | ✅ | ✅ |
| Housing create **with a rent** | ❌ | ❌ **400, nothing persisted** | n/a | ❌ **UAT-103** |
| Housing create **without a rent** | ✅ | ✅ | ✅ | ✅ |
| Housing detail | ✅ | ✅ | ❌ **crashed**, then rendered `undefined` | ❌ **UAT-102 / UAT-119** |
| Employer profile → job → publish | ✅ | ✅ 2 jobs `Open` | ✅ | ✅ |
| Jobs browse | ✅ | ✅ | ❌ **crashed** | ❌ **UAT-120** |
| Discovery scoping | ⚠️ sent London coordinates | ✅ server answered honestly | ⚠️ *"No providers match in London"* | ⚠️ **UAT-104** |
| Location detection | ✅ | n/a | ❌ silent failure | ❌ **UAT-105** |
| Wallet / financial | ⬜ | ⬜ | ⬜ | ⬜ |
| Chat / SignalR | ⬜ | ⬜ | ⬜ | ⬜ |
| Push notifications | n/a | n/a | n/a | ❌ disabled by config (session 1, UAT-007) |

---

## 3. The media visibility finding — UAT-121

This one is architectural rather than a mapping slip, and it is the most consequential of the
truth-check results.

Listing photographs are **private assets**. Reading one requires minting a signed URL, and the
probes below were run against the deployment with two real members' tokens:

| Actor | `POST /v1/media/{id}/signed-url` | Meaning |
|---|---|---|
| **B** — uploaded the photograph, owns the listing | **200**, URL returned | fine |
| **A** — any other signed-in member | **404 `media.asset.not-found`** | cannot see it |

So **a listing's photographs are visible only to the person who uploaded them.** Every prospective
tenant and every buyer sees the "no photo" panel — for a listing that could not have been published
without one.

It gets worse. The minted URL is not self-authenticating:

```
GET https://diaspora-api.fly.dev/api/v1/media/{id}/content?v=original&exp=…&sig=…
    without Authorization  ->  403 media.asset.access-denied
    with    Authorization  ->  200 image/png, 60256 bytes
```

React Native's `<Image source={{ uri }}>` sends no `Authorization` header. **So even the owner
cannot see their own photograph on the device** — the URL that the API calls "signed" still
requires a bearer token that the image loader will never attach.

And a third trap: the URL comes back **relative** (`/api/v1/media/...`) while the client's base is
`https://diaspora-api.fly.dev/v1`. A client that joins them naively produces
`/v1/api/v1/media/...`. The origin must be used, not the base URL.

**All three have to be resolved together before any listing photograph can be seen by anyone.**
This cannot be fixed in the client alone: media attached to a *published* listing has to be
readable by whoever can read the listing, and the content URL has to accept its own signature.

> **Resolved in the backend, 31 Aug 2026.** All three, plus a fourth found in the process (every
> embedded media URL was audience-bound to the member who requested the response, which an image
> loader can never present). The first fault's root cause was a declared-but-unwired extension
> point — `MediaAccessDecision.Allow` was dead code, so no vertical could tell Media that a
> published listing's gallery is public. Full write-up in `BUG-REGISTER.md` under UAT-121.
> **Not re-verified on device**: the backend is not deployed and the APK has not been rebuilt.

---

## 4. What was verified as genuinely honest

It is worth recording what held, because it is the discipline the rest of the product needs:

* **The two-step create contract is real and enforced.** `POST /marketplace/listings` returns a
  draft; publication is a separate call and it **refuses** without a photograph, naming what is
  missing: *"Before this listing can be published it still needs at least one photograph."*
* **Multi-step preconditions are enforced.** A listing write without a seller profile is refused;
  a housing write without a landlord profile is refused with `housing.not-landlord`.
* **Empty states are honest** where they exist. *"Nothing recommended yet"*, *"No conversations
  yet"*, *"No providers match in …"* are all real reads of an empty result, not placeholders.
* **The access ladder is real.** A `LimitedAccess` member's token carries an explicit
  `grantedFeatures` / `blockedFeatures` split, and the gated screens honour it.
* **Duplicate submission is caught.** Re-posting an identical listing returns
  `409 marketplace.listing.duplicate` rather than creating a second one.
* **Rate limiting is live.** Registration and sign-in are throttled on the deployment.

---

## 5. The generalisable lesson

Every defect in section 1 has the same shape: **a screen and a contract that were each internally
consistent and had never met.** The existing `backend-request-binding-drift.test.ts` checks
*requests* against the route inventory and the contract's `required` members. Nothing checked
**responses** against what screens read — and `RentPeriod` shows that even the request check has a
blind spot, because a field the contract marks optional and the handler treats as mandatory passes
it.

**Recommendation:** extend the drift harness in two directions.

1. **Response-shape assertions.** For every detail screen, capture one real response from the
   deployment and assert that every field the screen dereferences exists in it. This session's
   three new tests do exactly that for housing, marketplace and jobs; the pattern generalises.
2. **Optional-but-required.** For each handler that fails on a field the contract marks optional,
   pin it. `housing-create-contract.test.ts` now does this for `rentPeriod`.

Neither is expensive. Both would have caught every crash in this document before it reached a
device.
