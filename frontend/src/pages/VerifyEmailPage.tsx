import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { apiClient, ensureCsrfToken } from '../lib/api/client'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleVerify() {
    setError('')
    try {
      await ensureCsrfToken()
      const { data } = await apiClient.post<{ detail: string }>(
        '/auth/email/verify/',
        { token },
      )
      setMessage(data.detail)
    } catch (verificationError) {
      setError(getApiErrorMessage(verificationError))
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Verify your email
      </h1>
      {message ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          {message}
        </p>
      ) : !token ? (
        <p role="alert" className="mt-4 text-red-700">
          This verification link is incomplete.
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-600">
            Confirm that you own the email address used for this account.
          </p>
          <button
            className="mt-6 rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700"
            onClick={() => void handleVerify()}
            type="button"
          >
            Verify email
          </button>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}
      <Link
        className="mt-6 inline-block text-sm text-indigo-700 hover:underline"
        to="/login"
      >
        Back to sign in
      </Link>
    </section>
  )
}
