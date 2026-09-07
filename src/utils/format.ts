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

  // **A future date is not "Just now", and it used to be.**
  //
  // The arithmetic below is `now - then`, so anything ahead of now came out
  // negative and fell into the first branch. Every deadline and expiry in the
  // application read the same way: a grant closing next month, a sign-up bonus
  // running out, a map alert that stops showing, and an earning that clears
  // after a thirty-day wait all said "Just now".
  //
  // Found on a creator's revenue screen, where an earning held for thirty days
  // said "Clears Just now" beside a balance the member could not withdraw. That
  // is the worst of the eight: the other seven understate a deadline, and this
  // one promises somebody their money.
  if (seconds < 0) {
    const ahead = -seconds;

    // Lower case, because every caller writes it into a sentence — "Clears in
    // 30 days", "This offer runs out in 3 days", "Stops showing in 2 hours".
    if (ahead < 45) return 'in a moment';
    if (ahead < 90) return 'in 1 min';

    const minutesAhead = Math.floor(ahead / 60);
    if (minutesAhead < 60) return `in ${minutesAhead} mins`;

    const hoursAhead = Math.floor(minutesAhead / 60);
    if (hoursAhead < 24) return hoursAhead === 1 ? 'in 1 hour' : `in ${hoursAhead} hours`;

    const daysAhead = Math.floor(hoursAhead / 24);
    if (daysAhead === 1) return 'tomorrow';
    if (daysAhead < 7) return `in ${daysAhead} days`;

    // Past a week, a date is more use than a count: "in 34 days" is a number
    // somebody has to convert, and the date is what they will look for.
    return `on ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }

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
