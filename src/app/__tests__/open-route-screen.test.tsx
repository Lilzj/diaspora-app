/**
 * `/open/<route>` forwards a link to the route inside the app, with the query
 * the link carried (FBL-005). On Android the App Link hands the link straight to
 * this screen, so it is the only thing between the link and the route: a rule
 * the screen does not call is a rule nobody gets.
 */
import { render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import OpenRouteScreen from '../open/[...route]';

describe('the /open/<route> screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replaces itself with the route the link names, query and all', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      route: ['profile', 'trust-center'],
      tab: 'documents',
    });

    render(<OpenRouteScreen />);

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/profile/trust-center?tab=documents');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('sends a link this build cannot open to the home tabs', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ route: ['nowhere'], tab: 'x' });

    render(<OpenRouteScreen />);

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
