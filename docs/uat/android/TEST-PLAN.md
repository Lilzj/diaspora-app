# Diaspora — Android Pre-Launch UAT: Test Plan

**Phase:** Android Release Candidate certification
**Scope:** ANDROID ONLY. iOS is explicitly **NOT TESTED / NOT CERTIFIED** by this phase.
**Started:** 27 August 2026
**Tester role:** Independent QA / release certification engineer

---

## 1. The question this phase answers

> If this APK were submitted to the Google Play Store today, can we confidently
> release it to real users?

Not "does it build", not "are the tests green", not "does the happy path work".
Every previous phase in this programme certified against artefacts it produced
itself. This phase treats the application as a black box that has to survive a
hostile user on a real handset.

## 2. Environment under test

| Item | Value | How established |
|---|---|---|
| Frontend repo | `C:\Users\User\source\repos\Diaspora` | — |
| Frontend commit | `5bc2690` — *the client renders live indicators only where the hub serves them* | `git log -1` |
| Backend repo | `C:\Users\User\source\repos\diaspora-backend` | — |
| Backend commit | `dd5286c` — *the SMS policies named a module that does not exist* | `git log -1` |
| App version | `1.0.1` | `app.json` |
| Android versionCode | `2` | `android/app/build.gradle` |
| Package | `com.diaspora.app` | — |
| minSdk / targetSdk | 24 / 36 | `dumpsys package` |
| Expo SDK | 57.0.4 | `package.json` |
| React Native | 0.86.0 | `package.json` |
| New architecture | enabled (`newArchEnabled=true`) | `gradle.properties` |
| Hermes | enabled | `gradle.properties` |
| Edge-to-edge | enabled | `gradle.properties` |
| Backend under test | `https://diaspora-api.fly.dev/api/v1` | Fly.io, `ASPNETCORE_ENVIRONMENT=Production` |
| Backend liveness | `GET /health/live` → **200** | verified |
| Backend readiness | `GET /health/ready` → **200** | verified (database reachable) |
| Database | Neon PostgreSQL, `us-east-2` | `fly.toml` |
| SMS provider | Africa's Talking **sandbox** | `.env.deploy`, deployed config |

### 2.1 A note on which backend "the launch environment" is

`fly.toml` describes the deployed API in its own words as a **test deployment**
that is **public**. It is nevertheless the only running Diaspora backend, it runs
with `ASPNETCORE_ENVIRONMENT=Production`, and it is the environment the client
was last driven against. This phase therefore treats it as the environment under
test and records separately (see BUG-REGISTER) that the host the shipping client
is configured to call is **not** this one and does not exist.

## 3. Device matrix

Profiles are Android Virtual Devices under `/c/Android/Sdk`. See `DEVICE-MATRIX.md`
for per-profile results.

| Profile | AVD | Purpose |
|---|---|---|
| Standard phone | `Diaspora_API34` | 1080×2400 @ 420dpi, Android 14 — primary |
| Small phone | `Diaspora_Small` | low resolution, cramped layout, CTA reachability |
| Large / tablet | `Diaspora_Tablet` | wide layout, split behaviour |
| Newest OS | `Diaspora_API36` | targetSdk 36 runtime behaviour |
| Low-spec | `Diaspora_ATD35` | performance / ANR headroom |

## 4. Method

1. **Static truth pass** — configuration, secrets, build variant, shipped
   defaults, mock-data hunt, capability declarations. Findings here are real
   findings: they ship in the artefact.
2. **Build the release variant** and install it clean.
3. **Drive it by hand** through the checkpoint sequence, phase by phase, tapping
   every CTA that a real member would reach.
4. **Corroborate every UI claim against the backend.** A toast is not evidence.
   A 200 is not evidence. The persisted row is evidence.
5. **Attack it** — invalid input, other members' identifiers, expired sessions,
   killed network, rotation, backgrounding, rapid taps.
6. **Classify, fix release blockers, retest, regress.**

## 5. Evidence rules

- Every bug carries a reproduction, an expected result, an actual result and
  captured evidence (logcat, HTTP, screenshot, or a database read).
- No severity is lowered to make the release pass.
- Anything not tested is recorded as **not tested**, never as passed.

## 6. Checkpoints

Progress is recorded in `EXECUTION-JOURNAL.md` against checkpoints CP-01…CP-12 so
an interrupted session resumes rather than restarts.
