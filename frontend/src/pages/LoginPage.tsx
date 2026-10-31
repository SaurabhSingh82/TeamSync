import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const registered = searchParams.get('registered') === '1'
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    try {
      await login(String(form.get('identifier')), String(form.get('password')))
      const destination =
        (location.state as { from?: string } | null)?.from ?? '/profile'
      navigate(destination, { replace: true })
    } catch (loginError) {
      setError(getApiErrorMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Sign in
      </h1>
      <p className="mt-2 text-slate-600">
        Use your TeamSync username or email address.
      </p>
      {registered && (
        <p className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
          Your account was created. A verification link was sent to your email;
          you can sign in before verifying it.
        </p>
      )}
      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Username or email
          <input
            autoComplete="username"
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            name="identifier"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            autoComplete="current-password"
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
        <button
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link className="text-indigo-700 hover:underline" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="text-indigo-700 hover:underline" to="/register">
          Create account
        </Link>
      </div>
    </section>
  )
}
