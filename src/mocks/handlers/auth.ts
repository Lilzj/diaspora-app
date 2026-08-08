import type MockAdapter from 'axios-mock-adapter';

export function setupAuthMocks(mock: MockAdapter) {
  mock.onPost('/auth/otp/send').reply(200, {
    data: { expiresIn: 600, maskedPhone: '+44****0123' },
  });

  mock.onPost('/auth/otp/verify').reply((config) => {
    const { code, phoneNumber } = JSON.parse(config.data);
    if (code === '000000') {
      return [401, { title: 'Unauthorized', detail: 'Invalid code' }];
    }

    let state = 'DiasporaVerified';
    if (phoneNumber?.endsWith('666')) {
      state = 'Suspended';
    } else if (phoneNumber?.endsWith('999')) {
      state = 'VerificationRejected';
    } else if (phoneNumber?.endsWith('775')) {
      state = 'LimitedAccess';
    }

    return [
      200,
      {
        data: {
          accessToken: 'mock_access_token',
          refreshToken: 'mock_refresh_token',
          expiresIn: 900,
          user: {
            userId: 'user-123',
            fullName: 'Amara Kone',
            role: 'CommunityUser',
            isNewUser: false,
            accountState: state,
          },
        },
      },
    ];
  });
}
