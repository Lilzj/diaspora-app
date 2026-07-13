import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { setupAuthMocks } from './handlers/auth';
import { setupDiscoveryMocks } from './handlers/discovery';
import { setupJobsMocks } from './handlers/jobs';

// Create the mock adapter instance
export const mockApi = new MockAdapter(apiClient, { delayResponse: 800 });

export function initMocks() {
  console.log('[MOCK] Initializing API mocks...');
  setupAuthMocks(mockApi);
  setupDiscoveryMocks(mockApi);
  setupJobsMocks(mockApi);
  
  // Pass through any unhandled requests
  mockApi.onAny().passThrough();
}
