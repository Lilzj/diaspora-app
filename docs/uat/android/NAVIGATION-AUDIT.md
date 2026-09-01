# Diaspora — Android Pre-Launch UAT: Navigation Audit

**Scope of this audit:** partial. 254 route files exist under `src/app`. Roughly **20** were
reached on the device. The rest are behind Diaspora Verification, which this phase could not
obtain. Everything below was observed, not inferred.

---

## Route inventory

| Measure | Count |
|---|---|
| Route files (`src/app/**/*.tsx`, excluding `_layout` and tests) | **254** |
| Layouts (`_layout.tsx`) | 14 |
| Bottom-tab destinations | 6 visible (`Home`, `Discover`, `Create`, `Messages`, `Knowledge`, `Profile`) + 3 hidden (`search`, `post`, `saved`, all `href: null`) |
| Create-hub destinations | 8 |
| Registered deep-link scheme | `diaspora://` only — **no verified `https://` App Link** |

## Navigation map — the part that was walked

```
(auth)/index  ─┬─ "Join Your Community" ──▶ (auth)/register …            ⬜ not walked
               └─ "Sign in" ─────────────▶ (auth)/phone
                                              │  +44 accepted, live country detection
                                              ▼
                                           (auth)/otp
                                              │  6 digits auto-submit; wrong code → server message
                                              ▼
                                     (tabs)/index  [GATED: Diaspora Verification]
                                              │
     ┌────────────┬─────────────┬─────────────┼─────────────┬──────────────┐
     ▼            ▼             ▼             ▼             ▼              ▼
   Home        Discover       Create       Messages     Knowledge       Profile
  [GATED]     [OPEN] ❌      [GATED]       ⬜ not       [GATED]         [OPEN] ✅
                                                        walked
                                                                            │
                                                        ┌───────────────────┴──────────┐
                                                        ▼                              ▼
                                            Profile · Purchases · Wallet ·     "Log Out"
                                            Grow · Analytics · Creator Studio   ⬜ not walked
                                                  (3 unreadable in dark mode ❌)

  deep link  diaspora:///post  ──▶ (tabs)/post  ⚠️ REACHED, UNGATED  ──▶ /listing-success  ❌
  deep link  diaspora:///country/KE ─▶ "Country not found." dead end ❌
  deep link  diaspora:///country/NG ─▶ fabricated statistics ❌
```

## Findings

### N-1 — The verification gate is on the hub, not the destinations — **UAT-015**
`<FeatureGate>` wraps `(tabs)/create.tsx`, `(tabs)/index`, `(tabs)/knowledge` — the *tabs*. None of
the eight Create destinations carries a gate of its own. Any route into a destination that does not
pass through its tab is ungated:

| Path in | Gated? |
|---|---|
| Create tab → card | ✅ gated |
| `diaspora:///post` | ❌ **not gated — verified on the device** |
| `my-listings.tsx:180` → `/(tabs)/post` | ❌ not gated |
| `components/creator/DraftCard.tsx:78` → `/(tabs)/post` | ❌ not gated |

For seven destinations this wastes the member's time (server returns 403). For `/post` it produces
a complete fabricated success, because `/post` never contacts the server.

### N-2 — `/country/[code]` is a dead end for 189 of 192 countries — **UAT-003**
Renders a bare *"Country not found."* with a **"Go Back"** link, **no header and no bottom tab bar**.
Confirmed on the device for `KE`. "Go Back" does recover correctly to the previous tab — no trap —
but the screen offers no other exit.

### N-3 — The back stack accumulates dead ends
Observed: `/country/NG` → system Back → landed on the **`/country/KE` "not found"** screen from an
earlier deep link, rather than on a tab. Two consecutive Backs were needed to escape. Deep-linked
dead ends are pushed onto the stack and are indistinguishable from real destinations on the way out.

### N-4 — No verified App Links — **S3**
`AndroidManifest.xml` registers only `<data android:scheme="diaspora"/>`. There is no
`android:autoVerify="true"` intent filter for `https://`, and `assetlinks.json` was not found. So:
- A Diaspora link shared into WhatsApp, email or SMS **opens a browser, not the app**.
- Push-notification deep links (once push is configured — **UAT-007**) can only use the custom
  scheme, which does not survive most link-sharing surfaces.
- Any `https://` share/invite flow is broken end to end before it starts.

### N-5 — "View My Live Listing" leads nowhere — **UAT-002**
On `/listing-success`, the primary CTA lands the member on the **gated Home tab**. No listing, no
explanation, no trace of the six-step form they just completed.

## What passed

| Check | Result |
|---|---|
| Tab switching preserves per-tab state | ✅ |
| System Back from a tab-level screen | ✅ |
| Back from the OTP screen preserves the entered phone number | ✅ |
| "Go Back" from the country dead end recovers to a tab | ✅ |
| Cold start after force-stop restores the session and lands on Home | ✅ |
| No unexpected sign-out during any navigation | ✅ |
| No navigation loop or unrecoverable trap found | ✅ |
| Deep link into a running instance does not restart the app | ✅ |

## Not audited

Messages, Wallet, Grow, Analytics, Creator Studio, Settings, Verification, Maps, Automation,
Monetization, Moderation, and every Community Life, Housing, Marketplace and Jobs detail route —
**234 of 254 route files**. Any of them may contain dead ends of the kind found in the 20 that
were walked.

---
---

# Session 2 — 31 August 2026

Phase 31 asks for a full navigation map. One was **not** produced. This records the paths walked,
the failures found, and the structural observations that matter for a release decision.

## Paths walked

```
launch
 └─ startup location prompt ─┬─ ALLOW ────► OS permission ─► Home
                             └─ NOT NOW ──► welcome
welcome ─┬─ Join Your Community ─► registration
         └─ Sign in ─► phone ─► OTP ─► Home
                        │        └─ back ─► phone                  ✅
                        └─ back ─► welcome                         ✅

Home ─┬─ location chip ─► Location Context ─┬─ Use GPS Location   ❌→✅ UAT-105
      │                                      ├─ Travel Mode        ✅
      │                                      └─ close              ✅
      ├─ bell ─► notifications                                     ✅
      ├─ Choose your communities ─► community onboarding           ✅
      └─ housing card ─► housing detail        ❌ CRASH → ✅ UAT-102

tab bar ─┬─ Home
         ├─ Discover ─┬─ Providers      ✅
         │             ├─ Jobs           ❌ CRASH → ✅ UAT-120
         │             ├─ Housing        ✅
         │             ├─ Marketplace    ✅
         │             └─ Guides         ✅
         ├─ Create ─► Create Post (6 cards)                        ✅
         ├─ Messages ─► empty state ─► Explore Diaspora            ✅
         ├─ Knowledge                                              ✅
         └─ Profile ─► 6 destinations ─► Log Out ─► welcome        ✅

deep link  diaspora:///housing/{id}    ❌ CRASH → ✅
deep link  diaspora:///post            ⚠️ session 1 UAT-015 — reaches the ungated wizard
```

## Failures

| # | Path | Defect |
|---|---|---|
| 1 | any → housing detail | **process killed.** UAT-102 — fixed, verified |
| 2 | Discover → Jobs | **process killed.** UAT-120 — fixed, verified |
| 3 | Location sheet → Use GPS Location | closed on unchanged state with no message. UAT-105 — fixed |
| 4 | `diaspora:///post` while unverified | reaches the ungated provider wizard. Session 1 **UAT-015**, still open |

Both crashes are **navigation** failures as much as rendering ones: the destination existed, the
route resolved, and arriving there ended the process. A member has no way back except relaunching
the app.

## Structural observations

**`<FeatureGate>` sits on the tab, not on the destination.** Session 1 recorded this and it still
holds: grepping a leaf screen for a gate gives a false negative, and a deep link that bypasses the
tab bypasses the gate. That is the mechanism behind UAT-015, and it is a pattern rather than an
instance.

**No error boundary survives a render throw.** Both crashes were reported by React with
`isComponentError: true`, and the process still died to `com.android.settings/.FallbackHome`. A
top-level error boundary rendering a recoverable "something went wrong" screen would have converted
two process-killing defects into two rendering defects.

> **This is the single highest-value structural change available before launch.** It is independent
> of every defect in this register, and it bounds the damage of the next one — which, on the
> evidence of this session, is likely to exist in a screen nobody has yet rendered against real
> data.

**Back behaviour was correct everywhere it was exercised** — phone → welcome, OTP → phone, detail →
list, sheet → screen. No loops, no dead ends, no unexpected sign-outs. The guided tour, checked
specifically because session 1 flagged the risk, never signed the member out across all seven steps.

## Not mapped

No path was walked into wallet, monetization, maps beyond the entry point, analytics, automation,
chat threads, organizations, creator studio internals, community life, guides authoring, privacy or
settings. The route tree holds ~254 screens; roughly 30 were reached.

**A navigation map for this application does not yet exist.** It should be generated from the route
tree rather than hand-walked — at 254 screens a hand-walk will always be a sample, and this session
demonstrates that the untested remainder is where the crashes live.

---

## Session 2b — the full-route sweep

Every route file in `src/app` was enumerated (**254**, excluding `_layout.tsx`) and split into
**188 static** routes and **64 dynamic** ones. **203 screens were opened** on the release APK:

* **179 static routes** by deep link (`diaspora://<path>`), excluding the nine auth-flow routes that
  only make sense mid-registration;
* **24 dynamic routes** driven with **real entity identifiers** created earlier in the session — the
  seeded Mauritian housing, jobs, marketplace listings, the employer and landlord profiles, both
  members, and the `MU` / `NG` country pages.

For each: deep-link, wait, screenshot, then read `dumpsys activity` for process survival and
`logcat` for JS errors. 203 screenshots retained.

### Result

| | |
|---|---|
| Screens opened | **203 / 254 (80 %)** |
| Process deaths | **1** |
| Screens with any JS error | **1** (the same one) |
| Screens rendered clean | **202** |

The single failure was `/marketplace/{id}` — **UAT-126**, `TypeError: Cannot read property 'split'
of undefined`, from `listing.seller.name` where the wire sends `seller.displayName`. Fixed and
re-verified: marketplace, housing and job detail all render from a cold process with **0
TypeErrors**.

### What this does and does not establish

**Does:** the two crash fixes from earlier in the session did not move the problem elsewhere. 202
screens across every module — wallet, creator, analytics, automation, monetization, community life,
settings, verification, conversations, maps, intelligence — render without dying.

**Does not:** the sweep **opened** screens; it did not **press** anything. CTA coverage is unchanged
at ~9 %. Both crashes found in the depth-first phase were behind controls a member taps, not behind
navigation alone, so an 80 % screen figure beside a 9 % CTA figure is the honest pairing and neither
number should be quoted without the other.

It also cannot see a *wrong* screen — only a dead one. UAT-124 (GBP wallets), UAT-125 (three
permanently-refused dashboards), UAT-127 (no password recovery) and UAT-128 (the tour that follows
the member) were all found by **looking at** the captures afterwards, not by the automated pass.

### Routes not opened

The 51 not covered are dynamic routes for entities this session had no instance of: events, polls,
campaigns, series, volunteer postings, organisations, guides, updates, conversations, automations,
academy courses, grants, challenges, invoices, promotions, embassies and visas. Creating one of each
is the obvious next step, and on this session's evidence it is where the next crash is.
