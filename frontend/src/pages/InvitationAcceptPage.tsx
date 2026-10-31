import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../auth/useAuth'
import { getApiErrorMessage } from '../auth/errors'
import {
  acceptWorkspaceInvitation,
} from '../workspaces/api'

export function InvitationAcceptPage() {
  const { login, register, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const accepting = useRef(false)

  useEffect(() => {
    if (!token || !user || accepting.current) return
    accepting.current = true
    setBusy(true)
    setError('')
    void acceptWorkspaceInvitation(token)
      .then(({ workspace }) => {
        window.history.replaceState(
          null,
          '',
          `${location.pathname}${location.search}`,
        )
        setSuccess(`You joined ${workspace.name}.`)
        navigate(`/workspaces/${workspace.id}`, { replace: true })
      })
      .catch((acceptError: unknown) => {
        accepting.current = false
        setError(getApiErrorMessage(acceptError))
      })
      .finally(() => setBusy(false))
  }, [location.hash, location.pathname, location.search, navigate, token, user])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    try {
      if (mode === 'register') {
        await register({
          username: String(form.get('username') ?? ''),
          email,
          password,
          first_name: String(form.get('first_name') ?? ''),
          last_name: String(form.get('last_name') ?? ''),
        })
      }
      await login(email, password)
    } catch (submitError) {
      setError(getApiErrorMessage(submitError))
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <section className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold text-slate-950">Invitation link unavailable</h1>
        <p className="mt-3 text-slate-600">
          This link is missing its invitation token. Ask the workspace owner or admin to resend it.
        </p>
        <Link className="mt-5 inline-block text-indigo-700 underline" to="/">
          Return home
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Accept a workspace invitation
      </h1>
      <p className="mt-3 text-slate-600">
        {user
          ? `Accept this invitation while signed in as ${user.email}.`
          : 'Sign in or create an account using the email address that received this invitation.'}
      </p>
      {success && <p className="mt-4 text-emerald-800" role="status">{success}</p>}
      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      {user ? (
        busy && <p className="mt-5 text-sm text-slate-600" role="status">Accepting invitation…</p>
      ) : (
        <form className="mt-7 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          {mode === 'register' && (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Username
                <input
                  autoComplete="username"
                  className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
                  maxLength={150}
                  name="username"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  First name
                  <input
                    autoComplete="given-name"
                    className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
                    name="first_name"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Last name
                  <input
                    autoComplete="family-name"
                    className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
                    name="last_name"
                  />
                </label>
              </div>
            </>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              autoComplete="email"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5"
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in and accept'
                : 'Create account and accept'}
          </button>
          <p className="text-center text-sm text-slate-600">
            {mode === 'login' ? 'New to TeamSync?' : 'Already have an account?'}{' '}
            <button
              className="font-medium text-indigo-700 underline"
              onClick={() => {
                setError('')
                setMode(mode === 'login' ? 'register' : 'login')
              }}
              type="button"
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      )}
    </section>
  )
}
