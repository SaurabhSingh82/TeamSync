import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { apiClient, ensureCsrfToken } from '../lib/api/client'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const uid = searchParams.get('uid')
  const token = searchParams.get('token')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await ensureCsrfToken()
      await apiClient.post('/auth/password-reset/confirm/', {
        uid,
        token,
        password: form.get('password'),
      })
      setSubmitted(true)
    } catch (resetError) {
      setError(getApiErrorMessage(resetError))
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Choose a new password
      </h1>
      {submitted ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          Your password has been updated. You can now sign in.
        </p>
      ) : !uid || !token ? (
        <p role="alert" className="mt-4 text-red-700">
          This password-reset link is incomplete. Request a new one.
        </p>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              autoComplete="new-password"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700">
            Update password
          </button>
        </form>
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
