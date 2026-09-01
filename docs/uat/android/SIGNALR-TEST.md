# Diaspora — Android Pre-Launch UAT: SignalR / Real-Time Test

## Verdict: **PARTIAL — the transport is sound; message delivery was never exercised**

---

## What was verified against the live deployment

| Check | Method | Result |
|---|---|---|
| Hub exists at the expected path | `POST https://diaspora-api.fly.dev/hubs/realtime/negotiate?negotiateVersion=1` | ✅ route resolves |
| Unauthenticated negotiate is refused | no `Authorization` header | ✅ **401**, ProblemDetails naming `Platform.Auth.Unauthorized` |
| Malformed token is refused cleanly | `Authorization: Bearer invalid.token.here` | ✅ **401**, not 500 — no stack trace, no framework detail |
| Hub URL derivation is correct | read from the **shipped release bundle** | ✅ `new URL(API_BASE_URL).origin + '/hubs/realtime'` |

The URL derivation is worth calling out because it is a defect the codebase already fixed and
documents: `API_BASE_URL` ends in `/v1`, the hub sits at the **host root**, and naive concatenation
would produce `…/v1/hubs/realtime`, which 404s at negotiate. The shipped bundle derives the origin.
Verified in the artefact, not just in source.

## Client design, from source

| Property | State |
|---|---|
| Singleton keyed on the **member id** | ✅ `(tabs)/messages.tsx` reads `useAuthStore.getState().user?.userId`. A source comment records the prior bug — a hardcoded `'user-current'` meant the socket was never rebuilt on account change, leaving the previous member's connection open and still joined to their group |
| Hub methods `invoke`d, not `send`, and their `bool` result branched on | ✅ documented in `lib/realtime.ts` — `JoinGroup`, `Typing`, `MarkRead`, `AcknowledgeDelivery` answer `false` for "refused" rather than throwing |
| Connection failure degrades gracefully | ✅ `messages.tsx` catches, still renders, and loads conversations over REST |
| Connection state surfaced to the member | ✅ `components/conversation/ConnectionBanner.tsx` |
| Cleanup on unmount | ✅ `cancelled` flag and teardown present |

## NOT tested — the substance of Phase 19

| Requirement | Status |
|---|---|
| Authenticated negotiate succeeds | ⬜ **not tested** — a `LimitedAccess` member gets 403 on `/conversations` |
| Connect / reconnect cycle | ⬜ not tested |
| Behaviour on background → foreground | ⬜ not tested |
| Behaviour on network loss → restoration | ⬜ not tested |
| **Message delivery between two authenticated sessions** | ⬜ **not tested** |
| No duplicate messages | ⬜ not tested |
| No lost messages | ⬜ not tested |
| Typing indicators | ⬜ not tested |
| Presence | ⬜ not tested |
| Read receipts / delivery acknowledgement | ⬜ not tested |
| Repeated mount/unmount does not leak connections | ⬜ not tested |
| Unread counts | ⬜ not tested |

## Why

Both test identities are `PhoneVerificationPending` / `LimitedAccess`. `GET /conversations` returns
**403** for them, and there is no path to `Verified` without direct database access to the hosted
Neon instance. Two verified accounts are the minimum for a real-time test and neither could be
created.

## Known limitation, carried forward

The platform is **single-instance** for real time: the host refuses to start on more than one
instance without a backplane. That is a declared limit rather than a defect, and it was verified in
an earlier phase, not this one. It does mean real-time capacity is bounded by one machine at launch.

## Related defect

**UAT-005** — every attachment option in chat (Camera, Gallery, Document, Location) is
non-functional, and the image path shows a **success**-styled alert reading *"Image will be sent in
the full release."* That is a chat defect found by source audit, not by driving the hub.

## Required before release

1. Two `Verified` accounts.
2. Authenticated negotiate → connected.
3. Send/receive both ways; confirm no duplication and no loss.
4. Kill the network mid-conversation; confirm reconnect and that nothing is silently dropped.
5. Background one client for several minutes; confirm messages arrive on foreground.
6. Mount/unmount a conversation 20 times; confirm the connection count does not grow.

---
---

# Session 2 — 31 August 2026

## Not run

This session did not exercise this area. Nothing below was retested, and session 1's findings
stand unchanged.

The one thing that *did* change is that the precondition is now met: **two `Verified` accounts
exist** (Aisha Okonkwo `+230 5701 0001`, David Mensah `+230 5701 0002`, both `AccessState=Verified`,
both resident in Mauritius). Session 1 could not run a two-party test because no such pair existed.
That blocker is gone; the test was simply not reached before the session ended.

## Why the session went elsewhere

The first two capabilities exercised in earnest — housing and jobs — each contained a defect that
**killed the app process**, and a third (housing create) refused every listing that stated a price.
Reproducing, root-causing, fixing, rebuilding and re-verifying those consumed the session.

That was the correct trade. It also means this area carries **no evidence either way**, and no
statement about it in any summary should be read as a pass.

## What to run first when this resumes

1. Sign in as A on one device and B on a second (or a second emulator).
2. Open a conversation from a listing detail — `ConversationHub.openOrCreateConversation` is the
   entry point and it is wired.
3. Send in both directions; confirm delivery, ordering, read state and unread counts.
4. Background one client, send from the other, foreground it — confirm no message is lost and none
   is duplicated.
5. Drop the network on one client, send from the other, restore — confirm the transport reconnects
   and backfills rather than silently dropping.
6. Only then attempt the archive / mute / pin / block / report controls.
