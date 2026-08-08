import axios from 'axios';
import { useAuthStore } from '@/store/auth';
import { useConnectivityStore } from '@/lib/connectivity';

export const apiClient = axios.create({
  baseURL: 'https://api.diaspora.app/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  // A financial request that hangs for ever is a payment whose outcome nobody
  // ever reconciles. Thirty seconds is generous for a gateway round trip and
  // short enough that the client reaches its "confirming the status" state
  // while the member is still holding the phone.
  timeout: 30_000,
});

/**
 * Attaches the session token.
 *
 * B15's routes take no user identifier — `/wallets/me`, `/giving/me` — so the
 * bearer token is the only thing that says whose money is being asked about.
 * A request that goes out without it is answered with a 401 rather than with
 * somebody else's balance, which is the property the backend's route design
 * was chosen for.
 */
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Records what the last request tells us about the connection.
 *
 * A completed response — of any status — proves the device can reach the API.
 * A failure with no response at all is the only evidence of the opposite, and
 * it is deliberately distinguished from a 500: a server that answers "no" is a
 * server the device can reach.
 *
 * **Nothing here logs a response body.** §21 forbids logging payment
 * information, and an interceptor that logged errors "just for debugging" is
 * exactly how a payment token ends up in a crash report.
 */
apiClient.interceptors.response.use(
  (response) => {
    useConnectivityStore.getState().recordSuccess();
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && !error.response) {
      useConnectivityStore.getState().recordNetworkFailure();
    } else {
      useConnectivityStore.getState().recordSuccess();
    }
    return Promise.reject(error);
  }
);
