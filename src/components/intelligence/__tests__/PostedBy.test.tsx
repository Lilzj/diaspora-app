// Who wrote official information (decided 7 Oct 2026): platform admins, shown as
// such, and never with an official badge.

import React from 'react';
import { render } from '@testing-library/react-native';
import { PostedBy, PLATFORM_ATTRIBUTION } from '../PostedBy';

describe('PostedBy', () => {
  it('names Diaspora, not the authority, for what a platform admin wrote', () => {
    const { getByText, queryByText } = render(
      <PostedBy postedByPlatform authorityName="Diaspora platform" isOfficial />
    );

    expect(getByText(PLATFORM_ATTRIBUTION)).toBeTruthy();
    expect(PLATFORM_ATTRIBUTION).toBe('Posted by Diaspora platform admin');
    expect(queryByText('Diaspora platform')).toBeNull();
    // Even if a server ever said otherwise, the platform is never "official".
    expect(queryByText(/OFFICIAL/)).toBeNull();
  });

  it('names a confirmed issuing body, with its badge', () => {
    const { getByText } = render(
      <PostedBy authorityName="Passport and Immigration Office" isOfficial />
    );

    expect(getByText('Passport and Immigration Office')).toBeTruthy();
    expect(getByText(/OFFICIAL/)).toBeTruthy();
  });
});
