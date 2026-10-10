const API_URL = '/api';

export interface ApiOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
}

export const api = async (endpoint: string, options: ApiOptions = {}): Promise<any> => {
  const {
    retries = options.method && options.method !== 'GET' ? 1 : 4,
    retryDelay = 2500,
    ...fetchOptions
  } = options;

  if (typeof window !== 'undefined') {
    try { localStorage.removeItem('token'); } catch {}
  }

  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'X-Session-Mode': 'cookie',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
        credentials: 'same-origin',
      });

      // Transient cold start status codes on Render: 502, 503, 504
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        attempt++;
        await new Promise((res) => setTimeout(res, retryDelay));
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      // Se a resposta for 204 (No Content), não tente parsear JSON
      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (err: any) {
      // If network error / failed to fetch and we have retries remaining, wait and retry
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
