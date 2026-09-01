# Diaspora — Android Pre-Launch UAT: Push Notification Test

## Verdict: **FAIL — push is disabled in a production build**

Not "untested". **Disabled by configuration**, and therefore untestable on the artefact that would
ship.

---

## The mechanism

`eas.json`:
```json
"production": { "env": {} }
```

`src/config/integration-config.ts`:
```ts
pushProvider: process.env.EXPO_PUBLIC_PUSH_PROVIDER ?? ''
…
function parsePushProvider(raw) {
  if (raw === 'expo') return 'expo';
  if (raw === 'fcm')  return 'fcm';
  if (raw === 'apns') return 'apns';
  return 'none';                      // ← what a production build resolves to
}
…
export function isPushConfigured() {
  if (config.pushProvider === 'none') return false;   // ← always, in production
  …
}
```

`EXPO_PUBLIC_*` is inlined at bundle time. With the variable unset, `isPushConfigured()` is a
compile-time `false`: **no token is minted, none is registered with the backend, and no
notification can be delivered.**

## What IS in place

| Component | State |
|---|---|
| `google-services.json` | ✅ present, `project_id=diaspora-31f48`, client matches `com.diaspora.app` |
| Firebase initialisation on device | ✅ verified in logcat: `FirebaseApp initialization successful` |
| `expo-notifications` plugin | ✅ configured in `app.json` with colour `#F59300` and `defaultChannel: "default"` |
| `POST_NOTIFICATIONS` permission | ✅ present in the merged release manifest |
| FCM manifest entries | ✅ `com.google.firebase.messaging.default_notification_channel_id`, `…default_notification_color`, `c2dm.permission.RECEIVE` |
| Backend push registration route | ✅ `POST /notifications/push/endpoints` exists and is in the drift ledger |
| Backend behaviour with no provider | ✅ records attempts as `Unsupported` — it does **not** fake delivery |
| Client-side lifecycle code | ✅ `lib/integrations/push-lifecycle.ts`, `providers/push.ts` |

**Everything is built. One environment variable selects the transport, and the production profile
does not set it.**

## Consequently NOT tested

| Phase 20 requirement | Status |
|---|---|
| Firebase initialisation | ✅ verified |
| Token registration | ❌ **cannot occur** |
| Notification permission prompt | ⬜ not reached (`POST_NOTIFICATIONS` shows `granted=false`) |
| Foreground notification | ⬜ impossible |
| Background notification | ⬜ impossible |
| Terminated-app notification | ⬜ impossible |
| Notification tap → correct screen/entity/state | ⬜ impossible |
| Deep link from a notification | ⬜ impossible — **and see UAT-015 / N-4**: only the `diaspora://` custom scheme is registered, with no verified App Link |
| Multiple notification types | ⬜ impossible |
| Notification preferences | ⬜ not tested |
| Invalid / stale payload handling | ⬜ not tested |

## Assessment

To the app's credit, it **does not pretend**. The capability reports itself unavailable rather than
silently swallowing notifications, and the backend records `Unsupported` rather than a false
delivery. That is the right failure mode and it is why this is **UAT-007 at S1 rather than S0**.

But a marketplace, jobs, housing and messaging platform with **no push notifications at all** is
not a complete product. A member receives no alert for a new message, a job response, an event
reminder or a housing enquiry. Retention for a community app depends on exactly this.

## Required before release

1. Set `EXPO_PUBLIC_PUSH_PROVIDER=fcm` (and `EXPO_PUBLIC_PUSH_EXPO_PROJECT_ID` if the Expo
   transport is chosen) on the **production** EAS profile.
2. Rebuild and confirm a token is minted and registered against the backend.
3. Deliver one notification of each type in **foreground**, **background** and **terminated**
   states.
4. Confirm the tap target resolves to the correct screen, entity and state.
5. Add a verified `https://` App Link so notification and share links open the app
   (see `NAVIGATION-AUDIT.md` N-4).
6. Confirm a malformed payload fails safely rather than crashing.

Until all six are done, **Phase 20 cannot pass** and the release cannot be certified on
notifications.

---
---

# Session 2 — 31 August 2026

## Not run — and still blocked by configuration

Session 1 recorded **UAT-007**: push notifications are **disabled by configuration in every
production build**. Nothing in this session changed that, and no push test was attempted, because
the precondition is a build that can register a token.

Firebase initialisation, token registration, the notification permission, foreground / background /
terminated delivery, deep links from a notification tap, and notification preferences are all
**untested**.

## Why this matters more than its phase position suggests

Diaspora is a community product. A message from a landlord, a reply to a job application, an event
reminder and a marketplace offer are all things a member is expected to come back for. With push
off, every one of them requires the member to open the app and look.

A launch decision should be explicit about whether that is acceptable for v1, rather than leaving
it as an untested phase. If it is acceptable, say so. If it is not, it belongs above several of the
S2s in the fix order.

## What the database shows

The notifications module is not a stub — it is substantially built and seeded:

```
notification_templates              75
notification_template_localizations 90
notification_template_variables    164
notification_rules                  77
notification_categories             21
notification_deliveries             24
notifications                       12
user_inboxes                         6
```

So the platform can compose and record a notification. What it cannot currently do is deliver one
to a handset. That is a narrower problem than "notifications are unbuilt", and it is worth stating
precisely in whatever launch note covers it.
