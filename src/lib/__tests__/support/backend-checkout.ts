/**
 * Where the backend checkout is — and what its absence means.
 *
 * Eleven suites in this repository read the `diaspora-backend` checkout: the
 * emitted OpenAPI contract, and C# sources for enums, options and rule classes
 * the client mirrors. Each one resolved the location itself, in four different
 * spellings (`describeWhenBackendPresent`, `describeAgainstBackend`,
 * `describeAgainstContract`, `describeWithBackend`), and one of them used
 * `process.cwd()` where the rest used `__dirname`. Their comments said the
 * resolution was "deliberately identical"; it was deliberately similar.
 *
 * ## The distinction this exists to make
 *
 * **Not configured and absent is a skip. Configured and absent is a failure.**
 *
 * A developer working on the client alone has no sibling checkout and should
 * not be made to care — that is a skip, and it is the behaviour these suites
 * have always had.
 *
 * A job that *names* a path which does not resolve is misconfigured, and the
 * old code returned `null` for that too: the same answer as "no checkout here",
 * meaning a broken CI checkout skipped eleven suites and reported green. The
 * suites' own comments already said this was the hazard — "a path that was
 * named and does not resolve is a misconfigured job, and quietly reading a
 * different directory than the one the operator named is how a green tick ends
 * up describing the wrong backend" — and then returned `null` anyway. This
 * module is that sentence, implemented.
 *
 * That matters most where it is least visible. These suites are the platform's
 * only automated check that the two repositories agree; the pre-launch audit
 * found all eleven skipping in CI (FBL-001) precisely because a skip is quiet.
 * A cross-repository check that does not run has not passed.
 *
 * ## Why `require` rather than `import`
 *
 * The same reason the suites do it: adding `"node"` to `types` in
 * `tsconfig.json` compiles these imports and breaks twenty other assertions,
 * because `@types/node` declares its own `globalThis` and shadows the ambient
 * React Native declaration that gives the boundary suites `__DEV__`.
 */

declare const __dirname: string;

const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

/**
 * `src/` rather than the repository root, as the marker for "this is a
 * checkout". A bare directory of the right name is not one, and parsing an
 * empty tree yields "the backend serves no routes" — the false negative these
 * suites exist to prevent.
 */
function isCheckout(candidate: string): boolean {
  return existsSync(join(candidate, 'src'));
}

/** `<client>/src/lib/__tests__/support` → five levels up holds both repositories. */
function siblingCheckout(): string {
  return join(__dirname, '..', '..', '..', '..', '..', 'diaspora-backend');
}

/**
 * The backend repository root, or `null` when there is honestly none to read.
 *
 * @throws when `DIASPORA_BACKEND_PATH` names a path that is not a checkout.
 */
export function backendRepositoryRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;

  if (configured !== undefined && configured !== '') {
    if (isCheckout(configured)) {
      return configured;
    }

    throw new Error(
      `DIASPORA_BACKEND_PATH is set to "${configured}" and there is no backend checkout there ` +
        '(no "src" directory inside it). A named path that does not resolve is a misconfigured ' +
        'job, not a developer without the sibling repository, so this fails rather than skipping. ' +
        'Skipping here is how eleven cross-repository suites came to report green without running ' +
        '— see FBL-001. Unset the variable to fall back to the sibling checkout.',
    );
  }

  return isCheckout(siblingCheckout()) ? siblingCheckout() : null;
}

/**
 * `<backend>/src`, the root of the C# sources. `null` where there is no checkout.
 */
export function backendSourceRoot(): string | null {
  const root = backendRepositoryRoot();

  return root === null ? null : join(root, 'src');
}

/**
 * The emitted OpenAPI document. `null` where there is no checkout.
 *
 * @throws when a checkout exists but the contract does not. The file is
 * committed and a CI gate on the backend keeps it current, so its absence from
 * a real checkout is a broken tree rather than a reason to stop checking.
 */
export function backendContractFile(): string | null {
  const root = backendRepositoryRoot();

  if (root === null) {
    return null;
  }

  const file = join(root, 'contracts', 'Diaspora.Api.json');

  if (!existsSync(file)) {
    throw new Error(
      `The backend checkout at "${root}" has no contracts/Diaspora.Api.json. That file is ` +
        'committed and the backend fails its own CI when it is stale, so a checkout without it ' +
        'is broken rather than absent, and skipping would hide it.',
    );
  }

  return file;
}
