# Diaspora — Android Pre-Launch UAT: Test Matrix

Coverage against the 41 phases of the brief. **"Not tested" means not tested** — it is never a
synonym for passed.

| Legend | |
|---|---|
| ✅ | Tested, passed |
| ⚠️ | Tested, passed with reservation or partial coverage |
| ❌ | Tested, failed — bug raised |
| ⏸️ | Blocked, with the blocker named |
| ⬜ | **Not tested** |

---

## Coverage summary

| | Phases | Share |
|---|---|---|
| Tested (✅ ⚠️ ❌) | 24 | **59 %** |
| Blocked (⏸️) | 9 | 22 % |
| Not tested (⬜) | 8 | 19 % |

The dominant blocker is stated once here and referenced throughout:

> **Every write in this platform requires `AccessState = Verified`.** A newly registered member is
> `PhoneVerificationPending`; completing the OTP moves them to `LimitedAccess`; **only the Trust
> Engine can promote to `Verified`**, through `IdentityPermissions.ApplyTrustDecision`, whose
> audience is `PermissionAudience.Service` — no human role, not Moderator, not Admin, can call it.
> The documented workaround is to set `AccessState` directly in the database, which requires the
> hosted Neon connection string. That was not available to this phase.
>
> **Consequence:** every capability whose first step is *create something* could be driven only to
> the point where the server refused it. That is enough to prove three create flows are broken
> (UAT-002, UAT-009, UAT-013) but not enough to certify the ones that are not.

---

## Phase-by-phase

| # | Phase | Status | Evidence / reason |
|---|---|---|---|
| 1 | Installation & first launch | ✅ | Clean uninstall → install of the release APK. Cold start 3,802 ms first / 1,094 ms after. Firebase initialised. No fatal exception in logcat. `run-as` refused — genuinely non-debuggable. UAT-027 raised on start time |
| 2 | Registration | ⚠️ | Server-side validation driven through the API: empty body, weak/short passwords, missing uppercase, invalid phone, duplicate — all correctly refused; **common-password check rejected a 16-char passphrase containing the product name**. Rate limit enforced at 5/300 s. **The on-device registration wizard was not walked** (⬜) — sign-in was used to reach the app |
| 3 | Login | ✅ | OTP sign-in driven end to end on the device against the live backend, with a real code read from the Africa's Talking sandbox. Wrong code → the server's own message. Incomplete code → client-side refusal, no request. Session survives force-stop + cold start. UAT-020/021/022 raised |
| 4 | Account verification | ⏸️ | Phone verification completed (`PhoneVerificationPending` → `LimitedAccess`). **Diaspora Verification could not be completed** — see the blocker above |
| 5 | Onboarding | ⬜ | Not reached; the account used was already registered |
| 6 | Explore Diaspora | ⚠️ | 31 tutorials audited as content. **UAT-012** — a false deposit-protection guarantee. The interactive walkthrough was not driven on the device (⬜). No sign-out risk found in `explore/` |
| 7 | Main navigation | ✅ | All six tabs opened. Gating verified per tab. Bottom-nav safe area correct on 1080×2400. Landscape is N/A — `screenOrientation="portrait"` app-wide. UAT-025 raised |
| 8 | Discovery | ❌ | **UAT-016** (fabricated search history), **UAT-017** (Peckham default scoping every query), **UAT-019** (offline invisible) |
| 9 | Community | ⏸️ | Gated behind Diaspora Verification. **UAT-006** and **UAT-009** raised from source + live contract probing |
| 10 | Jobs | ❌ | **UAT-013** — posting a job cannot succeed: five required fields missing, employer profile never created. Browsing not reachable (gated) |
| 11 | Marketplace | ⏸️ | Create flow contract-checked and **conforms**. Browse and publish gated |
| 12 | Housing | ⏸️ | Create flow contract-checked and **conforms**. Browse and publish gated |
| 13 | Creator | ⬜ | Not tested — gated |
| 14 | Wallet & financial | ⚠️ | Source-verified: `add-money`/`withdraw` early-return to an honest "Not available yet" disclosure in a release build; `wallet/protection.tsx` refuses to simulate escrow and says so. **No financial screen was driven on the device** (⬜) |
| 15 | Monetization | ⬜ | Not tested |
| 16 | Maps | ⚠️ | Location permission **deny** path tested — and it is a defect (UAT-017). Allow / deny-permanently / revoke not tested (⬜) |
| 17 | Analytics | ⚠️ | Source audit: **zero** hardcoded percentages, trends or placeholder series in `analytics/`. Not driven on the device (⬜) |
| 18 | Automation | ⬜ | Not tested |
| 19 | Chat & real-time | ⚠️ | Hub verified live: `/hubs/realtime/negotiate` → **401** unauthenticated and **401** with a malformed token; URL derivation from the API origin verified in the shipped bundle. **UAT-005** — all four chat attachment options are dead. **No two-session message exchange** (⬜) |
| 20 | Push notifications | ❌ | **UAT-007** — `EXPO_PUBLIC_PUSH_PROVIDER` is unset on the production profile, so `isPushConfigured()` is false and no token is ever registered. Delivery therefore **cannot** be tested on a production build |
| 21 | Organizations | ❌ | **UAT-009** — creation cannot succeed. Authorization boundary verified: `403 "Missing required permission: organizations:create"` |
| 22 | Privacy & security | ✅ | See `SECURITY-FINDINGS.md`. IDOR, token tampering, access ladder, enumeration all pass. Account deletion not executed (⬜ — destructive) |
| 23 | Negative testing | ⚠️ | Registration, OTP, org/job/event payloads, malformed tokens, oversized and injected input. Not exhaustive across every feature (⬜) |
| 24 | Network testing | ⚠️ | Offline tested → **UAT-019**. Latency, packet loss and mid-request interruption not simulated (⬜) |
| 25 | Refresh & persistence | ⚠️ | Session persistence across force-stop + cold start ✅. Pull-to-refresh per screen not swept (⬜) |
| 26 | Keyboard & forms | ⚠️ | Phone entry and OTP entry: keyboard raises correctly, CTA lifts above it, no trapped field, country detection live. Not swept across all forms (⬜) |
| 27 | Dark/light mode | ❌ | **UAT-018** — three Profile hub titles invisible in dark mode, including **Wallet**. Pattern found 94× across 51 files |
| 28 | Accessibility | ⚠️ | 552 `accessibilityLabel` and 476 `accessibilityRole` against 675 touchables in `src/app` (~82 %). Contrast failure UAT-018. No screen-reader pass, no font-scale pass (⬜) |
| 29 | Mock / placeholder hunt | ❌ | `MOCK-DATA-AUDIT.md`. 0 TODO, 0 FIXME, 0 lorem, 0 secrets, 0 fake analytics — but **six** user-facing fabrications |
| 30 | CTA exhaustive | ⏸️ | `CTA-AUDIT.md`. ~35 CTAs driven of an estimated 675+. **Not exhaustive** |
| 31 | Navigation exhaustive | ⚠️ | `NAVIGATION-AUDIT.md`. **UAT-015** (deep-link gate bypass) and the `/country` dead end found. Not a full map |
| 32 | Crash & stability | ⚠️ | ~35 min continuous session, ~40 navigations, tab switching, deep links, force-stop, offline/online, theme switch. **Zero crashes, zero ANRs, no fatal logcat entries.** No soak test (⬜) |
| 33 | Security QA | ✅ | `SECURITY-FINDINGS.md` |
| 34 | Backend/frontend truth check | ✅ | All 223 client GET routes probed live. **No undeclared missing route.** Three create payloads proven non-conforming |
| 35 | Bug classification | ✅ | 27 findings, each with severity, priority, reproduction, expected, actual, root cause and component |
| 36 | Defect handling | ⚠️ | Discovered, reproduced, documented, classified. **Nothing was fixed** — see the Final Report on why |
| 37 | Execution journal | ✅ | This directory |
| 38 | Checkpoints | ✅ | CP-00 … CP-04 complete; CP-05 … CP-12 blocked or not started |
| 39 | Exit criteria | ✅ | Applied without adjustment. See `FINAL-VERDICT.md` |
| 40 | Final regression | ⚠️ | `REGRESSION-RESULTS.md` — typecheck and Jest run. Backend build/tests and E2E not re-run (⬜) |
| 41 | Scorecard | ✅ | `FINAL-REPORT.md` |

---

## Device matrix

See `DEVICE-MATRIX.md`. **One profile only.** Four of the five AVDs in the brief's matrix were not
exercised, so all layout findings are single-profile and the small-screen and tablet risks named in
Phase 7 are **unassessed**.
