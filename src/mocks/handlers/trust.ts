import type MockAdapter from 'axios-mock-adapter';

export function setupTrustMocks(mock: MockAdapter) {
  // GET /trust/profile
  mock.onGet('/trust/profile').reply((config) => {
    return [
      200,
      {
        data: {
          healthStatus: {
            health: 'Good',
            violationsCount: 0,
            warningsCount: 0,
            activeAppealsCount: 0,
            spamReportsCount: 0,
            reasons: [],
          },
          riskScore: 15,
          verifications: {
            Phone: 'Approved',
            Email: 'Pending',
            Identity: 'Pending',
            Country: 'Approved',
          },
        },
      },
    ];
  });

  // POST /trust/verify/identity
  mock.onPost('/trust/verify/identity').reply((config) => {
    const { docType, country } = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          status: 'Pending',
          verificationId: `verify-${Date.now()}`,
          message: 'Stripe identity document upload received. Review pending.',
          docType,
          country,
        },
      },
    ];
  });

  // POST /trust/appeals
  mock.onPost('/trust/appeals').reply((config) => {
    const { type, targetId, reason } = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          appealId: `appeal-${Date.now()}`,
          type,
          targetId,
          reason,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        },
      },
    ];
  });

  // GET /trust/audit
  mock.onGet('/trust/audit').reply((config) => {
    return [
      200,
      {
        data: [
          { eventId: 'al-1', timestamp: new Date().toISOString(), action: 'Device Login', details: 'Successful login from iPhone 15 Pro (London, UK)', ipAddress: '82.165.97.12' },
        ],
      },
    ];
  });

  // POST /trust/privacy
  mock.onPost('/trust/privacy').reply((config) => {
    const settings = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          updated: true,
          settings,
        },
      },
    ];
  });

  // POST /trust/community-voting
  mock.onPost('/trust/community-voting').reply((config) => {
    const { updateId } = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          success: true,
          updateId,
          message: 'Verification vote logged successfully.',
        },
      },
    ];
  });

  // POST /trust/verify/diaspora
  mock.onPost('/trust/verify/diaspora').reply((config) => {
    const data = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          verificationId: `diaspora-verify-${Date.now()}`,
          status: 'Pending',
          request: data,
          createdAt: new Date().toISOString(),
        },
      },
    ];
  });

  // POST /trust/verify/diaspora/appeal
  mock.onPost('/trust/verify/diaspora/appeal').reply((config) => {
    const data = JSON.parse(config.data || '{}');
    return [
      200,
      {
        data: {
          appealId: `diaspora-appeal-${Date.now()}`,
          status: 'Pending',
          request: data,
          createdAt: new Date().toISOString(),
        },
      },
    ];
  });
}
