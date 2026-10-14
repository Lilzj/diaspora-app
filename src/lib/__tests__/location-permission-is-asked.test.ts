// Tapping Allow, or "Use GPS Location", must ASK Android (14 Oct 2026).
//
// `detectLocation` called `detectCountry()` with no `prompt`, which only checks
// the permission. So the first-launch Allow found none, recorded a refusal, and
// Android's dialog never appeared: the app had no location permission at all,
// and Android's App info read "No permissions allowed".

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...parts), 'utf8');

describe('asking for location', () => {
  it('passes the request through to Android', () => {
    expect(read('store', 'location.ts')).toMatch(/detectCountry\(\{ prompt: options\.prompt === true \}\)/);
  });

  it('asks from both buttons a member presses', () => {
    expect(read('components', 'StartupLocationPrompt.tsx')).toContain('detectLocation({ prompt: true })');
    expect(read('components', 'GlobalLocationSelector.tsx')).toContain('store.detectLocation({ prompt: true })');
  });
});
