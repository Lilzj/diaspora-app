/**
 * Where points came from, in words a contributor recognises.
 *
 * The history row's label and icon for a grant's `source`. The server pays
 * under Trust's confirmed outcomes (`GuideApproved`, `UpdateVerified`,
 * `ReferralQualified`) and Creator's programme (`SignupBonus`,
 * `Milestone:<key>`, `Challenge:<key>`). An unknown source still reads as
 * words rather than a code.
 */
export function describeRewardSource(source: string): { label: string; icon: string } {
  if (source.startsWith('Milestone:')) return { label: 'Milestone reached', icon: 'trophy-outline' };
  if (source.startsWith('Challenge:')) return { label: 'Challenge completed', icon: 'flag-outline' };

  switch (source) {
    case 'GuideApproved': return { label: 'Guide approved', icon: 'checkmark-circle-outline' };
    case 'UpdateVerified': return { label: 'Update confirmed', icon: 'megaphone-outline' };
    case 'ReferralQualified': return { label: 'Referral qualified', icon: 'person-add-outline' };
    case 'SignupBonus': return { label: 'Welcome bonus', icon: 'gift-outline' };
    case 'GuidePublished': return { label: 'Guide published', icon: 'document-text-outline' };
    case 'GuideHelpfulVote': return { label: 'Marked helpful', icon: 'thumbs-up-outline' };
    case 'UpdatePublished': return { label: 'Update posted', icon: 'megaphone-outline' };
    case 'ReviewWritten': return { label: 'Review written', icon: 'star-outline' };
    case 'VerificationCompleted': return { label: 'Verification completed', icon: 'shield-checkmark-outline' };
    case 'ReferralJoined': return { label: 'Someone you invited joined', icon: 'person-add-outline' };
    case 'CommunityContribution': return { label: 'Community contribution', icon: 'people-outline' };
    case 'ModeratorAction': return { label: 'Helpful report', icon: 'flag-outline' };
    case 'SeasonalBonus': return { label: 'Seasonal bonus', icon: 'gift-outline' };
    default: return { label: source.replace(/([A-Z])/g, ' $1').trim(), icon: 'ellipse-outline' };
  }
}
