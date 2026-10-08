// The Home card for official notices (8 Oct 2026). A published notice for
// Mauritius was unreachable from anywhere a member would look.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { OfficialNoticesBanner } from '@/components/intelligence/OfficialNoticesBanner';
import { useOfficialNotices } from '@/hooks/country-intelligence';

jest.mock('@/hooks/country-intelligence', () => ({ useOfficialNotices: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedNotices = useOfficialNotices as jest.Mock;

const notice = {
  officialNoticeId: 'n-1',
  title: 'International Passport Renewal',
  summary: 'You can now renew your international passport from Mauritius',
  postedByPlatform: true,
  authorityName: 'Diaspora platform',
  isOfficial: false,
};

beforeEach(() => {
  mockedNotices.mockReset();
  (router.push as jest.Mock).mockReset();
});

describe('OfficialNoticesBanner', () => {
  it('asks only for notices in force, for the member’s country', () => {
    mockedNotices.mockReturnValue({ notices: [] });

    render(<OfficialNoticesBanner countryCode="mu" countryName="Mauritius" />);

    // The notices route defaults activeOnly to false (an editor needs drafts),
    // so Home must ask explicitly or it would show expired notices.
    expect(mockedNotices).toHaveBeenCalledWith(
      expect.objectContaining({ countryCode: 'MU', activeOnly: true }),
      { enabled: true },
    );
  });

  it('shows nothing when there is nothing in force', () => {
    mockedNotices.mockReturnValue({ notices: [] });

    render(<OfficialNoticesBanner countryCode="MU" countryName="Mauritius" />);

    expect(screen.queryByText(/Official notices/)).toBeNull();
  });

  it('shows the notice, who posted it, and opens it', () => {
    mockedNotices.mockReturnValue({ notices: [notice] });

    render(<OfficialNoticesBanner countryCode="MU" countryName="Mauritius" />);

    expect(screen.getByText(/Official notices · Mauritius/)).toBeTruthy();
    expect(screen.getByText(/Posted by Diaspora platform admin/)).toBeTruthy();

    fireEvent.press(screen.getByText('International Passport Renewal'));
    expect(router.push).toHaveBeenCalledWith('/intelligence/notice/n-1');

    fireEvent.press(screen.getByText('See all'));
    expect(router.push).toHaveBeenCalledWith('/intelligence/notices?country=MU');
  });
});
