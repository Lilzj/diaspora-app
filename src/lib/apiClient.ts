import axios from 'axios';

export const apiClient = axios.create({
  baseURL: 'https://api.diaspora.app/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for adding auth token if present
apiClient.interceptors.request.use((config) => {
  // We'll hook this up to Zustand auth store later
  return config;
});
