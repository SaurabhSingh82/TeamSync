import axios from 'axios'

export function getApiErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return 'Something went wrong. Please try again.'
  }
  const data = error.response?.data
  if (typeof data?.detail === 'string') {
    return data.detail
  }
  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (typeof value === 'string') return value
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    }
  }
  return 'The request could not be completed. Please try again.'
}
