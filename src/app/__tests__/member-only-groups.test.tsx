/**
 * Which route groups say they are for members, and that each one means it
 * (FARCH-006).
 *
 * Route protection was one negative condition in the root layout: anything not
 * in `(auth)` sends a caller with no session to sign in. That protects a new
 * group by default, but no group could say so of itself, and the redirect ran
 * after a render. Every layout now makes the choice on the record: it is one of
 * the member-only groups below, which render nothing of themselves without a
 * member, or the root layout covers it alone, for the reason given.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { useAuthStore } from '@/store/auth';

// Node's globals declared locally, as no-fabricated-values does: adding "node"
// to the tsconfig `types` field breaks `__DEV__` in other suites.
declare const __dirname: string;
declare const require: (id: string) => unknown;

const fs = require('fs') as {
  readdirSync: (p: string, options: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
};

jest.mock('expo-router', () => {
  const mockReact = jest.requireActual('react');
  const { Text: MockText } = jest.requireActual('react-native');
  const MockStack = Object.assign(() => mockReact.createElement(MockText, null, 'the group screens'), {
    Screen: () => null,
  });

  return { Stack: MockStack, router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } };
});

/** Every member-only group, and what a frame of it would show the wrong person. */
const MEMBER_ONLY: Record<string, string> = {
  wallet: 'balances, payments, payouts and receipts',
  monetization: "a member's plans, invoices and campaigns",
  analytics: 'owner dashboards',
  creator: "a creator's earnings and tools",
  automation: "a member's automations and their runs",
  contributor: 'the contributor surface',
  moderation: 'the moderation queue',
  employer: 'employer registration and tools',
  conversation: "a member's messages",
  'settings/integrations': "a member's connected accounts",
};

/** Every layout the root layout covers alone, and why it is not member-only. */
const ROOT_COVERED: Record<string, string> = {
  '': 'the root layout itself, whose redirects are what every group falls back to',
  '(auth)': 'sign-in and registration, which are for callers with no session',
  '(tabs)': 'the tabs, which a held member browses after choosing to explore',
  '(tabs)/knowledge': 'guides, browsed from the tabs',
  community: 'community pages, browsed while exploring',
  'community/[slug]': 'one community, restored from a deep link and browsed while exploring',
  map: 'the map over the discovery surfaces, browsed while exploring',
};

/** `src/app`, from `src/app/__tests__`. */
const APP_ROOT = path.join(__dirname, '..');

function* layoutFiles(directory: string): Generator<string> {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') yield* layoutFiles(path.join(directory, entry.name));
    } else if (entry.name === '_layout.tsx') {
      yield path.join(directory, entry.name);
    }
  }
}

/** The group a layout file belongs to, as the tables above name it. */
function groupOf(file: string): string {
  return path.relative(APP_ROOT, file).split(path.sep).slice(0, -1).join('/');
}

function signedOut() {
  useAuthStore.setState({ status: 'unauthenticated', isAuthenticated: false, isExploringLimited: false, user: null } as never);
}

function signedIn() {
  useAuthStore.setState({
    status: 'authenticated',
    isAuthenticated: true,
    isExploringLimited: false,
    user: {
      userId: '01a05770-33f2-7600-8000-0000000000da',
      fullName: 'Ama Owusu',
      role: 'Member',
      accountState: 'DiasporaVerified',
    },
  } as never);
}

function renderLayout(group: string) {
  const Layout = (require(`@/app/${group}/_layout`) as { default: React.ComponentType }).default;

  return render(<Layout />);
}

it('makes every layout choose: member-only, or covered by the root layout for a stated reason', () => {
  const layouts = [...layoutFiles(APP_ROOT)];
  const guarded = layouts.filter((file) => /<RequireMember\b/.test(fs.readFileSync(file, 'utf8'))).map(groupOf);
  const unguarded = layouts.map(groupOf).filter((group) => !guarded.includes(group));

  // Canary: a scan that stopped finding layouts would agree with any table.
  expect(layouts.length).toBeGreaterThanOrEqual(17);

  expect(guarded.sort()).toEqual(Object.keys(MEMBER_ONLY).sort());
  expect(unguarded.sort()).toEqual(Object.keys(ROOT_COVERED).sort());
});

it('names the eight groups the audit named among the member-only ones', () => {
  for (const group of ['wallet', 'monetization', 'analytics', 'creator', 'automation', 'contributor', 'moderation', 'employer']) {
    expect(MEMBER_ONLY).toHaveProperty([group]);
  }
});

describe.each(Object.keys(MEMBER_ONLY))('the %s group', (group) => {
  it('draws nothing of itself for a caller with no session', () => {
    signedOut();
    renderLayout(group);

    expect(screen.queryByText('the group screens')).toBeNull();
    expect(screen.getByTestId('member-route-splash')).toBeTruthy();
  });

  it('shows its screens to a member in good standing', () => {
    signedIn();
    renderLayout(group);

    expect(screen.getByText('the group screens')).toBeTruthy();
  });
});
