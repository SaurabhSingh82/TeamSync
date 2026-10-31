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
    <section className="mx-auto max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Create your account
      </h1>
      <p className="mt-2 text-slate-600">
        Email verification instructions will be sent after registration.
      </p>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            autoComplete="username"
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
            maxLength={150}
            name="username"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            autoComplete="email"
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            First name
            <input
              autoComplete="given-name"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
              maxLength={150}
              name="first_name"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Last name
            <input
              autoComplete="family-name"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
              maxLength={150}
              name="last_name"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Password
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
        <button
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        Already registered?{' '}
        <Link className="font-medium text-indigo-700 hover:underline" to="/login">
          Sign in
        </Link>
      </p>
    </section>
  )
}
