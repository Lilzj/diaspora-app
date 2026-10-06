import type MockAdapter from 'axios-mock-adapter';
import { mockTutorials, mockReleaseAnnouncements } from '../explore-data';
import { platformProblem } from '../platform-problem';

export function setupExploreMocks(mock: MockAdapter) {
  // GET /explore/tutorials
  // Supports filtering by category and fuzzy query matching
  mock.onGet('/explore/tutorials').reply((config) => {
    const { category, query } = config.params || {};
    let filtered = [...mockTutorials];

    if (category) {
      filtered = filtered.filter(t => t.categoryId === category);
    }

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        t => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
      );
    }

    return [
      200,
      {
        data: filtered,
      },
    ];
  });

  // GET /explore/tutorials/:id
  mock.onGet(/\/explore\/tutorials\/\w+/).reply((config) => {
    const url = config.url || '';
    const parts = url.split('/');
    const id = parts[parts.length - 1];
    
    // Clean query parameters from ID if any
    const cleanId = id.split('?')[0];

    const tutorial = mockTutorials.find(t => t.id === cleanId);

    if (tutorial) {
      return [
        200,
        {
          data: tutorial,
        },
      ];
    } else {
      return platformProblem(404, `Tutorial with ID "${cleanId}" not found.`);
    }
  });

  // GET /explore/announcements
  mock.onGet('/explore/announcements').reply(() => {
    return [
      200,
      {
        data: mockReleaseAnnouncements,
      },
    ];
  });

  // GET /explore/recommendations
  // Generates smart recommended tutorials based on user context
  mock.onGet('/explore/recommendations').reply((config) => {
    const { isVerified, helpfulVotesCount } = config.params || {};

    const recommendations: typeof mockTutorials = [];

    // Rule 1: If not verified, highly recommend Residency Verification
    if (isVerified === 'false' || !isVerified) {
      const v = mockTutorials.find(t => t.id === 'tut-1');
      if (v) recommendations.push(v);
    }

    // Rule 2: If user has votes but hasn't published guides, recommend guide publishing
    const creatorGuide = mockTutorials.find(t => t.id === 'tut-2');
    if (creatorGuide) recommendations.push(creatorGuide);

    // Rule 3: Recommend general safety
    const safety = mockTutorials.find(t => t.id === 'tut-3');
    if (safety) recommendations.push(safety);

    // Add others up to 3 items
    mockTutorials.forEach((t) => {
      if (recommendations.length < 4 && !recommendations.find(r => r.id === t.id)) {
        recommendations.push(t);
      }
    });

    return [
      200,
      {
        data: recommendations,
      },
    ];
  });

  // POST /explore/progress/complete
  mock.onPost('/explore/progress/complete').reply((config) => {
    const { tutorialId } = JSON.parse(config.data || '{}');
    return [
      200,
      {
        success: true,
        tutorialId,
        message: 'Completion recorded on mock server.',
        timestamp: new Date().toISOString(),
      },
    ];
  });
}
