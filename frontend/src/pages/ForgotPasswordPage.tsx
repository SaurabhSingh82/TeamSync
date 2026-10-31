import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { apiClient, ensureCsrfToken } from '../lib/api/client'

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await ensureCsrfToken()
      await apiClient.post('/auth/password-reset/', {
        email: form.get('email'),
      })
      setSubmitted(true)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Reset your password
      </h1>
      {submitted ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          If that email is registered, password-reset instructions have been
          sent.
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-600">
            Enter your account email. If it is registered, we will send a reset
            link.
          </p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                autoComplete="email"
                className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
                name="email"
                required
                type="email"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700">
              Send reset link
            </button>
          </form>
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
