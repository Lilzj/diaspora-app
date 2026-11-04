/**
 * "Location while the app is open" is no longer a screen (UAT, 3 Nov 2026,
 * item 5). Saving an arrival automation switches presence on, and deleting the
 * last one switches it off.
 */
import {
  ARRIVAL_TRIGGER_KEY,
  releasePresenceIfUnused,
  switchPresenceOn,
  watchesArrivals,
} from '@/lib/automation/arrival-presence';

declare const process: { cwd(): string };
const fs: {
  readFileSync(path: string, encoding: string): string;
  existsSync(path: string): boolean;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
} = require('fs');
const path: { join(...parts: string[]): string; relative(from: string, to: string): string } = require('path');

const root = path.join(process.cwd(), 'src');

function code(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function ports(enabled: boolean, permission: 'granted' | 'denied' = 'granted') {
  const calls: boolean[] = [];
  return {
    calls,
    isEnabled: async () => enabled,
    requestPermission: async () => permission,
    setEnabled: async (next: boolean) => {
      calls.push(next);
    },
  };
}

const arrival = { trigger: { key: ARRIVAL_TRIGGER_KEY } };
const other = { trigger: { key: 'event.reminder' } };

describe('saving an arrival automation', () => {
  it('asks the phone, then switches presence on', async () => {
    const p = ports(false);
    await expect(switchPresenceOn(p)).resolves.toBe('on');
    expect(p.calls).toEqual([true]);
  });

  it('changes nothing when presence is already on', async () => {
    const p = ports(true);
    await expect(switchPresenceOn(p)).resolves.toBe('already-on');
    expect(p.calls).toEqual([]);
  });

  it('switches nothing on when the phone says no', async () => {
    const p = ports(false, 'denied');
    await expect(switchPresenceOn(p)).resolves.toBe('denied');
    expect(p.calls).toEqual([]);
  });
});

describe('deleting an arrival automation', () => {
  it('switches presence off when it was the last one', async () => {
    const p = ports(true);
    await expect(releasePresenceIfUnused(p, async () => ({ items: [other], hasMore: false }))).resolves.toBe(true);
    expect(p.calls).toEqual([false]);
  });

  it('leaves it on while another arrival automation remains', async () => {
    const p = ports(true);
    await releasePresenceIfUnused(p, async () => ({ items: [other, arrival], hasMore: false }));
    expect(p.calls).toEqual([]);
  });

  it('leaves it on when it cannot see the whole list', async () => {
    const p = ports(true);
    await releasePresenceIfUnused(p, async () => ({ items: [other], hasMore: true }));
    await releasePresenceIfUnused(p, async () => {
      throw new Error('offline');
    });
    expect(p.calls).toEqual([]);
  });

  it('reads a list for arrival triggers', () => {
    expect(watchesArrivals([other])).toBe(false);
    expect(watchesArrivals([other, arrival])).toBe(true);
  });
});

describe('the screen is gone', () => {
  it('has no "Location while the app is open" screen, and nothing routes to it', () => {
    expect(fs.existsSync(path.join(root, 'app/settings/presence.tsx'))).toBe(false);

    const routing = sources(root)
      .filter((file) => code(file).includes('/settings/presence'))
      .map((file) => path.relative(root, file));
    expect(routing).toEqual([]);
  });

  it('switches presence from the builder and the delete', () => {
    expect(code(path.join(root, 'app/automation/create.tsx'))).toContain('ARRIVAL_PRIVACY_NOTE');
    expect(code(path.join(root, 'hooks/automation.ts'))).toContain('releasePresenceIfUnused');
  });
});
