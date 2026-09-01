# Diaspora — Android Pre-Launch UAT: CTA Audit

Phase 30 asks for every interactive control on every screen to be pressed. **That was not
achieved, and the shortfall is large.** This file records exactly what was pressed so the gap is
measurable rather than implied.

---

## Scale of the surface

| Measure | Count |
|---|---|
| `<TouchableOpacity>` / `<Pressable>` in `src/app` | **675** |
| …in `src/components` | not counted separately |
| Route files | 254 |
| **CTAs actually pressed on the device** | **≈ 35** |
| **Coverage** | **≈ 5 %** |

The limiting factor is the same one named throughout this report: every write requires
`AccessState = Verified`, which only the Trust Engine can grant. Most of the 675 controls sit
behind that gate.

---

## Pressed, with the result

### Welcome / authentication — 9
| CTA | Result |
|---|---|
| Location pre-prompt **"NOT NOW"** | ✅ dismissed; but silently substitutes Peckham — **UAT-017** |
| **"Sign in"** | ✅ → `(auth)/phone` |
| Phone field | ✅ focus, numeric keypad, live country detection (UK 🇬🇧 → NG 🇳🇬) |
| **"Continue"** (disabled state) | ✅ correctly inert with an empty field |
| **"Continue"** (enabled) | ✅ → OTP screen. But claims a code was sent — **UAT-020** |
| OTP boxes | ✅ auto-advance, auto-submit on the 6th digit |
| **"Verify"** with 4 of 6 digits | ✅ *"Please enter the full code"*, **no network call** |
| **"Verify"** with a wrong 6-digit code | ✅ *"The verification code is incorrect."* — the server's own message |
| System **Back** from OTP | ✅ returns to phone entry with the number preserved |

### Bottom navigation — 6
| Tab | Result |
|---|---|
| Home | ✅ gated correctly |
| Discover | ✅ opens — **UAT-016**, **UAT-017**, **UAT-019** |
| Create | ✅ gated correctly |
| Messages | ⬜ **not pressed** |
| Knowledge | ✅ gated correctly |
| Profile | ✅ opens with real member data |

### Provider listing wizard (`/post`, reached by deep link) — 14
| CTA | Result |
|---|---|
| Business name field | ✅ accepts input |
| Short description field | ✅ accepts input |
| Category chip **"Hair & Beauty"** | ✅ selects; enables **Next** |
| **"Next"** × 5 (steps 1→6) | ✅ each advances |
| **"Add Photo"** | ❌ **no picker, no permission prompt** — fake progress then a hardcoded stock photo. **UAT-002** |
| **"Publish Listing"** | ❌ **no network call**; → *"Listing Published!"*. **UAT-002** |
| **"View My Live Listing"** | ❌ lands on the gated Home tab. **UAT-002** |
| **"Back"** (step nav) | ✅ |
| **"SAVE & EXIT"** | ⬜ **not pressed** |

### Country page — 3
| CTA | Result |
|---|---|
| Deep link to `/country/KE` | ❌ *"Country not found."* — **UAT-003** |
| Deep link to `/country/NG` | ❌ fabricated statistics — **UAT-003** |
| **"Go Back"** | ✅ recovers to the previous tab |

### System / lifecycle — 3
| Action | Result |
|---|---|
| Force-stop → cold start | ✅ session restored, lands authenticated. 1,094 ms |
| Dark mode toggle | ❌ **UAT-018** — three Profile titles become invisible |
| Wi-Fi + data off | ❌ **UAT-019** — no offline indication anywhere |

---

## Explicitly NOT pressed

Everything below is **untested**. Listed so no reader treats silence as a pass.

- **Every control in Messages, Wallet, Grow, Analytics, Creator Studio, Settings, Verification,
  Maps, Automation, Monetization, Moderation** — six of nine Profile hub rows, and every screen
  they lead to.
- **The other seven Create destinations** — Guide, Update, Job, Housing, Marketplace, Event, Hub.
  Three are proven broken by contract probing (**UAT-002/009/013**); the other five are
  *contract-conformant* but were never driven on a device.
- **Every overflow menu, context menu, bottom sheet, swipe action and floating action button** in
  the application. Not one was opened.
- **The registration wizard** end to end.
- **Explore Diaspora's interactive walkthrough** — Phase 6 names this specifically, including the
  requirement that it must never sign the member out. **Not tested.**
- **Pull-to-refresh** on any screen.
- **Every share, report, block, mute, pin and archive control.**
- **Log Out** — deliberately not pressed, because the session was needed for the whole run.

## Conclusion

**Phase 30 is NOT satisfied.** At ~5 % coverage, no screen in this application can be certified on
CTA grounds. The four defects found in ~35 presses is a high hit rate, and the honest inference
from a 5 % sample with that density is that **more defects of this class exist in the untested
95 %**, not that the remainder is clean.

---
---

# Session 2 — 31 August 2026

Estimated total interactive controls in the route tree: **~675**. Pressed across both sessions:
**~60 (9 %)**.

## Pressed and verified this session

| Screen | Control | Result |
|---|---|---|
| Startup prompt | **ALLOW** | ✅ raises the OS permission flow |
| Startup prompt | **NOT NOW** | ✅ records the refusal; the app still opens on the member's country |
| Welcome | **Join Your Community** | ✅ → registration |
| Welcome | **Sign in** | ✅ → sign-in |
| Sign in | phone field | ✅ resolves 🇲🇺 **Mauritius · +230** live from a `+230…` number |
| Sign in | **Continue** (empty) | ✅ disabled until a valid number is present |
| Sign in | **Continue** (valid) | ✅ → OTP, real `POST /auth/otp/start` |
| Sign in | **Sign up** | ✅ → registration |
| Sign in | back arrow | ✅ |
| OTP | **Verify** with **no digits** | ✅ refused client-side, *"Please enter the full code"* |
| OTP | **Verify** with a valid code | ✅ → Home, session established |
| OTP | **Resend** countdown → **Resend Code** | ✅ timer runs, control enables |
| Home | location chip | ✅ → Location Context sheet |
| Home | notification bell | ✅ opens |
| Home | **Choose your communities** | ✅ navigates |
| Home | **Start exploring** | ✅ |
| Home | **ENABLE** on the GPS banner | ✅ opens the location flow |
| Location sheet | **Use GPS Location** | ❌ **UAT-105** — silent failure. **Fixed**; now surfaces a message |
| Location sheet | **Travel Mode** toggle | ✅ no longer drops the member in Rose Hill |
| Location sheet | close (×) | ✅ |
| Location sheet | saved-location delete | ✅ (rows are now empty, so there is nothing fabricated to delete) |
| Onboarding modal | **Start Guided Tour** | ✅ |
| Onboarding modal | **Later** / **Skip Onboarding** | ✅ both dismiss |
| Guided tour | **Next** ×7, **Skip Tour**, **Pause Tour** | ✅ progresses; telemetry emitted per step; **never signs the member out** |
| Tab bar | Home · Discover · Create · Messages · Knowledge · Profile | ✅ all six reachable |
| Discover | **Providers / Jobs / Housing / Marketplace / Guides** | ⚠️ **Jobs crashed the app — UAT-120.** **Fixed**; all five now render |
| Discover | **All communities** / **Choose** | ✅ |
| Discover | **Discovery Radius** expander | ✅ |
| Discover | **Map View** | ✅ opens |
| Discover | recent / popular search chips | ✅ absent now that they are not fabricated |
| Housing detail | opened by deep link | ❌ **UAT-102 — killed the process.** **Fixed**; renders |
| Housing detail | **Pay Rs 44000 deposit** | ✅ present, with an honest no-escrow disclosure beneath it |
| Housing detail | save (♡), share (↗), back | ✅ |
| Profile | **Log Out** | ✅ |
| Profile | Profile · Purchases & tenancies · Wallet · Grow · Analytics · Creator Studio | ✅ all six open |
| Profile | **Reputation Dashboard** | ✅ |

## Failures found

| Control | Screen | Defect | State |
|---|---|---|---|
| **Jobs tab** | Discover | killed the process for every job posting | **UAT-120 — fixed, verified** |
| **Housing listing / deep link** | anywhere | killed the process for every listing with a photograph | **UAT-102 — fixed, verified** |
| **Use GPS Location** | Location sheet | silent no-op; the sheet closed on stale data | **UAT-105 — fixed** |
| **Apply** | Discover → Jobs | not pressed — the tab crashed before it could be reached | ⬜ untested |

## Not pressed — the honest list

Whole surfaces where **no** control was exercised:

Wallet — deposits, withdrawals, payouts, reward conversion · monetization and every plan ·
advertisements and sponsorships · maps beyond opening Map View · routing, navigation, heat maps,
neighbourhood scores · analytics of every kind · automation centre · chat: send, receive, archive,
mute, pin, block · notification preferences · organizations: create, join, leave, manage, roles,
members, moderation · creator studio internals: drafts, archive, reviews, rewards, milestones,
challenges, learning, earnings, referrals · community life: events, polls, donations, volunteering,
memberships · guides: create, publish, vote, bookmark · privacy: export, deletion, sessions,
blocked users · settings and integrations.

**No screen in this application should be considered CTA-certified.** The controls above are the
ones with evidence. Two of the four newly-exercised controls in previously-unreached areas turned
out to be crashes, which is the relevant base rate for the untested remainder.
