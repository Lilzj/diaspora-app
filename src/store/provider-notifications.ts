import { create } from 'zustand';

export interface ProviderNotificationSettings {
  enabled: boolean;
  services: {
    communityGuide: boolean;
    jobPosting: boolean;
    housing: boolean;
    marketplace: boolean;
    service: boolean;
  };
}

interface ProviderNotificationState {
  settings: Record<string, ProviderNotificationSettings>;
  toggleNotifications: (providerId: string, enabled: boolean) => void;
  toggleService: (
    providerId: string,
    serviceKey: keyof ProviderNotificationSettings['services'],
    enabled: boolean
  ) => void;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderNotificationSettings = {
  enabled: false,
  services: {
    communityGuide: true,
    jobPosting: true,
    housing: true,
    marketplace: true,
    service: true,
  },
};

export const useProviderNotificationStore = create<ProviderNotificationState>((set) => ({
  settings: {
    'user-202': {
      enabled: true,
      services: {
        communityGuide: true,
        jobPosting: false,
        housing: true,
        marketplace: false,
        service: true,
      },
    },
  },
  toggleNotifications: (providerId, enabled) =>
    set((state) => {
      const current = state.settings[providerId] || { ...DEFAULT_PROVIDER_SETTINGS };
      return {
        settings: {
          ...state.settings,
          [providerId]: {
            ...current,
            enabled,
          },
        },
      };
    }),
  toggleService: (providerId, serviceKey, enabled) =>
    set((state) => {
      const current = state.settings[providerId] || { ...DEFAULT_PROVIDER_SETTINGS };
      return {
        settings: {
          ...state.settings,
          [providerId]: {
            ...current,
            services: {
              ...current.services,
              [serviceKey]: enabled,
            },
          },
        },
      };
    }),
}));
