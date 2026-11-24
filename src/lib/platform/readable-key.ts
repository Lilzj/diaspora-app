/** "community-association" → "Community association". A key, read as words. */
export function readableKey(key: string | null | undefined): string {
  const words = (key ?? '').replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
