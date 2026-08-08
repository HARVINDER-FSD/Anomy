import { getBaseUrl } from './config'

// ─── Singleton refresh lock ───────────────────────────────────────────────────
// Prevents multiple parallel 401s from each triggering their own token refresh.
// All concurrent requests wait for the same refresh Promise.
let _refreshPromise: Promise<string | null> | null = null;

// ─── Logout lock ─────────────────────────────────────────────────────────────
// Prevents multiple parallel 403s from calling logout() more than once.
let _isLoggingOut = false;

async function doTokenRefresh(): Promise<string | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const refreshToken = await AsyncStorage.getItem('auth-refresh-token');

    if (!refreshToken) {
      return null;
    }

    const API_BASE_URL = getBaseUrl();
    const baseUrlWithApi = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;

    const refreshRes = await fetch(`${baseUrlWithApi}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) {
      return null;
    }

    const refreshData = await refreshRes.json();
    if (refreshData.success && refreshData.token) {
      const { useAuthStore } = await import('../store/authStore');
      const store = useAuthStore.getState();
      if (store.user) {
        await store.setAuth(store.user, refreshData.token, refreshData.refreshToken || undefined);
      }
      // Also persist refreshToken if server returned a new one (e.g. after session recreation)
      if (refreshData.refreshToken) {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem('auth-refresh-token', refreshData.refreshToken);
      }
      return refreshData.token;
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function safeLogout() {
  if (_isLoggingOut) return; // Already logging out, skip
  _isLoggingOut = true;
  try {
    const { useAuthStore } = await import('../store/authStore');
    const store = useAuthStore.getState();
    // Only logout if still authenticated — avoids redundant calls
    if (store.user || store.token) {
      await store.logout();
    }
  } catch (e) {
  } finally {
    // Reset after a short delay to allow navigation to complete
    setTimeout(() => { _isLoggingOut = false; }, 3000);
  }
}

const inflightGetRequests = new Map<string, Promise<any>>();

const MasterAPI = {
  apiFetch: async (url: string, options?: RequestInit): Promise<Response> => {
    const API_BASE_URL = getBaseUrl()
    const baseUrlWithApi = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`

    let fullUrl = url.startsWith('http') ? url : `${baseUrlWithApi}${url.startsWith('/') ? '' : '/'}${url}`

    // Get token from authStore
    let token: string | null = null
    try {
      const { useAuthStore } = await import('../store/authStore')
      token = useAuthStore.getState().token
    } catch (e) {
    }

    const isFormData = options?.body && (options.body instanceof FormData || (typeof options.body === 'object' && 'append' in options.body))

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        ...(options?.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      }
    }

    // CRITICAL: Remove Content-Type for FormData so boundary is set automatically.
    if (isFormData) {
      const headers = { ...fetchOptions.headers } as any
      delete headers['Content-Type']
      fetchOptions.headers = headers
    } else if (!(fetchOptions.headers as any)?.['Content-Type']) {
      (fetchOptions.headers as any)['Content-Type'] = 'application/json'
    }

    const httpMethod = (fetchOptions.method || 'GET').toUpperCase();
    const startTime = Date.now();
    let response = await fetch(fullUrl, fetchOptions);
    const durationMs = Date.now() - startTime;

    try {
      const { performanceEngine } = await import('../engines/PerformanceEngine/PerformanceEngine');
      performanceEngine.trackApi(`${httpMethod} ${url}`, durationMs, response.status);
    } catch (_) {}

    // ── 401: Auto-refresh token (with singleton lock) ───────────────────────
    if (
      response.status === 401 &&
      !url.includes('/auth/refresh') &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/register')
    ) {

      // If no refresh in flight, start one; otherwise reuse the existing promise.
      if (!_refreshPromise) {
        _refreshPromise = doTokenRefresh().finally(() => {
          _refreshPromise = null; // Clear lock when done
        });
      }

      const newToken = await _refreshPromise;

      if (newToken) {
        // Retry original request with the new token
        const retryHeaders = {
          ...fetchOptions.headers,
          'Authorization': `Bearer ${newToken}`,
        } as any;
        response = await fetch(fullUrl, { ...fetchOptions, headers: retryHeaders });
      } else {
        // Refresh failed — logout once
        await safeLogout();
        // Return the 401 response so the caller can handle it
        return response;
      }
    }

    // ── 403: Invalid/expired JWT ─────────────────────────────────────────────
    if (
      response.status === 403 &&
      !url.includes('/auth/refresh') &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/register')
    ) {
      try {
        const body = await response.clone().json().catch(() => ({}));
        const msg: string = (body?.message || '').toLowerCase();
        if (msg.includes('token') || msg.includes('invalid') || msg.includes('expired')) {

          // Try token refresh first before logout
          if (!_refreshPromise) {
            _refreshPromise = doTokenRefresh().finally(() => {
              _refreshPromise = null;
            });
          }

          const newToken = await _refreshPromise;

          if (newToken) {
            // Retry original request with the new token
            const retryHeaders = {
              ...fetchOptions.headers,
              'Authorization': `Bearer ${newToken}`,
            } as any;
            response = await fetch(fullUrl, { ...fetchOptions, headers: retryHeaders });
          } else {
            // Refresh failed — logout once
            await safeLogout();
          }
        }
      } catch (_) {}
    }

    // ── Throw on non-ok ──────────────────────────────────────────────────────
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }))
      const apiError: any = new Error(errorData.message || `HTTP ${response.status}`)
      apiError.status = response.status
      apiError.data = errorData
      throw apiError
    }

    return response
  },

  get: async (url: string, options?: RequestInit) => {
    const isStandardGet = !options || Object.keys(options).length === 0;
    if (isStandardGet && inflightGetRequests.has(url)) {
      return inflightGetRequests.get(url)!;
    }

    const startTime = Date.now();
    const promise = (async () => {
      try {
        const response = await MasterAPI.apiFetch(url, { ...options, method: 'GET' });
        const duration = Date.now() - startTime;
        const { performanceEngine } = await import('../engines/PerformanceEngine/PerformanceEngine');
        performanceEngine.trackApi(url, duration, response.status);
        const data = await response.json();
        return { data, status: response.status };
      } finally {
        inflightGetRequests.delete(url);
      }
    })();

    if (isStandardGet) {
      inflightGetRequests.set(url, promise);
    }

    return promise;
  },

  post: async (url: string, data?: any, options?: RequestInit) => {
    const startTime = Date.now();
    const isFormData = data && (data instanceof FormData || (typeof data === 'object' && 'append' in data));
    const response = await MasterAPI.apiFetch(url, {
      ...options,
      method: 'POST',
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined)
    });
    const duration = Date.now() - startTime;
    const { performanceEngine } = await import('../engines/PerformanceEngine/PerformanceEngine');
    performanceEngine.trackApi(url, duration, response.status);
    const responseData = await response.json();
    return { data: responseData, status: response.status };
  },

  delete: async (url: string, options?: RequestInit) => {
    const response = await MasterAPI.apiFetch(url, { ...options, method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    return { data, status: response.status }
  },

  put: async (url: string, data?: any, options?: RequestInit) => {
    const isFormData = data && (data instanceof FormData || (typeof data === 'object' && 'append' in data))
    const response = await MasterAPI.apiFetch(url, {
      ...options,
      method: 'PUT',
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined)
    })
    const responseData = await response.json()
    return { data: responseData, status: response.status }
  },

  patch: async (url: string, data?: any, options?: RequestInit) => {
    const isFormData = data && (data instanceof FormData || (typeof data === 'object' && 'append' in data))
    const response = await MasterAPI.apiFetch(url, {
      ...options,
      method: 'PATCH',
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined)
    })
    const responseData = await response.json()
    return { data: responseData, status: response.status }
  }
}

export default MasterAPI
export const apiClient = MasterAPI
