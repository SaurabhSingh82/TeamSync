import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

interface RetryableRequest extends InternalAxiosRequestConfig {
  _authRetry?: boolean
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10_000,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: {
    Accept: 'application/json',
  },
})

let refreshRequest: Promise<void> | null = null
const authEndpointsWithoutRefresh = [
  '/auth/csrf/',
  '/auth/login/',
  '/auth/register/',
  '/auth/logout/',
  '/auth/refresh/',
  '/auth/password-reset/',
  '/auth/password-reset/confirm/',
  '/auth/email/verify/',
]

export async function ensureCsrfToken() {
  const { data } = await apiClient.get<{ csrfToken: string }>('/auth/csrf/')
  apiClient.defaults.headers.common['X-CSRFToken'] = data.csrfToken
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequest | undefined
    const requestUrl = request?.url ?? ''
    const isAuthEndpoint = authEndpointsWithoutRefresh.some((path) =>
      requestUrl.includes(path),
    )

    if (
      error.response?.status !== 401 ||
      !request ||
      request._authRetry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error)
    }

    request._authRetry = true
    refreshRequest ??= apiClient
      .post('/auth/refresh/')
      .then(() => undefined)
      .finally(() => {
        refreshRequest = null
      })

    try {
      await refreshRequest
      return apiClient(request)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)
