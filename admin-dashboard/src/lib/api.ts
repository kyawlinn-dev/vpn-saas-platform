import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 20000,
  withCredentials: true,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});

let refreshPromise: Promise<void> | null = null;

async function refreshAdminSession() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/admin/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';

    const isRefreshCall = url.includes('/admin/auth/refresh');
    const isLoginCall = url.includes('/admin/auth/login');
    const isLogoutCall = url.includes('/admin/auth/logout');
    const canRetry = Boolean(
      config && !config._retry && status === 401 && !isRefreshCall && !isLoginCall && !isLogoutCall,
    );

    if (!canRetry || !config) {
      return Promise.reject(error);
    }

    try {
      config._retry = true;
      await refreshAdminSession();
      return api.request(config);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
