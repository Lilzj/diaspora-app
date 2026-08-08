// Diaspora Platform — /community/[slug]/moderators (§34, §53)
//
// Three lines by design. The screen is `<CommunityGovernanceScreen>`; this file's
// only job is the URL. See that component's header for why four copies would drift.

import { CommunityGovernanceScreen } from '@/components/community-directory/CommunityGovernanceScreen';

export default function CommunityGovernanceRoute() {
  return <CommunityGovernanceScreen kind="moderators" />;
}
