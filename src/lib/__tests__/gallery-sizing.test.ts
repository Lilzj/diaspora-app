import { readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// A photograph that is requested but never displayed, and one that is never
// requested at all, look identical on screen: an empty band.
//
// UAT-132. The housing carousel sized each slide with `className="w-screen"`
// and `style={{ width: undefined }}` on native. `w-screen` is `100vw` — a web
// unit — so on Android the slide measured zero wide, the `expo-image` inside it
// was `100%` of nothing, and **expo-image does not fetch a source for a
// zero-sized view**. The screen minted a signed URL for every photograph and
// then never asked for one of them.
//
// Nothing could see it. `tsc` is happy, the shape tests pass, the media module
// is correct, and the server is correct. It was found by reading the API's own
// request log while a device rendered the page: a `POST …/signed-url` with no
// `GET …/content` after it. The marketplace carousel, which has always used an
// explicit pixel width, fetched its photograph on the same run.
//
// So this guards the property that actually matters — a gallery slide is sized
// by a number, not by a viewport utility class.
// ─────────────────────────────────────────────────────────────────────────────

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const HOUSING = read('src', 'app', 'housing', '[id].tsx');
const MARKETPLACE = read('src', 'app', 'marketplace', '[id].tsx');

/**
 * The slice of a screen that renders its gallery slides, with comments removed.
 *
 * Stripped deliberately: the fix for UAT-132 explains itself by naming the class
 * that broke, so a raw-text assertion would match the explanation and fail on a
 * file that is correct. The rule is about code.
 */
const galleryOf = (source: string) => {
  const start = source.indexOf('.map((img');
  expect(start).toBeGreaterThan(-1);

  return source
    .slice(start, start + 1200)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
};

describe('a gallery slide is sized by a number', () => {
  it('housing does not size a slide with a viewport utility class', () => {
    // `w-screen` is the specific one that failed, and `vw` units generally do
    // not exist on Android.
    const gallery = galleryOf(HOUSING);

    expect(gallery).not.toMatch(/w-screen/);
    expect(gallery).not.toMatch(/\bvw\b/);
  });

  it('housing gives the slide a real width on native', () => {
    // `width: undefined` was the value that made the slide zero wide. The
    // window width is the number a full-bleed carousel actually wants.
    const gallery = galleryOf(HOUSING);

    expect(gallery).toMatch(/width:\s*Platform\.OS === 'web' \? \d+ : windowWidth/);
    expect(gallery).not.toMatch(/width:\s*Platform\.OS === 'web' \? \d+ : undefined/);
  });

  it('housing reads that width from the window rather than guessing', () => {
    expect(HOUSING).toMatch(/useWindowDimensions/);
  });

  it('marketplace keeps the explicit width that made it work', () => {
    // The control. This screen fetched its photograph on the same device run
    // that housing failed on, and the only difference was the sizing.
    expect(galleryOf(MARKETPLACE)).toMatch(/width:\s*Platform\.OS === 'web' \? \d+ : \d+/);
  });
});
