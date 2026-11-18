import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../auth/useAuth'
import { getApiErrorMessage } from '../auth/errors'
import {
  acceptWorkspaceInvitation,
  rejectWorkspaceInvitation,
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
  async function handleAccept() {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const { workspace } = await acceptWorkspaceInvitation(token)
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
      setSuccess(`You joined ${workspace.name}.`)
      navigate(`/workspaces/${workspace.id}`, { replace: true })
    } catch (acceptError) {
      setError(getApiErrorMessage(acceptError))
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      await rejectWorkspaceInvitation(token)
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
      setSuccess('Invitation rejected.')
    } catch (rejectError) {
      setError(getApiErrorMessage(rejectError))
    } finally {
      setBusy(false)
    }
  }

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
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="teamsync-primary-button rounded-md px-4 py-2.5 font-semibold"
            disabled={busy || Boolean(success)}
            onClick={() => void handleAccept()}
            type="button"
          >
            {busy ? 'Please wait…' : 'Accept invitation'}
          </button>
          <button
            className="rounded-md border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 disabled:opacity-60"
            disabled={busy || Boolean(success)}
            onClick={() => void handleReject()}
            type="button"
          >
            Reject invitation
          </button>
        </div>
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
            className="teamsync-primary-button w-full rounded-md px-4 py-2.5 font-semibold"
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
