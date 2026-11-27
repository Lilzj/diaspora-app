/**
 * Drafts, photos and wizard progress, each from its one primitive (FARCH-007).
 *
 * The audit found the create flows writing their own: a draft in a module
 * variable typed `any`, a photograph picked and uploaded by the screen's own
 * code, a wizard's progress drawn by the wizard. Each is one thing now, and
 * these tests hold every screen to it. A file that is different on purpose is
 * named here with the reason, so the list says what is left and why.
 */
import { filesUnder } from './support/screen-files';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};

const SRC = path.join(process.cwd(), 'src');
const FILES = filesUnder(SRC).map((file) => ({
  name: path.relative(SRC, file).split(path.sep).join('/'),
  text: fs.readFileSync(file, 'utf8'),
}));

/** The named files, as found: a name that matches nothing is missing from the result. */
const named = (names: readonly string[]) => FILES.filter((file) => names.includes(file.name));

/** Every file the test catches, less those named as different on purpose. */
const caught = (test: (text: string) => boolean, allowed: readonly string[] = []) =>
  FILES.filter((file) => !allowed.includes(file.name) && test(file.text)).map((file) => file.name);

it('reads the whole source tree', () => {
  // Canary: a walk that read nothing, or stopped at the top, would pass every test below.
  expect(FILES.length).toBeGreaterThan(900);
  expect(FILES.map((file) => file.name)).toEqual(
    expect.arrayContaining(['app/(tabs)/post.tsx', 'components/forms/WizardHeader.tsx', 'lib/platform/device-drafts.ts'])
  );
});

describe('drafts', () => {
  const WIZARDS = [
    'app/(tabs)/post.tsx',
    'app/marketplace/create.tsx',
    'components/screens/housing-create/useHousingDraft.ts',
    'app/verification/diaspora.tsx',
    'app/guide/create.tsx',
    'app/update/create.tsx',
  ];

  it('are kept through useDeviceDraft by the six wizards that keep one', () => {
    const found = named(WIZARDS);
    expect(found.map((file) => file.name).sort()).toEqual([...WIZARDS].sort());
    for (const file of found) expect(file.text).toMatch(/useDeviceDraft</);
  });

  /** Held in a module variable on purpose. */
  const NOT_A_WIZARD_DRAFT: Record<string, string> = {
    'lib/platform/registration-draft.ts':
      'a password in flight between the registration screens, kept out of storage and navigation state',
  };

  it('are never held in a module variable', () => {
    // How all six held one: `let globalGuideDraft: any = null;` above the component.
    const held = (text: string) => /^let\s+\w*[Dd]raft\w*/m.test(text);
    expect(caught(held, Object.keys(NOT_A_WIZARD_DRAFT))).toEqual([]);
    // The other half: an exemption outlives its reason silently otherwise.
    for (const file of named(Object.keys(NOT_A_WIZARD_DRAFT))) expect(held(file.text)).toBe(true);
    expect(named(Object.keys(NOT_A_WIZARD_DRAFT))).toHaveLength(Object.keys(NOT_A_WIZARD_DRAFT).length);
  });

  it('reach the phone only through device-drafts', () => {
    // The verification wizard wrote `diaspora_verification_draft` itself.
    const writesItsOwn = (text: string) =>
      /\b(?:loadDeviceDraft|saveDeviceDraft)\(/.test(text) ||
      /AsyncStorage\.(?:getItem|setItem|removeItem)\(\s*['"`][^'"`]*draft/i.test(text);
    expect(caught(writesItsOwn, ['lib/platform/device-drafts.ts'])).toEqual([]);
  });

  it('are offered back by the one banner', () => {
    // The five titles the six banners had between them.
    const bannerTitle = /Unfinished [Dd]raft|Draft Detected|Recover Draft Progress/;
    expect(caught((text) => bannerTitle.test(text), ['components/forms/DraftBanner.tsx'])).toEqual([]);
  });
});

describe('photos', () => {
  const USERS = [
    'components/screens/housing-create/useHousingPhotos.ts',
    'app/marketplace/create.tsx',
    'app/marketplace/edit/[id].tsx',
    'app/housing/edit/[id].tsx',
  ];

  /** Each picks a photograph and uploads it, in a flow of its own. */
  const DIFFERENT: Record<string, string> = {
    'hooks/photo-upload.ts': 'the primitive itself',
    'components/ImagePickerInput.tsx': 'the one-photograph control, which uploads its own',
    'app/creator/profile.tsx': 'uploads and at once sets the avatar or cover, with alerts of its own',
    'app/community-life/event/edit/[id].tsx': 'uploads directly, outside the media hook, and alerts on failure',
    'app/community-life/org/edit/[id].tsx': 'uploads directly, outside the media hook, and alerts on failure',
    'app/provider/edit/[id].tsx': 'holds the photographs it picks and uploads them when the edit is saved',
  };

  it('are chosen and uploaded through usePhotoUpload by the screens that hold an upload', () => {
    const found = named(USERS);
    expect(found).toHaveLength(USERS.length);
    for (const file of found) expect(file.text).toMatch(/usePhotoUpload\(/);
  });

  it('are never picked and uploaded by a screen’s own code', () => {
    const picks = /\.launch\(|launchImageLibraryAsync|launchCameraAsync/;
    const uploads = /useMediaUpload\(|uploadDirect\(/;
    expect(caught((text) => picks.test(text) && uploads.test(text), Object.keys(DIFFERENT))).toEqual([]);
  });

  it('names only files that still pick and upload for themselves', () => {
    // The other half: an exemption outlives its reason silently otherwise.
    for (const file of named(Object.keys(DIFFERENT))) {
      expect(file.text).toMatch(/\.launch\(|launchImageLibraryAsync|launchCameraAsync/);
    }
    expect(named(Object.keys(DIFFERENT))).toHaveLength(Object.keys(DIFFERENT).length);
  });
});

describe('step wizards', () => {
  const WIZARDS = [
    'app/(tabs)/post.tsx',
    'app/housing/create.tsx',
    'app/guide/create.tsx',
    'app/marketplace/create.tsx',
    'app/job/create.tsx',
    'app/marketplace/swap-create.tsx',
    'app/verification/diaspora.tsx',
    'app/verification/identity.tsx',
    'app/community-life/event/create.tsx',
    'app/community-life/org/create.tsx',
    'app/monetization/campaigns/create.tsx',
    'app/community/onboarding.tsx',
  ];

  /**
   * Counted in steps, and not a form. Phone verification is not here either:
   * its last step has no forward action, because the server cannot yet move an
   * account to a new number, and a footer would put an inert Next on it.
   */
  const NOT_A_FORM: Record<string, string> = {
    'components/forms/WizardHeader.tsx': 'the primitive itself',
    'components/explore/CoachMark.tsx': 'a guided tour of a screen, counted in steps',
  };

  it('open with WizardHeader and end with WizardFooter', () => {
    const found = named(WIZARDS);
    expect(found).toHaveLength(WIZARDS.length);
    for (const file of found) {
      expect(file.text).toMatch(/<WizardHeader\b/);
      expect(file.text).toMatch(/<WizardFooter\b/);
    }
  });

  /** "Step 2 of 6" drawn by hand, as JSX text or in a template string, and "Upload File (3 of 5)". */
  const handDrawn = /Step \{[^}]+\} of \{|Step \$\{[^}]+\} of \$\{|\(\{\w+ \+ 1\} of \{/;

  it('say where the member is only through WizardProgress', () => {
    expect(caught((text) => handDrawn.test(text), Object.keys(NOT_A_FORM))).toEqual([]);
  });

  it('name only files that still count in steps', () => {
    // The other half: an exemption outlives its reason silently otherwise.
    for (const file of named(Object.keys(NOT_A_FORM))) expect(handDrawn.test(file.text)).toBe(true);
    expect(named(Object.keys(NOT_A_FORM))).toHaveLength(Object.keys(NOT_A_FORM).length);
  });

  it('never draw a wizard header without the wizard footer', () => {
    expect(caught((text) => /<WizardHeader\b/.test(text) && !/<WizardFooter\b/.test(text))).toEqual([]);
  });
});
