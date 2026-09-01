# Diaspora — Android Pre-Launch UAT · Security Findings

**Session 2 · 31 August 2026.** Session 1's authorization sweep (IDOR probes, the access ladder,
token scoping) returned **PASS** and is not repeated here. This document records what session 2
added — which is mostly about **configuration and secret exposure**, not about the authorization
model, which continues to hold.

Testing was application-level and non-destructive, against the approved launch environment. No
data belonging to anyone other than the two accounts created for this session was modified.

---

## SEC-201 — the launch database is reachable with credentials printable from the app machine

**Severity S2 (process) · Priority P1 · OPEN**

The full connection string for the **production** Neon database is readable in one command by
anyone holding the Fly deploy credential:

```bash
flyctl ssh console -a diaspora-api -C "printenv ConnectionStrings__DefaultConnection"
# Host=ep-…-ax0qjnrp.c-4.us-east-2.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=…
```

The same route yields `Identity__Jwt__SigningKey` and the SMS provider credentials.

This is *how Fly secrets work* — a machine must be able to read its own environment — so it is not
a vulnerability in the application. It is recorded because of what it implies operationally:

* The credential is `neondb_owner`, a **superuser**. There is no separate application role with
  restricted grants, so an application compromise is a full database compromise.
* Anyone with `flyctl` deploy access to `diaspora-api` has, transitively, unrestricted read/write
  on every member's data.
* **This session used exactly that path** to promote two accounts to `Verified` — a state the
  product deliberately reserves to the Trust Engine, whose permission is
  `PermissionAudience.Service` precisely so that no human role can grant it. The control is
  meaningful at the API boundary and absent at the database boundary.

**Recommendation before launch:** an application role with only the grants the API needs; the
owner credential reserved for migrations and held separately. Fly deploy access treated as
production-data access in whatever access review the organisation runs.

---

## SEC-202 — the one-time code is derivable from the signing key

**Severity S2 · Priority P1 · OPEN (accepted design, worth stating)**

`SecureOtpCodeGenerator` derives its HMAC key from the JWT signing key:

```csharp
_hashKey = SHA256.HashData(Encoding.UTF8.GetBytes($"otp-hmac:{jwtOptions.Value.SigningKey}"));
…
HMACSHA256.HashData(_hashKey, Encoding.UTF8.GetBytes(code.Trim()))
```

The code itself is a strong design: the class's own comment explains that an *unkeyed* digest of a
six-digit code offers no protection if the table leaks, and the key is what provides it. That
reasoning is correct.

The consequence to record is the **blast radius of the signing key**. It is a single secret that
protects both token forgery *and* one-time-code confidentiality. Anyone who obtains it can compute
the hash of any candidate code and match it against `identity.otp_challenges` — a table with 23
rows on the deployment — recovering live codes for accounts they do not control.

**This session did that**, deliberately and with the owner's credentials, to complete sign-in on a
device the sandbox SMS could not reach. It worked on the first attempt, which is the point.

**Recommendation:** derive the OTP key from a *separate* secret so that a JWT key rotation and an
OTP key rotation are independent events, and so a signing-key disclosure does not also hand over
every pending verification code.

---

## SEC-203 — listing media is owner-only, and the "signed" URL is not self-authenticating

**Severity S1 (functional) / S3 (security) · Priority P1 · OPEN**

Recorded in full as **UAT-121** in `BACKEND-FRONTEND-TRUTH-CHECK.md`. Noted here because it is an
authorization boundary drawn in the wrong place rather than a missing one:

| Actor | `POST /v1/media/{id}/signed-url` |
|---|---|
| the uploader | **200** |
| any other member | **404 `media.asset.not-found`** |

Returning **404 rather than 403** for an asset the caller may not read is the correct choice — it
does not confirm the identifier exists. The security posture here is sound. The *product* is
broken by it: an asset attached to a published listing is public content by intent, and nothing
tells the media module that.

The content endpoint additionally requires a bearer token even when a valid signature is present,
so the URL is not a capability URL at all. Whatever the fix, it should keep the 404-not-403
behaviour for genuinely private assets.

---

## SEC-204 — verbose problem details on the deployment

**Severity S4 · Priority P3 · OPEN**

Error responses in `Production` carry `traceId` and `correlationId` and a
`https://diaspora.app/errors/...` type URI. No stack traces, no connection strings, no internal
paths were observed in any response during this session. The `RegisterRequest` 400 does enumerate
the contract's required member names, which is a mild schema disclosure and entirely normal for a
public API.

**Assessment: acceptable.** Recorded so a later reviewer does not have to re-derive it.

---

## What continues to hold

Re-confirmed incidentally while driving the API as two members:

| Control | Evidence |
|---|---|
| Token scoping | Every write as A carried A's `sub`; no cross-member write succeeded |
| Cross-member media read | 404 (see SEC-203) — the boundary is enforced, if too tightly |
| Access ladder | `LimitedAccess` token carries an explicit `blockedFeatures` list; the gated screens honour it |
| Phone masking | Registration and profile responses return `+23*****0001`, never the full number |
| Password handling | No screen calls `loginWithPassword`; nothing in this session put a password on the wire after registration |
| Rate limiting | Live on registration and sign-in |
| Duplicate suppression | `409 marketplace.listing.duplicate` on an identical re-post |
| Secrets in the bundle | The packaged Hermes bundle carries the API host and no credential; `api.diaspora.app` remains absent (UAT-001 stays fixed) |

---

## Not tested

* Certificate pinning / MITM resistance
* Deep-link parameter injection beyond the routes exercised
* Local storage at rest on a rooted device (session 1 verified the keystore path is used)
* Session revocation under concurrent devices
* Any form of penetration testing against infrastructure — explicitly out of scope
