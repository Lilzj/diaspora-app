/**
 * Declining the welcome tour has to survive a cold start.
 *
 * Found on a release candidate, on a device: with the tour explicitly skipped and
 * **no reinstall in between**, two consecutive cold starts both reopened the modal
 * over the home screen. An earlier phase had seen the same thing but only on a
 * freshly installed build — where reinstalling clears app state, so "the dismissal
 * did not persist" and "the state was wiped" are indistinguishable — and recorded
 * it as an open question rather than a finding. Same install, same stored state,
 * settles it.
 *
 * The cause was one line. `WelcomeModal`'s "Skip Onboarding" called `skipTour()`
 * under a comment reading `// Mark onboarding as completed/skipped`, and `skipTour`
 * opens with `if (!activeTour) return;`. From the welcome modal no tour has started,
 * so the call returned on its first line and wrote nothing at all. Only `finishTour`
 * ever set `onboardingCompleted`, so the sole way to stop the modal was to walk the
 * entire tour to the end.
 *
 * These tests are about *persistence*, so each asserts on the storage write as well
 * as the store field. A flag that is only set in memory looks identical to a working
 * one until the process restarts, which is exactly how this survived.
 */
import { useExploreStore } from '@/store/explore';
import { exploreStorage } from '@/lib/storage/exploreStorage';

jest.mock('@/lib/storage/exploreStorage', () => ({
  exploreStorage: {
    setOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
    setCompletedTours: jest.fn().mockResolvedValue(undefined),
    getOnboardingCompleted: jest.fn().mockResolvedValue(false),
    getCompletedTours: jest.fn().mockResolvedValue([]),
  },
}));

const reset = () =>
  useExploreStore.setState({
    onboardingCompleted: false,
    activeTour: null,
    currentStepIndex: 0,
    completedTours: [],
    pausedTourId: null,
  });

beforeEach(() => {
  jest.clearAllMocks();
  reset();
});

describe('declining the welcome tour', () => {
  it('persists the decision when no tour has started — the welcome modal case', () => {
    // The precondition that broke it: the member is looking at the modal, so
    // nothing is active.
    expect(useExploreStore.getState().activeTour).toBeNull();

    useExploreStore.getState().completeOnboarding();

    expect(useExploreStore.getState().onboardingCompleted).toBe(true);
    expect(exploreStorage.setOnboardingCompleted).toHaveBeenCalledWith(true);
  });

  it('is idempotent, so a second tap does not write again', () => {
    useExploreStore.getState().completeOnboarding();
    useExploreStore.getState().completeOnboarding();

    expect(exploreStorage.setOnboardingCompleted).toHaveBeenCalledTimes(1);
  });

  it('skipping out of the welcome tour once it is running also counts as declining', () => {
    // Symmetric with `finishTour`. Someone who starts the tour and abandons it has
    // declined onboarding just as surely as someone who reached the last step, and
    // before the fix only the second of them was remembered.
    useExploreStore.setState({ activeTour: 'app', currentStepIndex: 2 });

    useExploreStore.getState().skipTour();

    expect(useExploreStore.getState().onboardingCompleted).toBe(true);
    expect(exploreStorage.setOnboardingCompleted).toHaveBeenCalledWith(true);
  });

  it('skipping some other tour does not silently complete onboarding', () => {
    // The narrow version of the same rule: `skipTour` is still about the tour it
    // was given, and only the 'app' tour is onboarding.
    useExploreStore.setState({ activeTour: 'housing', currentStepIndex: 1 });

    useExploreStore.getState().skipTour();

    expect(useExploreStore.getState().onboardingCompleted).toBe(false);
    expect(exploreStorage.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('skipTour still does nothing when nothing is running', () => {
    // Unchanged, and asserted so the fix above is not mistaken for a licence to
    // call `skipTour` from anywhere. It is the reason the welcome modal needed its
    // own action rather than a looser guard here.
    useExploreStore.getState().skipTour();

    expect(useExploreStore.getState().onboardingCompleted).toBe(false);
    expect(exploreStorage.setCompletedTours).not.toHaveBeenCalled();
  });
});
