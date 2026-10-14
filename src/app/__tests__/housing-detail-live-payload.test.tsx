/**
 * The home page against a listing exactly as the server sent it (14 Oct 2026).
 * A member published "3 bedroom duplex for rent" and opening it crashed the app.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MockAdapter from 'axios-mock-adapter';
import { ThemeProvider } from '@/design-system';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

const LIVE = require('./fixtures-housing-detail-live.json');

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  Link: ({ children }: { children: unknown }) => children,
  useLocalSearchParams: () => ({ id: '01a13a4e-b829-79a1-9800-8fe91eed58d1' }),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/hooks/usePullToRefresh', () => ({
  useRefreshControl: () => undefined,
  useEffectRefresh: () => ({ nonce: 0, refreshControl: undefined }),
}));
jest.mock('@/providers/notification-provider', () => ({
  ...jest.requireActual('@/providers/notification-provider'),
  useNotification: () => ({ showAlert: jest.fn(), showToast: jest.fn() }),
}));

// eslint-disable-next-line import/first
import HousingDetail from '../housing/[id]';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('housing detail with the live payload', () => {
  let api: MockAdapter;
  beforeEach(() => {
    api = new MockAdapter(apiClient);
    api.onGet(/\/housing\/listings\/[^/]+$/).reply(200, LIVE);
    api.onAny().reply(200, { data: { items: [] } });
  });
  afterEach(() => api.restore());

  it('renders the home instead of throwing', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <HousingDetail />
          </ThemeProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getAllByText(/3 bedroom duplex for rent/).length).toBeGreaterThan(0), {
      timeout: 20000,
    });
  }, 40000);
});
