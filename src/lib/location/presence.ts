// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — "Location while the app is open" (presence)
//
// The opt-in behind the `location.enteredArea` automation trigger, served
// since 21 Oct 2026:
//
//     GET  /location/me/presence        the setting, and the last area it found
//     PUT  /location/me/presence        { enabled } — off forgets the last area
//     POST /location/me/presence/ping   { latitude, longitude, accuracyMetres? }
//
// The server keeps only the last catalogue area id — no coordinates and no
// history — and the first report after switching on is a baseline, never an
// arrival. A ping while the setting is off is refused with 409
// `location.presence.not-enabled`, which this client reads as "the setting is
// off" and re-syncs rather than as a transport failure.
//
// Nothing here runs in the background. The only caller of `reportPresence` is
// the foreground loop in `presence-loop.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import { unwrapEnvelope } from '@/lib/platform-envelope';

const ROOT = '/location/me/presence';

/** What the setting does, in the words the settings screen and the builder both show. */
export const PRESENCE_EXPLANATION: readonly string[] = [
  'Off unless you switch it on.',
  'Only while Diaspora is open on your screen. Nothing is read when the app is in the background or closed.',
  'Coarse: your position is rounded and placed in a town or neighbourhood, then thrown away.',
  'No history is kept. Diaspora remembers only the last area you were in, so it can tell when you arrive somewhere new.',
  'Switching it off forgets that last area straight away.',
  'It is used only for your own automations about arriving somewhere. Nobody else is told where you are.',
];

/** The server's floor, used only when a response omits it. */
export const DEFAULT_PRESENCE_INTERVAL_SECONDS = 30;

/** `PresenceAreaResponse`. */
export interface PresenceArea {
  areaId: string;
  name: string;
  /** `Neighborhood`, `City`, `District` and so on. */
  level: string;
  countryCode: string;
}

/** `PresenceResponse`. */
export interface PresenceSetting {
  enabled: boolean;
  enabledAt: string | null;
  lastArea: PresenceArea | null;
  lastEvaluatedAt: string | null;
  minimumIntervalSeconds: number;
}

export type PresenceOutcome =
  | 'baseline'
  | 'entered'
  | 'unchanged'
  | 'noArea'
  | 'tooSoon'
  | 'tooCoarse';

/** `PresencePingResponse`. */
export interface PresencePingResult {
  evaluated: boolean;
  outcome: PresenceOutcome;
  area: PresenceArea | null;
  announced: boolean;
  /** For `tooSoon`: when a report would next be evaluated. */
  nextAcceptedAt: string | null;
}

export interface PresencePing {
  latitude: number;
  longitude: number;
  accuracyMetres?: number | null;
}

type Wire = Record<string, unknown> | null | undefined;

function toArea(wire: Wire): PresenceArea | null {
  if (!wire || typeof wire.areaId !== 'string') return null;
  return {
    areaId: wire.areaId,
    name: typeof wire.name === 'string' ? wire.name : '',
    level: typeof wire.level === 'string' ? wire.level : '',
    countryCode: typeof wire.countryCode === 'string' ? wire.countryCode : '',
  };
}

function interval(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_PRESENCE_INTERVAL_SECONDS;
}

export function toPresenceSetting(wire: Wire): PresenceSetting {
  return {
    enabled: wire?.enabled === true,
    enabledAt: typeof wire?.enabledAt === 'string' ? wire.enabledAt : null,
    lastArea: toArea(wire?.lastArea as Wire),
    lastEvaluatedAt: typeof wire?.lastEvaluatedAt === 'string' ? wire.lastEvaluatedAt : null,
    minimumIntervalSeconds: interval(wire?.minimumIntervalSeconds),
  };
}

const OUTCOMES: PresenceOutcome[] = ['baseline', 'entered', 'unchanged', 'noArea', 'tooSoon', 'tooCoarse'];

export function toPresencePingResult(wire: Wire): PresencePingResult {
  const outcome = OUTCOMES.includes(wire?.outcome as PresenceOutcome)
    ? (wire?.outcome as PresenceOutcome)
    : 'noArea';
  return {
    evaluated: wire?.evaluated === true,
    outcome,
    area: toArea(wire?.area as Wire),
    announced: wire?.announced === true,
    nextAcceptedAt: typeof wire?.nextAcceptedAt === 'string' ? wire.nextAcceptedAt : null,
  };
}

export async function fetchPresence(signal?: AbortSignal): Promise<PresenceSetting> {
  const response = await apiClient.get(ROOT, { signal });
  return toPresenceSetting(unwrapEnvelope<Wire>(response.data));
}

export async function setPresence(enabled: boolean): Promise<PresenceSetting> {
  const response = await apiClient.put(ROOT, { enabled });
  return toPresenceSetting(unwrapEnvelope<Wire>(response.data));
}

export async function reportPresence(ping: PresencePing): Promise<PresencePingResult> {
  const response = await apiClient.post(`${ROOT}/ping`, {
    latitude: ping.latitude,
    longitude: ping.longitude,
    ...(typeof ping.accuracyMetres === 'number' && Number.isFinite(ping.accuracyMetres)
      ? { accuracyMetres: ping.accuracyMetres }
      : {}),
  });
  return toPresencePingResult(unwrapEnvelope<Wire>(response.data));
}

/**
 * The server's "switched off" answer to a ping: 409 `location.presence.not-enabled`.
 *
 * Matched on the code rather than on the status alone, because a 409 that is
 * not this one is not evidence about the setting.
 */
export function isPresenceNotEnabled(cause: unknown): boolean {
  const response = (cause as { response?: { status?: number; data?: unknown } })?.response;
  if (response?.status !== 409) return false;
  const data = response.data as { code?: unknown } | string | undefined;
  if (typeof data === 'string') return data.includes('location.presence.not-enabled');
  return data?.code === 'location.presence.not-enabled';
}
