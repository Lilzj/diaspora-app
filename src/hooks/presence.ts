// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — "Location while the app is open": the setting and its loop
//
// `usePresence` / `useSetPresence` read and switch the server's setting. It has
// no screen of its own since 4 Nov 2026: saving an arrival automation switches
// it on (`useSwitchPresenceOn`) and deleting the last one switches it off.
// `usePresenceReporter` drives `PresenceLoop` from AppState, mounted once at the
// root; it does nothing for a signed-out member or while the setting is off.
// See `lib/location/presence-loop.ts` for how the reporting is bounded.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type * as ExpoLocation from 'expo-location';

import { useAuthStore } from '@/store/auth';
import { switchPresenceOn, type ArrivalPresencePorts } from '@/lib/automation/arrival-presence';
import {
  fetchPresence,
  reportPresence,
  setPresence,
  type PresenceSetting,
} from '@/lib/location/presence';
import { PresenceLoop, type PresencePermission } from '@/lib/location/presence-loop';

export const presenceKeys = {
  setting: () => ['location', 'presence'] as const,
};

export function usePresence() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: presenceKeys.setting(),
    queryFn: ({ signal }) => fetchPresence(signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    presence: query.data ?? null,
    /** True only when the server has said so. Unanswered is not "on". */
    isEnabled: query.data?.enabled === true,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useSetPresence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) => setPresence(enabled),
    onSuccess: (setting: PresenceSetting) => {
      queryClient.setQueryData(presenceKeys.setting(), setting);
    },
  });
}

/**
 * `expo-location`, required on first use rather than at import.
 *
 * The automation hooks import this file for `usePresence`, and a static import
 * would load the native module into every screen and test that touches them.
 * Null where the module cannot load, which reads as "no permission" — so no
 * ping is ever sent from a build or harness without it.
 */
let cachedLocation: typeof ExpoLocation | null | undefined;
function expoLocation(): typeof ExpoLocation | null {
  if (cachedLocation === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      cachedLocation = require('expo-location') as typeof ExpoLocation;
    } catch {
      cachedLocation = null;
    }
  }
  return cachedLocation;
}

/** The foreground grant, read without ever prompting. */
export async function readForegroundPermission(): Promise<PresencePermission> {
  const Location = expoLocation();
  if (!Location) return 'undetermined';
  const response = await Location.getForegroundPermissionsAsync();
  if (response.granted) return 'granted';
  return response.status === 'denied' ? 'denied' : 'undetermined';
}

/** Asks for the foreground grant. Saving an arrival automation calls this. */
export async function requestForegroundPermission(): Promise<PresencePermission> {
  const Location = expoLocation();
  if (!Location) return 'undetermined';
  const response = await Location.requestForegroundPermissionsAsync();
  if (response.granted) return 'granted';
  return response.status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * The setting's reads and writes, keeping the cached setting current. Used to
 * switch presence with an arrival automation, now that the screen that held
 * the switch is gone (UAT, 3 Nov 2026, item 5).
 */
export function presencePorts(queryClient: QueryClient): ArrivalPresencePorts {
  return {
    requestPermission: requestForegroundPermission,
    isEnabled: async () => (await fetchPresence()).enabled === true,
    setEnabled: async (enabled) => {
      queryClient.setQueryData(presenceKeys.setting(), await setPresence(enabled));
    },
  };
}

/** Asks the phone, then switches presence on. Never throws; see `switchPresenceOn`. */
export function useSwitchPresenceOn() {
  const queryClient = useQueryClient();
  return useCallback(() => switchPresenceOn(presencePorts(queryClient)), [queryClient]);
}

async function readCoarsePosition() {
  const Location = expoLocation();
  if (!Location) return null;
  if (!(await Location.hasServicesEnabledAsync())) return null;
  const fix = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: false,
  });
  return {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracyMetres: fix.coords.accuracy ?? null,
  };
}

/** Mounted once, at the root. */
export function usePresenceReporter(): void {
  const queryClient = useQueryClient();
  const { presence } = usePresence();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loopRef = useRef<PresenceLoop | null>(null);

  if (loopRef.current === null) {
    loopRef.current = new PresenceLoop({
      readPermission: readForegroundPermission,
      readPosition: readCoarsePosition,
      ping: reportPresence,
      onNotEnabled: () => {
        // The server says it is off: believe it, and re-read the setting.
        queryClient.setQueryData<PresenceSetting | undefined>(presenceKeys.setting(), (current) =>
          current ? { ...current, enabled: false, lastArea: null } : current
        );
        void queryClient.invalidateQueries({ queryKey: presenceKeys.setting() });
      },
    });
  }

  useEffect(() => {
    const loop = loopRef.current!;
    loop.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      loop.setForeground(state === 'active');
    });
    return () => {
      subscription.remove();
      loop.setForeground(false);
    };
  }, []);

  useEffect(() => {
    loopRef.current!.setEnabled(
      isAuthenticated && presence?.enabled === true,
      presence?.minimumIntervalSeconds
    );
  }, [isAuthenticated, presence?.enabled, presence?.minimumIntervalSeconds]);
}

/** The root mounts this rather than calling the hook, to keep `_layout` declarative. */
export function PresenceReporter(): null {
  usePresenceReporter();
  return null;
}
