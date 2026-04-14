import { getBaseUrl } from './config'

const MasterAPI = {
  apiFetch: async (url: string, options?: RequestInit): Promise<Response> => {
    // Dynamically get the base URL and ensure it has /api prefix
    const API_BASE_URL = getBaseUrl()
    const baseUrlWithApi = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`
    
    let fullUrl = url.startsWith('http') ? url : `${baseUrlWithApi}${url.startsWith('/') ? '' : '/'}${url}`
    
    // Get token from authStore
    let token: string | null = null
    try {
      const { useAuthStore } = await import('../store/authStore')
      token = useAuthStore.getState().token
    } catch (e) {
      console.warn('Failed to get token from authStore:', e)
    }
    
    const isFormData = options?.body && (options.body instanceof FormData || (typeof options.body === 'object' && 'append' in options.body))
    
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        ...(options?.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      }
    }

    // CRITICAL: Remove Content-Type header for FormData to let the browser/native-fetch 
    // set the correct boundary automatically.
    if (isFormData) {
      const headers = { ...fetchOptions.headers } as any
      delete headers['Content-Type']
      fetchOptions.headers = headers
    } else if (!(fetchOptions.headers as any)?.['Content-Type']) {
      (fetchOptions.headers as any)['Content-Type'] = 'application/json'
    }

    console.log(`[API] Sending ${options?.method || 'GET'} to ${fullUrl}`, {
      hasToken: !!token,
      isFormData: !!isFormData
    })
    
    const response = await fetch(fullUrl, fetchOptions)
    
    // Check if response is ok
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
    const response = await MasterAPI.apiFetch(url, { ...options, method: 'GET' })
    const data = await response.json()
    return { data, status: response.status }
  },
  
  post: async (url: string, data?: any, options?: RequestInit) => {
    const isFormData = data && (data instanceof FormData || (typeof data === 'object' && 'append' in data))
    const response = await MasterAPI.apiFetch(url, {
      ...options,
      method: 'POST',
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined)
    })
    const responseData = await response.json()
    return { data: responseData, status: response.status }
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
