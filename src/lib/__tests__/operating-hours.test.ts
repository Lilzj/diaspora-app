// ─────────────────────────────────────────────────────────────────────────────
// An organisation's opening hours
//
// `PUT /organizations/{id}/operating-hours` has been served since the module
// shipped and nothing called it. The register form carried three hardcoded rows
// — "Monday - Friday, 09:00 - 17:00" and two more — that no payload sent
// anywhere, with no editor behind them. So a member could neither state their
// hours nor correct the ones invented on their behalf, and not one organisation
// on the platform has any.
//
// The type made it look supported: `CreateOrganizationRequest.openingHours` was
// declared for a field that route has never accepted, in a free-text
// `{ day, hours }` shape the platform has never used.
// ─────────────────────────────────────────────────────────────────────────────

import { toDrafts, toRequest } from '../../components/community/OperatingHoursEditor';

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const source = (...segments: string[]) =>
  fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), ' ')
    .replace(new RegExp('//[^\\n]*', 'g'), ' ');

const api = source('lib', 'community-life-api.ts');

/** A full week of blanks, which is what an organisation with no hours starts from. */
const blank = () => toDrafts([]);

describe('what gets sent', () => {
  it('sends nothing at all for a week nobody touched', () => {
    // Not seven closed rows. A missing row means "we have not said", which the
    // platform distinguishes from being shut — and sending Closed for every day
    // would publish a claim the organisation never made.
    expect(toRequest(blank())).toEqual({ hours: [], problem: null });
  });

  it('sends only the days that were filled in', () => {
    const drafts = blank();
    drafts.Monday = { opensAt: '09:00', closesAt: '17:00', isClosed: false, note: '' };

    const { hours, problem } = toRequest(drafts);

    expect(problem).toBeNull();
    expect(hours).toEqual([
      { day: 'Monday', opensAt: '09:00', closesAt: '17:00', isClosed: false, note: null },
    ]);
  });

  it('keeps a closed day, because being shut is something you say', () => {
    const drafts = blank();
    drafts.Sunday = { opensAt: '', closesAt: '', isClosed: true, note: '' };

    expect(toRequest(drafts).hours).toEqual([
      { day: 'Sunday', opensAt: null, closesAt: null, isClosed: true, note: null },
    ]);
  });

  it('drops the times off a day marked closed', () => {
    // Somebody who fills the times and then marks the day shut means shut.
    const drafts = blank();
    drafts.Sunday = { opensAt: '09:00', closesAt: '17:00', isClosed: true, note: '' };

    expect(toRequest(drafts).hours[0]).toMatchObject({ opensAt: null, closesAt: null });
  });

  it('accepts a note with no times, which is "by arrangement"', () => {
    const drafts = blank();
    drafts.Saturday = { opensAt: '', closesAt: '', isClosed: false, note: 'By arrangement' };

    expect(toRequest(drafts).hours).toEqual([
      {
        day: 'Saturday',
        opensAt: null,
        closesAt: null,
        isClosed: false,
        note: 'By arrangement',
      },
    ]);
  });

  it('carries the public-holiday row the platform has a day for', () => {
    // `OperatingDay` rather than `System.DayOfWeek`, precisely so this exists.
    const drafts = blank();
    drafts.PublicHoliday = { opensAt: '', closesAt: '', isClosed: true, note: '' };

    expect(toRequest(drafts).hours[0].day).toBe('PublicHoliday');
  });
});

describe('the hour a member actually types', () => {
  it.each([
    ['9:00', '09:00'],
    ['9', '09:00'],
    ['930', '09:30'],
    ['0930', '09:30'],
    ['9:5', '09:05'],
  ])('reads %s as %s', (typed, sent) => {
    // `FromWireTime` uses `TryParseExact` on `HH:mm` and answers **null** on
    // anything else — without failing. So an unpadded hour is not a refusal a
    // member sees; it is an opening time that quietly vanishes.
    const drafts = blank();
    drafts.Monday = { opensAt: typed, closesAt: '23:00', isClosed: false, note: '' };

    expect(toRequest(drafts).hours[0].opensAt).toBe(sent);
  });
});

describe('what it refuses, and says which day', () => {
  it('refuses a half-open range', () => {
    const drafts = blank();
    drafts.Tuesday = { opensAt: '09:00', closesAt: '', isClosed: false, note: '' };

    const { hours, problem } = toRequest(drafts);

    expect(hours).toEqual([]);
    expect(problem).toContain('Tuesday');
  });

  it('refuses a day that closes before it opens', () => {
    // The platform refuses this too, and is right to: the organisation meant
    // one of the two and nobody can know which. Named here so the member is
    // told which of seven rows is wrong.
    const drafts = blank();
    drafts.Wednesday = { opensAt: '17:00', closesAt: '09:00', isClosed: false, note: '' };

    expect(toRequest(drafts).problem).toContain('Wednesday');
  });

  it('refuses a time that is not one', () => {
    const drafts = blank();
    drafts.Friday = { opensAt: '25:00', closesAt: '26:00', isClosed: false, note: '' };

    expect(toRequest(drafts).problem).toContain('Friday');
  });

  it('names the public-holiday row by a word a member would recognise', () => {
    const drafts = blank();
    drafts.PublicHoliday = { opensAt: '09:00', closesAt: '', isClosed: false, note: '' };

    expect(toRequest(drafts).problem).toContain('Public holidays');
  });
});

describe('reading back what the platform stored', () => {
  it('fills the week from the rows it sent', () => {
    const drafts = toDrafts([
      { day: 'Friday', opensAt: '13:00', closesAt: '14:00', isClosed: false, note: "Jumu'ah" },
      { day: 'Sunday', opensAt: null, closesAt: null, isClosed: true, note: null },
    ]);

    expect(drafts.Friday).toEqual({
      opensAt: '13:00',
      closesAt: '14:00',
      isClosed: false,
      note: "Jumu'ah",
    });
    expect(drafts.Sunday.isClosed).toBe(true);
    expect(drafts.Monday).toEqual({ opensAt: '', closesAt: '', isClosed: false, note: '' });
  });

  it('survives a day name it does not recognise', () => {
    // Dropping the row beats throwing on the profile of an organisation whose
    // data predates a rename.
    expect(() => toDrafts([{ day: 'Caturday', isClosed: false }])).not.toThrow();
  });
});

describe('the write path', () => {
  it('calls the route the platform serves', () => {
    expect(api).toMatch(/\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/operating-hours/);
    expect(api).toMatch(/'put',/);
  });

  it('pads the hour on the way out as well', () => {
    // Belt and braces: the editor normalises on blur, and a value that reached
    // the adapter unpadded would otherwise be discarded in silence.
    expect(api).toMatch(/function padWireTime/);
  });

  it('sends the revision, so a second editor does not overwrite the first', () => {
    expect(api).toMatch(/baseRevision,/);
  });

  it('no longer claims the create request accepts opening hours', () => {
    expect(api).not.toMatch(/openingHours\?: \{ day: string; hours: string \}\[\];/);
  });
});

describe('the register form', () => {
  const createScreen = source('app', 'community-life', 'org', 'create.tsx');

  it('does not invent three rows nobody typed', () => {
    // Had they ever been sent, the platform would have recorded
    // "Monday - Friday, 09:00 - 17:00" for a mosque, a food bank and a
    // students' union alike, none of whom had said so.
    expect(createScreen).not.toMatch(/Monday - Friday/);
    expect(createScreen).not.toMatch(/openingHours: \[/);
  });
});

describe('membership, which the profile called future', () => {
  // The card read "👑 Hub Membership (Future)" over an offer of "exclusive
  // meetings, announcements, and discounts at partner businesses", with a JOIN
  // button that opened an alert saying subscriptions would arrive in a later
  // release.
  //
  // Both halves were wrong, in opposite directions. Belonging to an
  // organisation is served by `POST /organizations/{id}/members` and was never
  // called. And priced membership *programmes* are real too — tiers, renewals,
  // payments, under `/communities` — with four client screens already built for
  // them. The card promised the second and offered neither.
  const orgScreen = source('app', 'community-life', 'org', '[id].tsx');
  const createScreen = source('app', 'community-life', 'org', 'create.tsx');

  it('no longer calls membership a future feature', () => {
    expect(orgScreen).not.toContain('Hub Membership (Future)');
    expect(orgScreen).not.toContain('Coming Soon');
    expect(createScreen).not.toContain('Hub Membership Programs (Future)');
  });

  it('no longer promises partner discounts', () => {
    // Diaspora has membership tiers; it has never had partner discounts, and
    // the card invented a benefit to go with a capability it denied.
    expect(orgScreen).not.toMatch(/discounts at partner businesses/);
  });

  it('calls the route that admits a member', () => {
    expect(api).toMatch(/\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/members/);
    expect(orgScreen).toMatch(/joinOrganization\(id\)/);
  });

  it('lets a member leave again', () => {
    expect(api).toMatch(/members\/me/);
    expect(orgScreen).toMatch(/leaveOrganization\(id\)/);
  });

  it('reads the policy rather than assuming one', () => {
    // `Open`, `RequestToJoin`, `InviteOnly`, `Closed` — all four arrive on
    // every organisation, and offering a Join button on a `Closed` body is a
    // control that is refused on every press.
    for (const policy of ['Open', 'RequestToJoin', 'InviteOnly', 'Closed']) {
      expect(orgScreen).toContain(`'${policy}'`);
    }
    expect(orgScreen).toMatch(/org\.acceptsMembership === false/);
  });

  it('claims nothing for a policy this build does not know', () => {
    // An unknown answer is not a yes. Inventing an affordance here is how the
    // card being replaced came to exist.
    expect(orgScreen).toMatch(/return hidden;\s*\}, \[\s*org\?\.viewerMembershipStatus/);
  });

  it('says where the reader already stands', () => {
    for (const status of ['Active', 'Requested', 'Invited']) {
      expect(orgScreen).toContain(`status === '${status}'`);
    }
  });

  it('keeps the priced programme separate from belonging', () => {
    // Two different things, and the old card conflated them.
    expect(orgScreen).toMatch(/community-life\/membership\/\$\{id\}/);
  });

  it('asks the register form the question the route actually accepts', () => {
    expect(createScreen).toMatch(/membershipPolicy: formData\.membershipPolicy/);
    expect(createScreen).not.toMatch(/hasMembershipPlans', !formData/);
  });
});

describe('the control an owner is never offered', () => {
  const orgScreen = source('app', 'community-life', 'org', '[id].tsx');

  it('does not offer Leave to an owner', () => {
    // `OrganizationMembership.Leave` refuses `MembershipRole.Owner` with
    // `OwnerCannotLeave`. A Leave button there is refused on every press —
    // the same shape as the Message button an organisation's owner used to be
    // offered for messaging themselves.
    expect(orgScreen).toMatch(
      /heading: 'You run this organisation'[\s\S]{0,200}An owner cannot leave/
    );
    // And the branch is reached from the Active case, not from `canManage`.
    expect(orgScreen).toMatch(
      /status === 'Active'[\s\S]{0,300}viewerMembershipRole === 'Owner'/
    );
  });

  it('says what to do instead', () => {
    expect(orgScreen).toMatch(/Hand ownership to another administrator first/);
  });
});
