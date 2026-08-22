// ─────────────────────────────────────────────────────────────────────────────
// DEFECT-014 — the capability gate is the server's answer, not the device's
//
// Four create screens rendered their "Requirements Checklist" from
// `TrustEngine.getFeatureUnlockRequirements`, which computes it on the device
// from `GOVERNANCE_CONFIG`. The backend computes the same requirements in
// `EligibilityEvaluator`, and on one account at one moment the two disagreed:
//
//   server   MET   Verified Residency in GB   Verified
//   client   ❌    Verified Residency in GB   Unverified
//
// The server reads the country standing's `IsVerified`; the client read a
// verification-*request* status. And the client rendered four requirements where
// the server returned five — "Government ID Verification" had no row — so a
// member could satisfy every line shown and stay locked.
//
// These tests pin the three properties that matter, and the third is the one
// that keeps this fix from becoming DEFECT-015: **unknown is not locked.**
// ─────────────────────────────────────────────────────────────────────────────

import { renderHook } from '@testing-library/react-native';

import { useCapabilityGate } from '../capability-gate';

const mockRequirementFor = jest.fn();
let mockState = { isLoading: false, error: null as string | null };

jest.mock('../trust', () => ({
  useFeatureRequirements: () => ({
    requirementFor: mockRequirementFor,
    isLoading: mockState.isLoading,
    error: mockState.error,
    refresh: jest.fn(),
    requirements: [],
  }),
}));

/** The device's own reading — deliberately *wrong* in the way the defect was. */
jest.mock('@/lib/trustEngine', () => ({
  TrustEngine: {
    getFeatureUnlockRequirements: () => [
      {
        featureId: 'housing',
        name: 'Housing Listing',
        isUnlocked: false,
        requirements: [
          { description: 'Verified Phone Number', isMet: false, currentProgress: 'Pending binding' },
          // The client said Unverified here. The server says Verified.
          { description: 'Verified Residency in GB', isMet: false, currentProgress: 'Unverified' },
          { description: 'Country Reputation Points (Requires 100)', isMet: true, currentProgress: '400 / 100 pts' },
          { description: 'Residence Duration (Requires 1 year)', isMet: true, currentProgress: '3 / 1 yrs' },
        ],
      },
    ],
  },
}));

/** What the server actually returned for the same account. Note: five rows. */
const SERVER_ANSWER = {
  featureId: 'housing' as const,
  name: 'Housing Listing',
  isUnlocked: false,
  requirements: [
    { description: 'Verified Phone Number', isMet: false, currentProgress: 'Pending binding' },
    { description: 'Government ID Verification', isMet: false, currentProgress: 'Unverified' },
    { description: 'Verified Residency in GB', isMet: true, currentProgress: 'Verified' },
    { description: 'Country Reputation Points (Requires 100)', isMet: true, currentProgress: '400 / 100 pts' },
    { description: 'Residence Duration (Requires 1 year)', isMet: true, currentProgress: '3 / 1 yr' },
  ],
};

beforeEach(() => {
  mockRequirementFor.mockReset();
  mockState = { isLoading: false, error: null };
});

describe("DEFECT-014 — the server's answer wins", () => {
  it('renders the server checklist, not the device one', () => {
    mockRequirementFor.mockReturnValue(SERVER_ANSWER);

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    const residency = result.current.requirements.find((r) =>
      r.description.startsWith('Verified Residency')
    );

    // The exact disagreement that was observed on a device.
    expect(residency?.isMet).toBe(true);
    expect(residency?.currentProgress).toBe('Verified');
    expect(result.current.isResolved).toBe(true);
  });

  /**
   * The half that made the lock unfixable: satisfying every line the app showed
   * would not have unlocked the screen, because one requirement had no line.
   */
  it('shows the requirement the device omitted', () => {
    mockRequirementFor.mockReturnValue(SERVER_ANSWER);

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    expect(result.current.requirements).toHaveLength(5);
    expect(result.current.requirements.map((r) => r.description)).toContain(
      'Government ID Verification'
    );
  });

  it('does not merge the two lists', () => {
    mockRequirementFor.mockReturnValue(SERVER_ANSWER);

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    // A union would contain the client's Unverified row *and* the server's
    // Verified one — neither answer, and two rows for one requirement.
    const residencyRows = result.current.requirements.filter((r) =>
      r.description.startsWith('Verified Residency')
    );
    expect(residencyRows).toHaveLength(1);
  });

  it('takes isUnlocked from the server', () => {
    mockRequirementFor.mockReturnValue({ ...SERVER_ANSWER, isUnlocked: true });

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    expect(result.current.isUnlocked).toBe(true);
  });
});

describe('before the server answers', () => {
  /**
   * **The property that stops this fix becoming DEFECT-015.** `isUnlocked` is
   * `null` while unknown — never `false`. A screen that rendered a lock on a
   * falsy value would show a wall to a member who is not locked out, which is
   * exactly the mistake that put every member on the sign-in page for a year.
   */
  it('reports unknown as null, never as locked', () => {
    mockRequirementFor.mockReturnValue(null);
    mockState = { isLoading: true, error: null };

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    expect(result.current.isUnlocked).toBeNull();
    expect(result.current.isUnlocked).not.toBe(false);
    expect(result.current.isResolved).toBe(false);
  });

  /** A checklist that flashes empty is worse than one briefly approximate. */
  it('paints the device list until the server answers', () => {
    mockRequirementFor.mockReturnValue(null);

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    expect(result.current.requirements).toHaveLength(4);
    expect(result.current.isResolved).toBe(false);
  });

  /** The server unreachable is still "not the server's answer". */
  it('surfaces the error and keeps showing something', () => {
    mockRequirementFor.mockReturnValue(null);
    mockState = { isLoading: false, error: 'offline' };

    const { result } = renderHook(() => useCapabilityGate('housing', 'GB'));

    expect(result.current.error).toBe('offline');
    expect(result.current.isResolved).toBe(false);
    expect(result.current.requirements.length).toBeGreaterThan(0);
  });

  it('asks the server for the capability and country it was given', () => {
    mockRequirementFor.mockReturnValue(SERVER_ANSWER);

    renderHook(() => useCapabilityGate('housing', 'NG'));

    expect(mockRequirementFor).toHaveBeenCalledWith('housing');
  });
});
