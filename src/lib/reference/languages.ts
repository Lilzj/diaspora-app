// ─────────────────────────────────────────────────────────────────────────────
// The languages the app offers — reference data, not a fixture (FBL-002).
//
// Lived in `src/mocks/data.ts` as `mockLanguages` until 18 Nov 2026 and was
// read by three production surfaces: the sign-up language choice, the settings
// summary row and the language sheet. Nothing about it was ever a mock — it is
// the client's own list of the languages it has strings for, which is a client
// fact rather than a server one, and the only thing wrong with it was where it
// was filed and what the name implied.
//
// Renamed on the move. `mockLanguages` in a production screen is the confusion
// FBL-002 is about, and the call sites were being edited anyway.
// ─────────────────────────────────────────────────────────────────────────────

export interface SupportedLanguage {
  code: string;
  name: string;
}

export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية' },
  { code: 'pt', name: 'Português' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ha', name: 'Hausa' },
  { code: 'yo', name: 'Yorùbá' },
  { code: 'ig', name: 'Igbo' },
  { code: 'am', name: 'አማርኛ' },
];
