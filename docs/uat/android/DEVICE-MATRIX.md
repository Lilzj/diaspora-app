# Diaspora — Android Pre-Launch UAT · Device Matrix

**Session 2 · 31 August 2026.** This document records what was actually exercised, and — more
importantly for a release decision — what was not.

---

## Available profiles

Five AVDs are configured on the test host:

| AVD | Intended profile |
|---|---|
| `Diaspora_API36` | standard phone, current Android |
| `Diaspora_API34` | standard phone, one release back |
| `Diaspora_ATD35` | automated-test device, reduced rendering |
| `Diaspora_Small` | small phone |
| `Diaspora_Tablet` | tablet / large screen |

---

## Exercised in this session

| | |
|---|---|
| **AVD** | `Diaspora_API36` |
| **Android** | **16** (`ro.build.version.release=16`, API 36) |
| **Screen** | 1080 × 2400 |
| **Density** | 420 dpi (`~2.625×`) |
| **Orientation** | portrait only |
| **Renderer** | `swiftshader_indirect` (software) |
| **Navigation** | gesture navigation (emulator default) |
| **Network** | emulator NAT over host Wi-Fi |
| **Location** | GPS fixed to Port Louis, Mauritius (−20.1609, 57.5012) |
| **App** | `com.diaspora.app` `1.0.1` (versionCode 2), minSdk 24, **targetSdk 36**, Hermes, New Architecture |

### Layout observations on this profile

| Check | Result |
|---|---|
| Bottom tab bar clear of the gesture area | ✅ |
| CTA reachable with the keyboard open (sign-in, OTP) | ✅ — `Continue` and `Verify` both stayed above the keypad |
| Bottom sheet height (Location Context, 85 %) | ✅ within the safe area |
| Modal overflow (welcome / onboarding modal) | ✅ |
| Horizontal clipping | ⚠️ the Discover category rail and the Home quick-action rail both clip their last item mid-word (*"Brows…"*, *"Mec…"*). They scroll, so nothing is unreachable, but the truncation reads as a layout fault rather than as an affordance |
| Content behind system navigation | ✅ none observed |
| Sign-in screen vertical rhythm | ⚠️ roughly 55 % of the screen is empty between the phone field and the CTA. Not a defect; noted for design |

---

## NOT exercised — and this is a certification gap

| Dimension | State |
|---|---|
| **Small phone** (`Diaspora_Small`) | ❌ not run |
| **Tablet / large screen** (`Diaspora_Tablet`) | ❌ not run |
| **Android 14 / API 34** (`Diaspora_API34`) | ❌ not run |
| **Reduced-rendering ATD** (`Diaspora_ATD35`) | ❌ not run |
| **Landscape** | ❌ not run on any profile |
| **3-button navigation** | ❌ not run |
| **Low / high density variants** | ❌ not run |
| **Physical hardware** | ❌ none available to this session |
| **Dark mode** | ❌ not re-run this session — session 1 recorded **UAT-018** (Wallet, Grow and Creator Studio titles invisible in dark mode) and it has not been retested |
| **Dynamic font scaling** | ❌ not run |

The session was spent on one profile because the defects found on it were release-blocking and
each fix required a full rebuild-install-reproduce cycle. That is the right trade — a crash on the
Jobs tab matters more than a tablet layout — but it means **the device matrix is a single point**,
and no claim about behaviour on other screen sizes, other Android versions, landscape, or real
hardware is supported by evidence.

**minSdk is 24 (Android 7.0).** Nothing between API 24 and API 36 has been tested. That is a
twelve-release span containing the scoped-storage, notification-permission and predictive-back
changes, on a build whose `targetSdk` is 36.

---

## Recommendation before certification

At minimum, and in this order:

1. **`Diaspora_API34`** — one release back, gesture *and* 3-button navigation. Most real installs
   will not be on Android 16.
2. **`Diaspora_Small`** — the keyboard-overlap and CTA-reachability checks are only meaningful on
   the smallest supported screen.
3. **A physical device** — software rendering hides GPU-dependent problems, and the emulator's
   network is not a mobile network.
4. **Dark mode across every screen**, to close UAT-018 rather than carry it.
5. **Landscape**, at least on the screens that declare support for it.
