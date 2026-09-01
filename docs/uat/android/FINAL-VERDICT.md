```
============================================================
DIASPORA
ANDROID PRE-LAUNCH UAT
FINAL RELEASE CANDIDATE VERDICT
============================================================
```

**APK:** `app-release.apk` · 131,879,194 bytes · universal
**Build:** version `1.0.1`, versionCode `2`, minSdk 24, targetSdk 36, Hermes, New Architecture
**Commit:** frontend `5bc2690` **plus an uncommitted working tree** · backend deployed image v7
**Backend:** `https://diaspora-api.fly.dev/v1` — `ASPNETCORE_ENVIRONMENT=Production`, Neon PostgreSQL
**Tested:** 31 August 2026 · session 2 · ~5 hours · continues session 1 of 27 August

---

| | |
|---|---|
| **Android Testing** | **INCOMPLETE** |
| **iOS Testing** | **NOT TESTED** |
| **Screens** | **203 / 254** (80 %) |
| **CTAs** | **~60 / 675** (9 %) — the sweep opened screens, it did not press their controls |
| **Navigation paths** | ~40 walked; no full map produced |
| **Capabilities** | **20 / 22** reached; **13** exercised to any depth |
| **Brief phases** | **31 / 41** attempted |

| Gate | Result |
|---|---|
| **Security** | **PASS** — authorization model holds; three configuration findings (`SECURITY-FINDINGS.md`) |
| **Stability** | **FAIL → PASS after fixes** — two process-killing crashes found, both fixed and re-verified; 0 crashes in the final sweep |
| **Push Notifications** | **FAIL** — disabled by configuration in every production build (session 1, UAT-007) |
| **SignalR** | **NOT TESTED** this session |
| **Authentication** | **PASS in code · FAIL in the environment** — the flow works end to end; the deployment cannot deliver a code |
| **Authorization** | **PASS** — token-scoped, IDOR-resistant, access ladder holds |
| **Financial Integrity** | **PARTIAL** — disclosure is honest where checked; no financial screen driven on device |
| **Mock Data** | **FOUND** — 16 user-facing fabrications; 14 removed, 2 open |
| **Production Configuration** | **FOUND** — SMS sandbox (S0); backend two commits behind the client |
| **Regression** | **PASS** — `tsc` exit 0; Jest **157 suites / 4,544 tests**, exit 0 |

| Severity | Found | Fixed & verified | Open |
|---|---|---|---|
| **S0** | **2** | 1 | **1** |
| **S1** | **5** | 5 | **0** |
| **S2** | **13** | 8 | **5** |
| **S3** | **8** | 3 | **5** |
| **S4** | **1** | 1 | 0 |
| **Total** | **29** | **18** | **11** |

| | |
|---|---|
| **Open Release Blockers** | **1** (UAT-101 S0). UAT-121 is fixed in code and proven by tests, but **not re-verified on device**. |
| **Open Major Defects** | **6** (UAT-111, UAT-112, UAT-124, UAT-125, UAT-127, UAT-128) |
| **Open Minor Defects** | **5** |

---

```
============================================================

FINAL ANDROID VERDICT:

                    NO-GO

============================================================

IOS:

    NOT TESTED
    NOT CERTIFIED

============================================================
```

---

## Release recommendation

**Do not submit this build.** Two open blockers, either sufficient on its own, and a third
consideration that is not a defect at all but should stop a submission anyway.

### 1. UAT-101 — nobody can sign in. **S0.**

The launch deployment has `Sms__AfricasTalking__UseSandbox = true`. Every one-time code is posted
to the Africa's Talking **sandbox**, which accepts it, returns `statusCode 101 Success`, and never
delivers it to a handset. The backend log says *"A SignIn code was accepted by AfricasTalking"* —
accepted, not delivered.

Sign-in is **OTP-only**. `loginWithPassword` exists and no screen calls it. So SMS is the sole
route into the product, and it is switched to a test harness. A member who installs from the Play
Store enters their number, waits, and never receives anything.

This is a configuration switch, not a code defect. It cannot be closed by testing.

### 2. UAT-121 — no listing photograph is visible to anyone. **S1. Now fixed, not yet
re-verified on device.**

Three compounding problems, all server-side: a signed URL could be minted only by the **uploader**
(404 for every other member); the "signed" URL still required a bearer token that React Native's
`<Image>` will never send; and the URL came back relative with a different prefix from the client's
base. A fourth was found while fixing them — every embedded media URL was minted bound to the
member who requested the response, which an image loader can never present.

The root cause of the first was a **declared extension point that was never wired**:
`MediaAccessDecision.Allow` was dead code, so no vertical could tell Media that a published
listing's gallery is public. The marketplace and housing policies now do, by delegating to the same
`CanSeeAsync` the detail screens use.

Proven by 34 new backend tests, including an integration test that fetches the signed URL with **no
Authorization header** and asserts the bytes come back — the exact request the device makes. The
guard it protects had no tests at all while the outage was live.

**It is not closed.** The backend is not deployed and the APK has not been rebuilt. See below.

### 3. Nothing tested here exists in a commit.

Every fix in this session — and session 1's — lives in an **uncommitted working tree** of ~40 files.
The APK was built from a tree that a fresh clone does not reproduce. Whatever the verdict, that has
to be resolved before anything is submitted, and it is also why **UAT-115** (`docs/` is gitignored,
so this entire UAT record is untracked) matters more than its severity suggests.

---

## What changed for the better, and it is substantial

This session found and fixed **two crashes that killed the app process**, one of them on a primary
navigation tab:

* **UAT-102** — opening any housing listing killed the app. 100 % reproducible from a cold process.
* **UAT-120** — the **Discover → Jobs tab** killed the app. Same class, seven screens exposed.

Both had the same cause: **the client's types agree with the client's fixtures and disagree with
the server.** And both were invisible until this session, for the same reason — the launch database
held **zero housing listings and zero jobs**, so neither screen had ever been rendered against real
data. They fired within seconds of the first record existing.

Alongside them: housing listings that stated a rent **could not be created at all** (UAT-103); the
housing detail screen rendered `MONTHLY RENT undefined` (UAT-119); every job posting was labelled
**"Expired"** (UAT-122); and no marketplace listing displayed its photograph (UAT-106).

And the thing the product owner actually asked about: a member resident in **Mauritius** was told
they were in **Peckham, London**, with every discovery query scoped to a 5 km circle around Rye
Lane and the empty state *"No providers match in London"* (UAT-104). Their saved locations already
contained a Home in Peckham and a Work in Brixton they had never entered. That is fixed: the
discovery context is now seeded from the member's own `countryOfResidence`, and the app opens on
📍 **Mauritius** — verified on device with location permission **declined**, which is the stronger
test.

---

## The screen sweep — 203 of 254 routes

After the depth-first work, every route file in the tree was enumerated and **203 screens were
opened on the release APK** — 179 static routes by deep link, plus 24 dynamic routes driven with
**real entity identifiers** created earlier in the session.

| | |
|---|---|
| Screens opened | **203 / 254 (80 %)** |
| Process deaths | **1** — marketplace detail (**UAT-126**, fixed and verified) |
| Screens with any JS error | **1** — the same one |
| Screens rendered clean | **202** |

That the other 202 held up is a real result, and it is the strongest evidence in this report that
the two earlier crash fixes did not merely move the problem.

The sweep also produced six new findings, of which four are open majors: every member's wallet is
denominated **GBP** (**UAT-124**); the **seller, landlord and employer** analytics dashboards can
never be viewed by anybody (**UAT-125**); there is **no password reset anywhere in the client**
while account deletion requires the password (**UAT-127**); and a guided tour **follows the member
across every screen**, covering content and describing the wrong one (**UAT-128**).

**What the sweep did not do is press anything.** It opened screens and confirmed they rendered.
CTA coverage is still ~9 %, and the two crashes found earlier were both behind controls, not behind
mere navigation. Screen coverage of 80 % and CTA coverage of 9 % should be read together.

---

## The pattern worth carrying out of this session

Session 1's lesson was *"a screen reporting an outcome it did not achieve"*. Session 2's is
narrower and sharper:

> **An empty table is not a passing test.**

Every serious defect here — two crashes, a broken create flow, a rent that rendered `undefined`, a
job that claimed to be expired, a photograph nobody can see — was latent behind an empty database.
8,000 green tests, a clean `tsc`, two prior E2E passes and a previous device validation all missed
them, because none of them had ever put a real record in front of a real screen.

The specific counter-measure is cheap and is now partly in place: **capture one real response per
detail screen from the deployment and assert that every field the screen dereferences exists in
it.** The three new test files do exactly that, with verbatim captured payloads. Extend the pattern
to the remaining screens and this class of defect stops shipping.

---

## Conditions for a GO

**Blocking:**

1. **UAT-101** — point SMS at a live provider and prove a code arrives on a real handset.
2. **UAT-121** — ~~make media attached to a published listing readable by anyone who can read
   the listing, and make the signed URL self-authenticating~~. **Done in code**, with the
   404-not-403 behaviour kept. What remains is confirmation on hardware: deploy the backend,
   rebuild the APK, and open a listing as a member who did not upload its photograph. Three
   defects this session passed CI and still killed the app, so tests are not the oracle here.
3. **Commit the tree** and rebuild the APK from a clean checkout of that commit.
4. **UAT-112** — deploy the backend, or hold the client. The current client calls
   `/providers/{id}/opening-hours`, which the deployment answers **404**.

**Required before certification, not necessarily before a fix:**

5. **UAT-111** — the event page's six fixture-driven sections are live in the release bundle.
6. Re-run the full journey set on **at least one more device profile** and on **real hardware**.
   The entire session ran on one emulator; `minSdk` is 24 and nothing below API 36 was touched.
7. Close **UAT-018** (dark mode) from session 1, which has still not been retested.
8. Run the phases still untouched: chat and SignalR (two `Verified` accounts now exist, which
   unblocks it), wallet and financial, monetization, maps, analytics, automation, and a soak test.

**Not a blocker but state it before launch:** the platform holds **6 accounts, 3 marketplace
listings, 2 housing listings and 2 jobs** — all of which this session created. A launch decision
should be explicit about opening to real users with an empty catalogue, because most of what a new
member sees will be an empty state.

---

## Honest scope statement

This is **not** a completed Android UAT. Roughly 12 % of screens and 9 % of CTAs were exercised,
on one device profile, in portrait, in light mode. The session was spent depth-first on the defects
it found, because two of them killed the app and one of them was the product owner's stated
complaint. That was the right trade, and it means the coverage numbers above are the honest ones —
they are not a rounding error away from complete.

**Every "PASS" in this document is scoped to what was actually driven. Nothing here should be read
as certifying a capability that was not exercised.**
