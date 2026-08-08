// Diaspora Platform — /community/[slug]/providers (§22, §53)
//
// Deliberately three lines. The screen is `<CommunityContentScreen>`; this file's
// only job is the URL, which is what §53's deep-link requirement is about. Eight
// copies of the same forty-line screen would drift — see that component's header.

import { CommunityContentScreen } from '@/components/community-directory/CommunityContentScreen';

export default function CommunityScopedRoute() {
  return <CommunityContentScreen domain="provider" />;
}
