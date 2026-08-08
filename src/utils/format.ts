// Diaspora Platform - Copy Formatting Utilities

/**
 * Formats a raw document type key string to a clean, user-facing readable label.
 * Example: 'StudentPermit' -> 'Student Permit', 'DriverLicense' -> "Driver's License".
 */
export function formatDocumentType(type: string | undefined | null): string {
  if (!type) return '';
  switch (type) {
    case 'Passport':
      return 'Passport';
    case 'DriverLicense':
      return "Driver's License";
    case 'NationalId':
      return 'National ID';
    case 'WorkPermit':
      return 'Work Permit';
    case 'ResidencePermit':
      return 'Residence Permit';
    case 'StudentPermit':
      return 'Student Permit';
    case 'BRP':
      return 'Biometric Residence Permit (BRP)';
    case 'Visa':
      return 'Visa';
    case 'UtilityBill':
      return 'Utility Bill / Bank Statement';
    default:
      // Fallback: split camelCase into words
      return type.replace(/([A-Z])/g, ' $1').trim();
  }
}


/**
 * Turns an ISO-8601 timestamp into the relative string the notification list
 * renders — "10 mins ago", "2 hours ago", "3 days ago".
 *
 * Added in B13. The mocked notification store held these strings directly, which
 * worked only because nothing ever aged: a server cannot know what "10 mins ago"
 * means by the time it is read, so it sends an instant and the client formats it.
 * Anything older than a week falls back to a date, because "63 days ago" is a
 * number nobody converts in their head.
 */
export function formatRelativeTime(value: string | Date | undefined | null): string {
  if (!value) return '';

  const then = value instanceof Date ? value : new Date(value);

  // Anything unparseable is passed through unchanged, deliberately. The seeded
  // notification store still holds display strings like "10 mins ago", and this
  // formatter has to be safe to drop into that list before the server is wired
  // up — returning an empty string would blank every row on the way.
  if (Number.isNaN(then.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 45) return 'Just now';
  if (seconds < 90) return '1 min ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
