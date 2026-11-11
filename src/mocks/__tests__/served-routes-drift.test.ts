// `served-routes.ts` names every operation the deployment serves.
//
// It decides which requests a development or preview build may answer from a
// mock (none of these), so a route the backend adds and this file lacks would be
// mockable again. Regenerate with `node scripts/generate-served-routes.js`.
//
// Skipped where the backend repository is not beside this one, like the other
// contract drift tests (`DIASPORA_BACKEND_PATH` overrides the location).

import { SERVED_ROUTES } from '../served-routes';
import { backendContractFile } from '../../lib/__tests__/support/backend-checkout';

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;
const { servedRoutes } = require('../../../scripts/generate-served-routes') as {
  servedRoutes: (contract: unknown) => [string, string][];
};

// The backend checkout is located by `support/backend-checkout`, which is
// also where the rule lives: not configured and absent is a skip, configured
// and absent is a failure. Eleven suites resolved this separately until
// 11 November 2026; FBL-001 is what that cost.
const CONTRACT = backendContractFile();
const describeWhenBackendPresent = CONTRACT ? describe : describe.skip;

describeWhenBackendPresent('the served-route list matches the backend contract', () => {
  it('names exactly the operations the contract publishes', () => {
    const expected = servedRoutes(JSON.parse(readFileSync(CONTRACT as string, 'utf8'))).map(
      ([verb, route]) => `${verb} ${route}`
    );
    const actual = SERVED_ROUTES.map(([verb, route]) => `${verb} ${route}`);

    // Run `node scripts/generate-served-routes.js` when this fails.
    expect(actual).toEqual(expected);
  });
});
