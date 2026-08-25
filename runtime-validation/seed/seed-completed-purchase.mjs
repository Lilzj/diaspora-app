// ─────────────────────────────────────────────────────────────────────────────
// A completed purchase, so the rate control has something to appear on
//
// ── Why this is needed ───────────────────────────────────────────────────────
//
// `/my-transactions` renders its empty state correctly, and that proves only the
// empty branch. A member with no reservations and a member with one take
// different paths, and this programme has already been caught by exactly that:
// the inbox crash that killed the app on launch was invisible until a
// conversation was seeded, because the walkthrough member's inbox was empty.
//
// The populated branch is also the only one that shows the "Rate this purchase"
// control — gated on `Completed`, so nothing short of a finished transaction
// exercises it.
//
// ── The chain, and what each step taught ─────────────────────────────────────
//
//   1. Ngozi registers a seller profile   POST /marketplace/sellers
//   2. and creates a listing              POST /marketplace/listings   -> draft
//   3. uploads a photograph               POST /media/uploads/direct
//      and attaches it                    POST .../media
//   4. and publishes it                   POST .../publish
//   5. Amara reserves it                  POST .../reservations
//   6. Ngozi drives it to Completed       POST /marketplace/reservations/{id}
//
// Step 3 is neither optional nor obvious: `marketplace.listing.not-publishable`
// — "Before this listing can be published it still needs at least one
// photograph." A client that collects only text discovers that at the last step.
//
// Steps 2 and 4 are separate because creating is not publishing, the same
// multi-step contract that has caught this programme on organisations, events
// and guides. Step 6 is a state machine, not a flag: `Completed` is B10's "the
// only state that turns held stock into sold stock", and it is what the review
// route gates on.
//
// Every step is re-runnable: a duplicate is treated as the previous run's work
// and reused, because a seeder that only works once stops working the moment a
// later step fails.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = process.env.RUNTIME_API_ORIGIN;
const PASSWORD = process.env.SEED_PASSWORD;

const BUYER = process.env.SEED_BUYER ?? '+2348100200001'; // Amara
const SELLER = process.env.SEED_SELLER ?? '+2348100200003'; // Ngozi

const LISTING_TITLE = 'Ankara fabric bundle';

if (!ORIGIN || !PASSWORD) {
  console.error('Set RUNTIME_API_ORIGIN and SEED_PASSWORD.');
  process.exit(2);
}

const CRLF = '\r\n';

async function call(method, path, { token, body, label } = {}) {
  const response = await fetch(`${ORIGIN}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    /* a non-JSON body is a fact about the response, not a crash here */
  }

  const ok = response.status >= 200 && response.status < 300;

  if (label) {
    console.log(
      ok
        ? `  OK       ${label}`
        : `  BLOCKED  ${label} — ${response.status} ${parsed?.code ?? ''} ${(parsed?.detail ?? '').slice(0, 88)}`
    );
  }

  return { ok, status: response.status, body: parsed, data: parsed?.data };
}

/**
 * Uploads a tiny PNG and returns its media id.
 *
 * Multipart is assembled by hand so this file needs no dependencies. The bytes
 * are the same 8x8 sample `e2e-harness.mjs` uses: the publish rule is about a
 * photograph being present, and seeding a real one would dress this listing up
 * as something it is not.
 */
async function uploadPng(token) {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAKklEQVR42mP8z8DwnwEP' +
      'YMSngIlhFIyCUTAKRsEoGAWjYBSMglEwCkYBAA0bAgFvQZ2iAAAAAElFTkSuQmCC',
    'base64'
  );

  const boundary = `----diasporaSeed${Math.random().toString(16).slice(2)}`;

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="seed.png"${CRLF}` +
        `Content-Type: image/png${CRLF}${CRLF}`
    ),
    bytes,
    Buffer.from(
      `${CRLF}--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="kind"${CRLF}${CRLF}image${CRLF}` +
        `--${boundary}--${CRLF}`
    ),
  ]);

  const response = await fetch(`${ORIGIN}/api/v1/media/uploads/direct`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    /* not JSON */
  }

  const mediaId = parsed?.data?.mediaId ?? parsed?.data?.id;

  console.log(
    mediaId
      ? '  OK       photograph uploaded'
      : `  BLOCKED  photograph upload — ${response.status} ${parsed?.code ?? ''} ${(parsed?.detail ?? '').slice(0, 70)}`
  );

  return mediaId ?? null;
}

async function signIn(phone) {
  const { data } = await call('POST', '/auth/login', {
    body: { phoneNumber: phone, password: PASSWORD },
  });
  return (data?.tokens ?? data)?.accessToken ?? null;
}

console.log(`\n  Seeding a completed purchase on ${ORIGIN}\n`);

const sellerToken = await signIn(SELLER);
const buyerToken = await signIn(BUYER);

if (!sellerToken || !buyerToken) {
  console.error('  Could not sign both members in.');
  process.exit(1);
}

// ── 1. The seller profile ────────────────────────────────────────────────────

const seller = await call('POST', '/marketplace/sellers', {
  token: sellerToken,
  label: 'seller profile',
  body: {
    displayName: 'Ngozi Textiles',
    kind: 'Individual',
    countryCode: 'GB',
    bio: 'Fabric and ready-to-wear, seeded for testing.',
  },
});

if (!seller.ok) {
  const dashboard = await call('GET', '/marketplace/sellers/me/dashboard', { token: sellerToken });
  if (!dashboard.ok) process.exit(1);
  console.log('  EXISTS   seller profile (reusing)');
}

// ── 2. A listing ─────────────────────────────────────────────────────────────

const listing = await call('POST', '/marketplace/listings', {
  token: sellerToken,
  label: 'listing',
  body: {
    title: `${LISTING_TITLE} — 6 yards`,
    description: 'Six yards of wax print cotton. Seeded so a purchase can be completed against it.',
    // From the seeded catalogue, not the client's display list — the same trap
    // that answered `event-category.not-found` on Community Life.
    categoryKey: 'clothing',
    countryCode: 'GB',
    cityName: 'London',
    listingType: 'Sale',
    condition: 'New',
    price: 45,
    currency: 'GBP',
    quantity: 3,
  },
});

let listingId = listing.data?.listingId ?? listing.data?.id;

if (!listing.ok) {
  const mineAlready = await call('GET', '/marketplace/listings/mine?limit=50', { token: sellerToken });
  const found = (mineAlready.data?.items ?? []).find((row) =>
    String(row.title ?? '').startsWith(LISTING_TITLE)
  );

  if (!found) {
    console.log('  BLOCKED  no existing listing to reuse either');
    process.exit(1);
  }

  listingId = found.listingId ?? found.id;
  console.log(`  EXISTS   listing (reusing ${String(listingId).slice(0, 8)})`);
}

// ── 3. A photograph, which publishing requires ───────────────────────────────

const mediaId = await uploadPng(sellerToken);

if (mediaId) {
  await call('POST', `/marketplace/listings/${listingId}/media`, {
    token: sellerToken,
    label: 'attach photograph',
    body: { mediaId, role: 'Cover' },
  });
}

// ── 4. Publish ───────────────────────────────────────────────────────────────
//
// The route binds a body even though every field is optional: sending none
// answers a bare 400 with no code, which says nothing about why.

await call('POST', `/marketplace/listings/${listingId}/publish`, {
  token: sellerToken,
  label: 'publish listing',
  body: { activateImmediately: true },
});

// ── 5. The buyer reserves it ─────────────────────────────────────────────────

const reservation = await call('POST', `/marketplace/listings/${listingId}/reservations`, {
  token: buyerToken,
  label: 'reservation',
  body: { quantity: 1, message: 'Seeded reservation for walkthrough testing.' },
});

const reservationId = reservation.data?.reservationId ?? reservation.data?.id;

// ── 6. Drive it to Completed ─────────────────────────────────────────────────
//
// Attempted in order, and a refusal on one is reported rather than swallowed:
// which transitions this reservation actually needs is the thing being learned.

if (reservationId) {
  for (const action of ['Accept', 'Collect', 'Complete']) {
    const moved = await call('POST', `/marketplace/reservations/${reservationId}`, {
      token: sellerToken,
      label: `transition -> ${action}`,
      body: { action },
    });

    if (moved.ok && String(moved.data?.status ?? '') === 'Completed') break;
  }
}

// ── Prove it from the buyer's side ───────────────────────────────────────────
//
// The seeder's own view is not the claim that matters. What matters is what
// `/my-transactions` reads: the buyer's list, and whether a row is in the one
// status the review route accepts.

const mine = await call('GET', '/marketplace/reservations?limit=20', { token: buyerToken });
const rows = mine.data?.items ?? [];

console.log('\n  ── what the buyer will see ──');
for (const row of rows) {
  console.log(
    `     ${String(row.status).padEnd(20)} ${row.listingTitle}` +
      (row.status === 'Completed' ? '   <- rateable' : '')
  );
}

const rateable = rows.filter((row) => row.status === 'Completed').length;
console.log(`\n  ${rows.length} reservation(s), ${rateable} rateable.\n`);
process.exit(rateable > 0 ? 0 : 1);
