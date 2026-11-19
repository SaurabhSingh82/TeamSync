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
    <section className="mx-auto max-w-sm space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Sign in to TeamSync
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Enter your username or email address to access workspaces.
        </p>
      </div>

      {registered && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          Account created successfully. A verification link was sent to your email; you may sign in immediately.
        </p>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Username or email
            <input
              autoComplete="username"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              name="identifier"
              placeholder="e.g. kishlay@company.com"
              required
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Password
            <input
              autoComplete="current-password"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              name="password"
              placeholder="••••••••"
              required
              type="password"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            className="teamsync-primary-button h-8 w-full rounded-lg px-4 text-xs font-semibold shadow-2xs"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800/80">
          <Link className="text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-200" to="/forgot-password">
            Forgot password?
          </Link>
          <Link className="font-semibold text-slate-900 hover:underline dark:text-slate-100" to="/register">
            Create account
          </Link>
        </div>
      </div>
    </section>
  )
}
