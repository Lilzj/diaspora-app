import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/design-system';
import { NotificationProvider } from './notification-provider';
import { PricingProvider } from './pricing-provider';
import { bindQueryOnlineManager, startConnectivityWatch } from '@/lib/connectivity';
import { shouldRetryQuery } from '@/lib/financial-errors';

/**
 * The app's query client.
 *
 * Defaults chosen for the financial surfaces, because they are the ones with a
 * cost to getting it wrong:
 *
 *   * **Mutations never retry.** Automatically re-sending a payment is the
 *     client deciding to charge twice. Idempotency keys make a *member's* retry
 *     safe; they are not a licence for the app to retry on its own.
 *   * **Reads retry only when the failure says they should.** A 403 or a
 *     `financial.wallet.frozen` is not going to succeed on the second attempt,
 *     and retrying it just delays the explanation the member needs.
 *   * **Refetch on reconnect, not on every focus.** A wallet screen that
 *     refetched every time the app came forward would refetch when the member
 *     returns from the payment sheet, which is the one moment the screen is
 *     already reconciling.
 */
import { useAuthStore } from '@/store/auth';
import { useConversationStore } from '@/store/conversation';
import { ConversationHub } from '@/lib/conversation-hub';
import { destroyRealtimeClient } from '@/lib/realtime';

/** The Messages store as a fresh install has it. */
const EMPTY_CONVERSATIONS = {
  conversations: [],
  messages: {},
  requests: [],
  blockedUserIds: [],
  blockedUsers: [],
  searchQuery: '',
  searchResults: [],
  offlineQueue: [],
  newMessageConversationId: null,
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [, setReady] = useState(false);

  // Nothing of one member survives into the next (14 Oct 2026). A sign-out
  // cleared the tokens and several stores, but not this cache, the Messages
  // store or the socket, so the next member on the same phone saw the previous
  // member's conversations for a few seconds until their own loaded. Any change
  // of member, including signing out, now starts them from empty.
  useEffect(() => {
    let previous = useAuthStore.getState().user?.userId ?? null;
    return useAuthStore.subscribe((state) => {
      const current = state.isAuthenticated ? state.user?.userId ?? null : null;
      if (current === previous) return;
      const hadMember = previous !== null;
      previous = current;
      if (!hadMember) return;
      queryClient.clear();
      useConversationStore.setState(EMPTY_CONVERSATIONS);
      ConversationHub.teardown();
      destroyRealtimeClient();
    });
  }, []);

  useEffect(() => {
    // Connectivity gates every financial mutation, so it is wired up before any
    // screen that could offer one has mounted.
    const stopWatching = startConnectivityWatch();
    const unbind = bindQueryOnlineManager();
    setReady(true);

    return () => {
      stopWatching();
      unbind();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <NotificationProvider>
              {/* Inside the query client: pricing reads the currency catalogue
                  and the deployment's capabilities, both of which are queries. */}
              <PricingProvider>
                {children}
              </PricingProvider>
            </NotificationProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
