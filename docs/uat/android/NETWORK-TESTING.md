# Diaspora — Android Pre-Launch UAT: Network Testing

## Conditions exercised

| Condition | Method | Result |
|---|---|---|
| Normal Wi-Fi / mobile data | emulator default (HSPA) | ✅ All flows completed |
| **Fully disconnected** | `adb shell svc wifi disable && adb shell svc data disable` | ❌ **UAT-019** |
| Reconnection | `svc wifi enable && svc data enable` | ✅ App resumed without restart; no stuck spinner, no crash |
| Backend unreachable by DNS | `api.diaspora.app` does not resolve | ❌ **UAT-001** — this is the shipping default |
| Rate limiting (429) | 6 rapid registrations | ✅ Server enforced; client maps 429 explicitly (`auth-api.ts:174`) |
| Slow network / latency | ⬜ **not simulated** | — |
| Packet loss | ⬜ **not simulated** | — |
| Timeout | ⬜ **not exercised** (30 s client timeout is configured but was never reached) | — |
| App killed mid-request | ⬜ **not tested** | — |
| Network lost mid-request | ⬜ **not tested** | — |

## UAT-019 — offline is invisible

With the device fully offline, `/(tabs)/discover` renders **identically to its online state**:
search field, five category tabs, discovery radius control, and the (fabricated) search chips.
No banner, no error, no retry affordance, no disabled control, no message.

The capability exists and is unused on this surface:
- `src/lib/connectivity.ts` exports `useConnectivityStore`, imported by `src/lib/apiClient.ts`.
- `src/components/conversation/ConnectionBanner.tsx` renders a connection state — in chat only.

Evidence: `evidence/UAT-019-offline-no-indication.png` (note the status-bar connectivity warning
against an apparently healthy screen).

## What the client does right

| Behaviour | Evidence |
|---|---|
| 30 s request timeout, chosen deliberately for payment round trips | `apiClient.ts` — `REQUEST_TIMEOUT_MS` |
| Array query parameters serialise in the form ASP.NET binds (`?status=A&status=B`) | `apiClient.ts` `indexes: null`, with the failure it fixed documented |
| 401 → single-flight token refresh → replay, retried once so a rejected token cannot loop | `auth-session.test.ts` (real tree) |
| 429 mapped to a specific error rather than a generic failure | `auth-api.ts:174` |
| Cleartext refused to every host except loopback aliases | `network_security_config.xml` |
| Reconnection needs no app restart | observed |

## Gaps that matter for launch

1. **Offline is the common case for this audience.** A diaspora app is used on patchy mobile data,
   on roaming, and in transit. An offline state that looks identical to a healthy one is not a
   cosmetic gap — it converts every network failure into "this app is broken".
2. **Nothing was tested under latency.** The whole class of defects the brief asks about — double
   submission on a slow POST, a spinner that never resolves, a duplicate record from an impatient
   second tap — is **unexamined**. The three create flows that *do* work were never driven at all,
   let alone slowly.
3. **`api.diaspora.app` is not a network condition, it is the default.** UAT-001 means the shipped
   build's normal state is "every request fails at DNS". Worth restating here because it is the
   single most consequential network fact in this report.

---
---

# Session 2 — 31 August 2026

## What was exercised

| Condition | Observation |
|---|---|
| Normal Wi-Fi (emulator NAT) | ✅ every journey in `REGRESSION-RESULTS.md` §2 ran on this |
| Real API round trips | ✅ registration, verify-phone, sign-in, create, publish, search and media upload all driven against `diaspora-api.fly.dev` |
| Slow / degraded network | ❌ not simulated |
| Intermittent connectivity | ❌ not simulated |
| Offline | ❌ not retested — session 1's **UAT-019** (no offline indication of any kind) stands |
| Reconnection behaviour | ❌ not tested |
| Latency / packet-loss injection | ❌ not tested |

## Observations worth recording

### The platform reports its own slow request

```
[WRN] RequestTelemetryBehavior Slow request detected:
      RequestSignInOtpCommand took 826ms (threshold: 500ms)
```

826 ms for a sign-in OTP request, of which **~699 ms was the outbound HTTP call to the SMS
provider**. That call is **synchronous inside the request**, so a member at the sign-in screen waits
on it. On a real mobile network, against a live provider rather than a sandbox in the same region,
this gets worse rather than better.

The platform already has an outbox (`platform.outbox_messages`, 18 rows) for other side effects.
Moving SMS dispatch onto it would take the provider's latency off the member's critical path.

### No silent success was observed on the network path

Every failed request in this session surfaced as something the client could read: 400s carried
problem details naming the field, and 404 / 409 / 403 were reliably distinguishable. The **server's**
error contract is sound.

What was *not* stressed is the **client's** handling of those errors under a bad connection —
timeouts, retries, partial writes, a request that lands after the screen has unmounted.

## The gap

Phase 24 asks for retry, error, recovery, cache behaviour and offline messaging under degraded
conditions. **None of it was exercised.** Combined with UAT-019 still being open, the application's
behaviour on a poor connection is entirely unknown — and a poor connection is the normal condition
across much of this product's intended market.

This is the phase whose absence should worry a release manager most, because unlike the untested
feature areas it cannot be inferred from the code: it is a behaviour, not a capability.
