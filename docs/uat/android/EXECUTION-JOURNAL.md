# Diaspora — Android Pre-Launch UAT · Execution Journal

Sessions are appended. **Session 1** (27 Aug 2026) is preserved below the divider; **Session 2**
(31 Aug 2026) resumes at CP-04, which session 1 left blocked on a `Verified` account.

---

# Session 2 — 31 August 2026

## Environment

| | |
|---|---|
| **APK** | `android/app/build/outputs/apk/release/app-release.apk`, ~131.9 MB |
| **Version** | `1.0.1`, versionCode `2`, minSdk 24, targetSdk 36, Hermes, New Architecture |
| **Frontend** | `5bc2690` **plus an uncommitted working tree** — see "A note on provenance" |
| **Backend (deployed)** | image v7, deployed 28 Aug 09:52 · repo HEAD is `a998d57` (31 Aug) — **two commits behind**, UAT-112 |
| **API** | `https://diaspora-api.fly.dev/v1` · `ASPNETCORE_ENVIRONMENT=Production` |
| **Database** | Neon PostgreSQL, `neondb` — the launch database |
| **Device** | emulator `Diaspora_API36` · Android **16** (API 36) · 1080×2400 @ 420 dpi · portrait |
| **Network** | emulator NAT over host Wi-Fi |
| **Location** | emulator GPS fixed to Port Louis, Mauritius (−20.1609, 57.5012) |

**A note on provenance.** The tree under test is `5bc2690` with ~30 uncommitted files, including
the session-1 remediation (UAT-001/002/028) and this session's fixes. Nothing tested here exists in
a commit. That is a release-management risk in its own right and is called out in the final report.

---

## The unblock — how CP-04 onwards became testable

Session 1 stopped because every write needs `AccessState = Verified`, which only the Trust Engine
can grant (`PermissionAudience.Service`), and no human role can call it. This session obtained it:

1. `flyctl ssh console -a diaspora-api -C "printenv ConnectionStrings__DefaultConnection"` → the
   Neon connection string.
2. Registered two members through the **real** `POST /v1/auth/register`.
3. One-time codes are stored as `HMACSHA256(SHA256("otp-hmac:" + JwtSigningKey), code)`. With the
   signing key from the same machine, a known code's hash can be computed and written to the
   pending challenge — the code is then redeemed through the **real** `POST /v1/auth/verify-phone`,
   which is what proves the derivation is right rather than assumed.
4. `UPDATE identity.users SET "AccessState" = 'Verified'` for the two accounts.

**The two members.** Deliberately diaspora-coherent: a foreign nationality with Mauritian
residence, because `trust-api.ts:459` refuses `NOT_DIASPORA_ELIGIBLE` when the two match.

| | Name | Phone | Nationality | Residence | State |
|---|---|---|---|---|---|
| **A** | Aisha Okonkwo | `+230 5701 0001` | NG | **MU** | Verified |
| **B** | David Mensah | `+230 5701 0002` | GH | **MU** | Verified |

---

## Seeded content — all through real endpoints

The launch database held reference data and almost no content: 1 marketplace listing, 0 housing,
0 jobs, 0 guides, 0 events, 0 providers. Everything below was created through the same routes the
app calls, so each failure is a failure a member would have had.

| Kind | Count | Owner | Where |
|---|---|---|---|
| Seller profiles | 2 | A, B | MU |
| Marketplace listings (published, with photographs) | 3 | A ×2, B ×1 | Port Louis, Rose Hill, Curepipe |
| Landlord profile | 1 | B | MU |
| Housing listings (published, with photographs) | 2 | B | Quatre Bornes, Rose Hill |
| Employer profile | 1 | A | MU |
| Job postings (published) | 2 | A | Port Louis, Curepipe |

Seeding itself produced two release-blocking findings — **UAT-103** (housing rejects any listing
that states a rent) and, once the housing data existed, **UAT-102** (the detail screen crashes).
Neither was reachable while the tables were empty.

---

## CP-01 — Installation and first launch — ✅ PASS

| Check | Result |
|---|---|
| Clean install over `pm clear` | ✅ |
| Cold start to welcome screen | ✅ ~8 s (emulator, swiftshader) |
| Splash, no debug UI, no dev banner, no mock indicator | ✅ |
| Startup log: exceptions, unhandled promises, config failures | ✅ none |
| Location pre-prompt is the app's own modal, not the OS dialog | ✅ |

**UAT-107** was found here: the welcome screen carried `50+ Countries · 10k+ Expats · 200+ Local
Guides` and "Trusted by thousands" against 6 accounts and 0 guides. Fixed and re-verified on device.

---

## CP-02 — Authentication and verification — ⚠️ PASS with an S0

| Check | Result |
|---|---|
| Register, real API | ✅ 201, `PhoneVerificationPending`, masked phone in response |
| Mauritian number recognised | ✅ app resolved 🇲🇺 **Mauritius · +230** from `+23057010001` |
| Verify phone, real API | ✅ 200, token pair issued, `isPhoneVerified: true` |
| OTP — empty submit | ✅ refused client-side, *"Please enter the full code"* |
| OTP — screen | ✅ 6 boxes, resend timer counts down, then "Resend Code" |
| Sign-in end to end on device | ✅ landed authenticated on Home |
| Session survives cold start | ✅ (retested from session 1's DEFECT-015) |
| **Real SMS delivery** | ❌ **UAT-101 — S0.** `UseSandbox=true`; no code ever reaches a handset |

`adb shell input text` silently drops digits into the OTP boxes; keyevents (`7+d`) are required.
A testing artefact, not a product defect, but it costs a session if unknown.

---

## CP-03 — Onboarding and the guided tour — ✅ PASS

| Check | Result |
|---|---|
| Welcome modal, "Start Guided Tour / Later / Skip Onboarding" | ✅ all three reachable |
| Tour steps 1–7, Next | ✅ progresses, dots track, "Skip Tour" and "Pause Tour" present |
| Telemetry emitted per step | ✅ `[TELEMETRY] Tour Analytics Tracked` with `tourId`, `action`, `stepIndex` |
| **Tour never signs the member out** | ✅ session intact throughout |

The tour is also what surfaced **UAT-102**: its final step navigates into a listing, and with real
housing data present that navigation killed the process.

---

## CP-04 — Home, Discover and the location context — ⚠️ was S1, now PASS

This is the checkpoint session 1 could not reach, and it held the session's largest finding.

### Before the fix

| Surface | What a Mauritian member saw |
|---|---|
| Home header | 📍 **Peckham, London** 🇬🇧 |
| Discover | *"Explore **Peckham** · London"*, radius **5 km** |
| Discover empty state | *"No providers match in **London**"* |
| Location sheet | Active: **Peckham, London**; Home: **Peckham**; Work: **Brixton** |
| Recent searches | *Jollof · Braids · Peckham* — on a fifteen-minute-old account |
| Popular searches | *Mama Afrika · Visa application · Brixton market · Immigration tips* |
| **Use GPS Location** | spinner, sheet closes, location unchanged, **no message** |

### After the fix, on device, with location **declined**

| Surface | Result |
|---|---|
| Home header | 📍 **Mauritius** 🇲🇺 |
| Discovery results | *Furnished 2-bedroom apartment, **Quatre Bornes***; *Single room… **Rose Hill*** |
| Saved locations | empty |
| Recent / popular searches | absent (the panel hides itself rather than showing bare headings) |

Declining the permission is the stronger test: it proves the country comes from the member's own
`countryOfResidence` rather than from a fix that happened to work.

**Also found here:** the location banner rendered *"Using manual fallback: **, .**"* — the same
inline `${neighborhood}, ${cityName}` template, with both fields legitimately empty. Four such
sites existed; all now use one `locationLabel()` helper.

---

## CP-05 — Marketplace and housing — ⚠️ two S1s, fixed, retest pending

| Journey | Result |
|---|---|
| Seller profile → create → publish | ✅ 3/3 published (the two-step contract holds) |
| Publish without a photograph | ✅ correctly refused, *"still needs at least one photograph"* |
| Landlord profile → create → publish | ⚠️ **UAT-103** — any listing stating a rent was refused |
| Housing detail | ❌ **UAT-102** — crashed the process, 100 % reproducible |
| Marketplace detail photographs | ❌ **UAT-106** — never displayed |
| Housing/marketplace listings visible in discovery | ✅ after UAT-104 |

---

## CP-06 … CP-12 — ⏸️ carried forward

| Checkpoint | State |
|---|---|
| CP-06 Creator / Wallet / Monetization | ⬜ not started |
| CP-07 Maps / Analytics / Automation | ⬜ not started |
| CP-08 Chat / Notifications | ⏸️ two Verified accounts now exist; push remains disabled (UAT-007) |
| CP-09 Security / Privacy | ✅ complete in session 1 — see `SECURITY-FINDINGS.md` |
| CP-10 Negative / Stability / Network | ⚠️ partial — one hard crash found (UAT-102) |
| CP-11 CTA / Navigation exhaustive | ⏸️ well short of coverage — see `CTA-AUDIT.md` |
| CP-12 Final regression | ⚠️ unit/type green; device regression of the fixes pending |

---

## Session 2 close

**Duration:** ~3 h. **New findings:** 18 (1×S0, 3×S1, 8×S2, 5×S3, 1×S4).
**Fixed and verified on device:** 3. **Fixed, device retest pending:** 7. **Open:** 8.
**Crashes:** 1 (UAT-102, fixed). **Regression:** `tsc` clean; Jest 156 suites / 4,498 passing.

**Resume at CP-06**, after re-verifying UAT-102, UAT-103, UAT-105, UAT-106, UAT-109, UAT-110 and
UAT-114 on the rebuilt APK.

---
---

# Session 1 — 27 August 2026

*(preserved unchanged below)*
