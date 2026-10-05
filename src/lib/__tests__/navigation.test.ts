import { router } from 'expo-router';
import { backOr } from '../navigation';

const mocked = router as jest.Mocked<typeof router>;

beforeEach(() => jest.clearAllMocks());

describe('backOr', () => {
  it('goes back when there is a screen to go back to', () => {
    mocked.canGoBack.mockReturnValue(true);

    backOr('/community-life/events');

    expect(mocked.back).toHaveBeenCalledTimes(1);
    expect(mocked.replace).not.toHaveBeenCalled();
  });

  it('replaces with the fallback on a screen opened from a link', () => {
    // The screen is alone in its stack, where `back()` does nothing.
    mocked.canGoBack.mockReturnValue(false);

    backOr('/community-life/events');

    expect(mocked.back).not.toHaveBeenCalled();
    expect(mocked.replace).toHaveBeenCalledWith('/community-life/events');
  });
});
