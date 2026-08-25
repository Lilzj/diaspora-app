// ─────────────────────────────────────────────────────────────────────────────
// Does the SMS provider account actually work?
//
// ── Why this exists before anything else ─────────────────────────────────────
//
// This programme has repeatedly lost time to not separating broken tooling from
// broken product. The OTP round that cost four attempts was a `curl` consuming
// the very challenge the device was about to use; the "purchases & tenancies is
// a real bug" call was a stale tap coordinate. Both were measurement faults
// reported as product faults.
//
// So: this script talks to the provider directly. It does not go through
// `Diaspora.Api`, does not need the deployment, and does not touch the database.
// If it fails, the account is wrong. If it passes and a code still does not
// arrive through the app, the fault is ours — and that is a much smaller search.
//
// ── The trap it is built around ──────────────────────────────────────────────
//
// Africa's Talking answers **HTTP 201 for a rejected message**. Acceptance lives
// in the per-recipient `statusCode` inside the body, not in the status line. A
// probe that printed `response.ok` would report success for an invalid number,
// an unroutable destination, a rejected sender id or an empty balance. So this
// prints the recipient row and judges on that — the same rule
// `AfricasTalkingSmsGateway` applies.
//
// ── Sandbox ──────────────────────────────────────────────────────────────────
//
// A sandbox account does not deliver to a real handset. The username must be the
// literal string `sandbox`, and messages appear in Africa's Talking' own
// simulator rather than on a phone — you open the simulator, enter the
// destination number, and the message arrives there.
//
// That is not a limitation for what we need. The simulator *is* the phone for
// testing purposes: the seeded members' numbers can be opened in it and their
// one-time codes read, which is exactly the capability the hosted deployment has
// been missing.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//
//   AT_USERNAME=sandbox AT_API_KEY=atsk_... \
//   SMS_TO=+2348100200001 \
//   node runtime-validation/probe-sms-provider.mjs
//
// Twilio, for when the live wire is configured:
//
//   TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=MG... \
//   SMS_TO=+447700900123 \
//   node runtime-validation/probe-sms-provider.mjs
//
// Nothing here is written to disk and no credential is echoed back.
// ─────────────────────────────────────────────────────────────────────────────

const TO = process.env.SMS_TO;

const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;
const AT_SENDER_ID = process.env.AT_SENDER_ID;

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;

// Deliberately not a real-looking code. Somebody will run this against a live
// account one day and a plausible six digits arriving unannounced is a support
// call at best and a phishing lesson at worst.
const BODY = 'Diaspora connectivity test. No action needed.';

if (!TO) {
  console.error('Set SMS_TO to an E.164 destination, for example +2348100200001.');
  process.exit(2);
}

if (!/^\+[1-9]\d{6,15}$/.test(TO)) {
  console.error(`"${TO}" is not E.164. It must start with + and a country code.`);
  process.exit(2);
}

const haveAfricasTalking = Boolean(AT_USERNAME && AT_API_KEY);
const haveTwilio = Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

if (!haveAfricasTalking && !haveTwilio) {
  console.error(
    'No provider credentials in the environment.\n' +
      '  Africa\'s Talking: AT_USERNAME, AT_API_KEY (and optionally AT_SENDER_ID)\n' +
      '  Twilio:           TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM'
  );
  process.exit(2);
}

/** Enough of the number to recognise, not enough to be a contact record. */
function mask(number) {
  return number.length <= 6 ? '***' : `${number.slice(0, 3)}***${number.slice(-3)}`;
}

function truncate(text) {
  return text.length <= 400 ? text : `${text.slice(0, 400)}…`;
}

// ── Africa's Talking ─────────────────────────────────────────────────────────

async function probeAfricasTalking() {
  // The sandbox account only answers on the sandbox host, and only for the
  // literal username `sandbox`. Deriving the host from the username rather than
  // asking for a flag removes the mismatch that reads like a bad key.
  const isSandbox = AT_USERNAME === 'sandbox';

  const endpoint = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  console.log(`\n  Africa's Talking — ${isSandbox ? 'SANDBOX' : 'LIVE'}`);
  console.log(`  ${endpoint}`);
  console.log(`  username=${AT_USERNAME}  to=${mask(TO)}${AT_SENDER_ID ? `  from=${AT_SENDER_ID}` : ''}`);

  const form = new URLSearchParams({ username: AT_USERNAME, to: TO, message: BODY });
  if (AT_SENDER_ID) form.set('from', AT_SENDER_ID);

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apiKey: AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
  } catch (cause) {
    console.log(`\n  UNREACHABLE  ${cause.message}`);
    return false;
  }

  const text = await response.text();
  console.log(`\n  HTTP ${response.status}`);

  if (!response.ok) {
    console.log(`  ${truncate(text)}`);
    console.log(
      response.status === 401
        ? '\n  FAIL  The API key was rejected. On a sandbox account the key comes from the\n' +
            '        sandbox dashboard and the username must be the literal "sandbox".'
        : '\n  FAIL  The request was refused before any recipient was considered.'
    );
    return false;
  }

  // ── Past here the status line means nothing ────────────────────────────────
  let recipients;

  try {
    recipients = JSON.parse(text)?.SMSMessageData?.Recipients;
  } catch {
    console.log(`  ${truncate(text)}`);
    console.log('\n  FAIL  A 2xx whose body is not JSON. Nothing was necessarily sent.');
    return false;
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    console.log(`  ${truncate(text)}`);
    console.log(
      '\n  FAIL  Accepted with an empty recipient list — a 201 that delivered nothing.\n' +
        '        Most often a destination country the account does not carry.'
    );
    return false;
  }

  const [recipient] = recipients;
  console.log(`  recipient: ${JSON.stringify(recipient)}`);

  // 100 Processed, 101 Sent, 102 Queued. Everything else is a refusal that
  // arrived wearing a success status.
  const accepted = [100, 101, 102].includes(recipient.statusCode);

  console.log(
    accepted
      ? `\n  OK    ${recipient.status} (${recipient.statusCode})` +
          (recipient.messageId ? `, messageId ${recipient.messageId}` : '') +
          (isSandbox
            ? '\n        Sandbox: read it in the simulator, not on a handset.\n' +
              '        Open the Africa\'s Talking simulator and enter ' + TO + '.'
            : '')
      : `\n  FAIL  ${recipient.status} (${recipient.statusCode}) — refused inside a 201.\n` +
          '        403 InvalidPhoneNumber · 405 InsufficientBalance · 406 UserInBlacklist\n' +
          '        407 CouldNotRoute · 402 InvalidSenderId'
  );

  return accepted;
}

// ── Twilio ───────────────────────────────────────────────────────────────────

async function probeTwilio() {
  console.log('\n  Twilio');
  console.log(`  to=${mask(TO)}  from=${TWILIO_FROM}`);

  const form = new URLSearchParams({ To: TO, Body: BODY });

  // An MG… Messaging Service SID is not a From number, and sending it as one
  // fails as an unroutable sender — which reads like a problem with the
  // destination rather than with the configuration.
  form.set(TWILIO_FROM.startsWith('MG') ? 'MessagingServiceSid' : 'From', TWILIO_FROM);

  let response;

  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_SID)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      }
    );
  } catch (cause) {
    console.log(`\n  UNREACHABLE  ${cause.message}`);
    return false;
  }

  const text = await response.text();
  console.log(`\n  HTTP ${response.status}`);

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* a non-JSON body is a fact about the response */
  }

  if (response.ok) {
    console.log(`\n  OK    sid ${parsed?.sid ?? 'unknown'}, status "${parsed?.status ?? 'unknown'}"`);
    return true;
  }

  console.log(`  ${truncate(parsed ? `${parsed.message ?? ''} (code ${parsed.code ?? '?'})` : text)}`);
  console.log(
    response.status === 401
      ? '\n  FAIL  The credentials were rejected.'
      : '\n  FAIL  The message was refused. 21211 is an invalid To; 21608 is a trial\n' +
          '        account that may only send to verified numbers.'
  );

  return false;
}

// ── Run whatever is configured ───────────────────────────────────────────────

const results = [];

if (haveAfricasTalking) results.push(['Africa\'s Talking', await probeAfricasTalking()]);
if (haveTwilio) results.push(['Twilio', await probeTwilio()]);

console.log('\n  ── summary ──');
for (const [name, ok] of results) {
  console.log(`     ${ok ? 'OK     ' : 'FAILED '} ${name}`);
}
console.log();

process.exit(results.every(([, ok]) => ok) ? 0 : 1);
