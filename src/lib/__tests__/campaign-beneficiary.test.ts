// ─────────────────────────────────────────────────────────────────────────────
// A campaign that names a person has to name which person
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// The fundraising campaign form offered three beneficiaries — "A person", "An
// organisation", "The community" — and sent `beneficiaryName` as free text with
// no `beneficiaryId` at all. The backend passes `request.BeneficiaryId` straight
// through with no default, `DonationCause` inherits it from the campaign, and
// `DonationCompletedEarningConsumer` refuses outright when it is null:
//
//     if (!string.Equals(integrationEvent.BeneficiaryType, "Member", ...)
//         || integrationEvent.BeneficiaryId is not { } beneficiaryId)
//     {
//         return Task.CompletedTask;
//     }
//
// So every "a person" campaign was created with a beneficiary nobody could be
// paid as. Donations against it complete, the money moves, and **nothing is ever
// attributed to anyone.** Same shape as a campaign objective the delivery engine
// ignores and a revenue source with no producer: an option offered that the
// platform cannot honour, where the failure is silence rather than an error.
//
// This was found looking for a producer that could put one row in
// `creator_earnings`, which had none — CREATOR-GAP-008 shipped an attribution
// layer that nothing on the platform could feed.
//
// ── Why it reads the screen ─────────────────────────────────────────────────
//
// The api client always mapped `beneficiaryId` correctly and the request type
// always carried it. Only the call site omitted it, so only the call site can
// be checked. A test of the mapper would have passed throughout.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/** The screen with comments stripped, so prose cannot stand in for code. */
function screen(): string {
  return fs
    .readFileSync(
      path.join(process.cwd(), 'src', 'app', 'community-life', 'campaign', 'create.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('the fundraising campaign form', () => {
  it('reads the screen at all', () => {
    // Guards the guard: every assertion below is a substring check, and they all
    // pass vacuously against an empty string.
    const source = screen();

    expect(source.length).toBeGreaterThan(2_000);
    expect(source).toContain('beneficiaryType');
  });

  it('sends an id, not only a label, when the beneficiary is a member', () => {
    const source = screen();

    // The label is a display string the organiser typed. The attribution runs on
    // the id, and the platform can only credit a member it can identify.
    expect(source).toContain('beneficiaryId');
    expect(source).toMatch(/beneficiaryId:\s*beneficiaryType === 'Member'/);
  });

  it('does not offer a beneficiary it cannot name', () => {
    const source = screen();

    // "A person" promised something this client cannot deliver: there is no
    // member search here, so the only member it can identify is the caller.
    // Offering to name somebody else — and then not naming them — is how the
    // silent version of this defect got shipped.
    expect(source).not.toContain("label: 'A person'");
    expect(source).toContain("{ value: 'Member', label: 'Me' }");
  });
});
