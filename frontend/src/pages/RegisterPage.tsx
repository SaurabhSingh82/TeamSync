import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    try {
      await register({
        username: String(form.get('username')),
        email: String(form.get('email')),
        password: String(form.get('password')),
        first_name: String(form.get('first_name')),
        last_name: String(form.get('last_name')),
      })
      navigate('/login?registered=1', { replace: true })
    } catch (registrationError) {
      setError(getApiErrorMessage(registrationError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-sm space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Create your account
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Join TeamSync to collaborate across workspaces in real time.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Username
            <input
              autoComplete="username"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              maxLength={150}
              name="username"
              placeholder="e.g. kishlay"
              required
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Email
            <input
              autoComplete="email"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              maxLength={254}
              name="email"
              placeholder="name@company.com"
              required
              type="email"
            />
          </label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              First name
              <input
                autoComplete="given-name"
                className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                maxLength={150}
                name="first_name"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Last name
              <input
                autoComplete="family-name"
                className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                maxLength={150}
                name="last_name"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Password (min 8 characters)
            <input
              autoComplete="new-password"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              minLength={8}
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-3 text-center text-xs dark:border-slate-800/80">
          <span className="text-slate-500 dark:text-slate-400">Already registered? </span>
          <Link className="font-semibold text-slate-900 hover:underline dark:text-slate-100" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}
