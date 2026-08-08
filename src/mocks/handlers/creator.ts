import type MockAdapter from 'axios-mock-adapter';
import { mockCreatorContent, mockCreatorDrafts, mockArchivedItems, mockTimelineEvents } from '../creator-data';
import { mockOrganizations } from '@/store/organization';

export function setupCreatorMocks(mock: MockAdapter) {
  // GET /creator/content
  mock.onGet(/\/creator\/content/).reply((config) => {
    const params = config.params || {};
    const category = params.category;
    const search = params.search ? String(params.search).toLowerCase() : '';
    const identityId = params.identityId;

    let filtered = [...mockCreatorContent];

    if (identityId && identityId !== 'all') {
      filtered = filtered.filter((item) => item.publishingIdentity.id === identityId);
    }

    if (category && category !== 'all') {
      filtered = filtered.filter((item) => item.contentType.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          item.category?.toLowerCase().includes(search) ||
          item.location?.toLowerCase().includes(search) ||
          item.tags?.some((t) => t.toLowerCase().includes(search))
      );
    }

    return [200, { data: filtered, totalCount: filtered.length }];
  });

  // GET /creator/drafts
  mock.onGet(/\/creator\/drafts/).reply(() => {
    return [200, { data: mockCreatorDrafts }];
  });

  // GET /creator/archived
  mock.onGet(/\/creator\/archived/).reply(() => {
    return [200, { data: mockArchivedItems }];
  });

  // GET /creator/organizations
  mock.onGet(/\/creator\/organizations/).reply(() => {
    return [200, { data: mockOrganizations }];
  });

  // GET /creator/timeline
  mock.onGet(/\/creator\/timeline/).reply(() => {
    return [200, { data: mockTimelineEvents }];
  });

  // POST /creator/bulk-actions
  mock.onPost(/\/creator\/bulk-actions/).reply((config) => {
    try {
      const data = JSON.parse(config.data || '{}');
      return [200, { success: true, action: data.action, affectedCount: data.itemIds?.length || 0 }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });

  // POST /creator/switch-identity
  mock.onPost(/\/creator\/switch-identity/).reply((config) => {
    try {
      const data = JSON.parse(config.data || '{}');
      return [200, { success: true, activeIdentityId: data.identityId }];
    } catch {
      return [400, { message: 'Invalid payload' }];
    }
  });
}
