// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the mocked XP rules against the server's — 27 Oct 2026
//
// ── The defect this exists for ──────────────────────────────────────────────
//
// FE-10. The reputation screen's "How to earn XP" is built from
// `GET /trust/reputation/rules`, and every test of it reads the mock in
// `mocks/handlers/trust.ts`. That mock was written when the server priced
// sixteen rules. The server now prices twenty-seven: a referral, a course, the
// eight activities REP-14 added, and an upheld report, which the mock's own
// comment said nothing pays. It also carried no `creditPoints`, so no test
// could see which outcomes pay points as well as XP. Every test passed against
// a catalogue the server stopped serving a version ago.
//
// ── Reading the backend rather than a fixture ───────────────────────────────
//
// Same mechanism as the sibling drift checks: the backend checkout is found
// via `DIASPORA_BACKEND_PATH`, or beside this repository, and the suite skips
// when it is absent so CI on this repository alone stays green. It reads
// `DefaultReputationRules.All` straight out of `ReputationScoring.cs`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { resetTrustMocks, setupTrustMocks } from '@/mocks/handlers/trust';

// Required locally with narrow signatures, exactly as the sibling drift checks
// do: `@types/node` in `types` would shadow the ambient `__DEV__`.
declare const __dirname: string;
const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const existsSync: (path: string) => boolean = require('fs').existsSync;
const join: (...parts: string[]) => string = require('path').join;

function resolveBackendSourceRoot(): string | null {
  const configured = process.env.DIASPORA_BACKEND_PATH;
  const candidate =
    configured !== undefined && configured !== ''
      ? configured
      : join(__dirname, '..', '..', '..', '..', 'diaspora-backend');

  const sourceRoot = join(candidate, 'src');
  return existsSync(sourceRoot) ? sourceRoot : null;
}

const BACKEND_SOURCE_ROOT = resolveBackendSourceRoot();

const RULES_FILE = BACKEND_SOURCE_ROOT
  ? join(BACKEND_SOURCE_ROOT, 'Diaspora.Modules.Trust', 'Domain', 'ReputationScoring.cs')
  : null;

const describeWhenBackendPresent =
  RULES_FILE && existsSync(RULES_FILE) ? describe : describe.skip;

interface RuleShape {
  actionType: string;
  label: string | null;
  dimension: string;
  points: number;
  maxOccurrences: number | null;
  cooldownHours: number | null;
  dailyCap: number | null;
  isCountryScoped: boolean;
  creditPoints: number | null;
}

/**
 * Every rule in `DefaultReputationRules.All` that the rules route serves: the
 * active ones something pays (`IsActive` and `IsAwarded` both default true).
 */
function serverRules(source: string): RuleShape[] {
  const start = source.indexOf('public static IReadOnlyList<ReputationRule> All');
  if (start < 0) throw new Error('DefaultReputationRules.All was not found in ReputationScoring.cs');

  // Comments carry prose that can look like an assignment; only code counts.
  const body = source.slice(start).replace(/\/\/[^\n]*/g, '');

  return body
    .split(/new\(\)\s*\{/)
    .slice(1)
    .map((block) => block.slice(0, block.indexOf('}')))
    .map((block) => {
      const text = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(block)?.[1] ?? null;
      const int = (name: string) => {
        const match = new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)`).exec(block);
        return match ? Number(match[1]) : null;
      };
      const bool = (name: string, fallback: boolean) => {
        const match = new RegExp(`\\b${name}\\s*=\\s*(true|false)`).exec(block);
        return match ? match[1] === 'true' : fallback;
      };

      return {
        actionType: /\bActionType\s*=\s*ReputationActions\.(\w+)/.exec(block)?.[1] ?? '',
        label: text('Label'),
        dimension: /\bDimension\s*=\s*ReputationDimension\.(\w+)/.exec(block)?.[1] ?? '',
        points: int('Points') ?? NaN,
        maxOccurrences: int('MaxOccurrences'),
        cooldownHours: int('CooldownHours'),
        dailyCap: int('DailyCap'),
        isCountryScoped: bool('IsCountryScoped', false),
        creditPoints: int('CreditPoints'),
        active: bool('IsActive', true) && bool('IsAwarded', true),
      };
    })
    .filter((rule) => rule.actionType !== '' && rule.active)
    .map(({ active: _active, ...rule }) => rule);
}

function asShape(rule: Record<string, unknown>): RuleShape {
  return {
    actionType: rule.actionType as string,
    label: (rule.label as string | undefined) ?? null,
    dimension: rule.dimension as string,
    points: rule.points as number,
    maxOccurrences: (rule.maxOccurrences as number | null | undefined) ?? null,
    cooldownHours: (rule.cooldownHours as number | null | undefined) ?? null,
    dailyCap: (rule.dailyCap as number | null | undefined) ?? null,
    isCountryScoped: rule.isCountryScoped as boolean,
    creditPoints: (rule.creditPoints as number | null | undefined) ?? null,
  };
}

const byAction = (a: RuleShape, b: RuleShape) => a.actionType.localeCompare(b.actionType);

describeWhenBackendPresent('the mocked XP rules are the rules the server pays', () => {
  // Read in `beforeAll`, never in the describe body: jest runs a skipped
  // describe's body to collect its tests.
  let source = '';
  let mock: MockAdapter;

  beforeAll(() => {
    source = readFileSync(RULES_FILE as string, 'utf8');
    mock = new MockAdapter(apiClient, { delayResponse: 0 });
    setupTrustMocks(mock);
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    resetTrustMocks();
  });

  it('reads a catalogue from the server source at all', () => {
    // A parser that found nothing would make the comparison below vacuous.
    expect(serverRules(source).length).toBeGreaterThan(20);
  });

  it('lists every rule the server serves, with the same value, caps and points', async () => {
    const response = await apiClient.get('/trust/reputation/rules');
    const mocked = (response.data.data as Record<string, unknown>[]).map(asShape).sort(byAction);

    expect(mocked).toEqual(serverRules(source).sort(byAction));
  });
});
