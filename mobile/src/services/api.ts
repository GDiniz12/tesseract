import { storage } from './storage';

// Default URLs
export const DEFAULT_PROD_URL = 'https://synap-mocha.vercel.app/api';
export const DEFAULT_LOCAL_DEV_URL = 'http://localhost:3000/api';

let activeApiUrl: string = DEFAULT_PROD_URL;

export const setApiBaseUrl = (url: string) => {
  let formatted = url.trim().replace(/\/+$/, '');
  if (!formatted.endsWith('/api') && !formatted.includes('/api/')) {
    formatted = `${formatted}/api`;
  }
  activeApiUrl = formatted;
};

export const getApiBaseUrl = () => activeApiUrl;

// Initialize base URL from storage
export const initApiConfig = async () => {
  const savedUrl = await storage.getApiUrl();
  if (savedUrl) {
    setApiBaseUrl(savedUrl);
  }
};

export interface ApiOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
}

export const api = async <T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const {
    retries = options.method && options.method !== 'GET' ? 1 : 3,
    retryDelay = 2000,
    ...fetchOptions
  } = options;

  const token = await storage.getToken();

  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${activeApiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      const refreshedToken = response.headers.get('X-Session-Token');
      if (refreshedToken) {
        await storage.setToken(refreshedToken);
      }

      // Transient cold start on cloud backend (502, 503, 504)
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        attempt++;
        await new Promise((res) => setTimeout(res, retryDelay));
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro na API: ${response.status}`);
      }

      if (response.status === 204) {
        return null as unknown as T;
      }

      return await response.json();
    } catch (err: any) {
      const isNetworkError =
        err.name === 'TypeError' ||
        err.message?.toLowerCase().includes('fetch') ||
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('failed');

      if (isNetworkError && attempt < retries) {
        attempt++;
        await new Promise((res) => setTimeout(res, retryDelay));
        continue;
      }
      throw err;
    }
  }
};
