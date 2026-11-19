import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Check, CheckCircle2, LoaderCircle, Mail, ShieldAlert, X } from 'lucide-react'

import { useAuth } from '../auth/useAuth'
import { getApiErrorMessage } from '../auth/errors'
import {
  acceptWorkspaceInvitation,
  rejectWorkspaceInvitation,
} from '../workspaces/api'
import { useToast } from '../components/ui/ToastProvider'

export function InvitationAcceptPage() {
  const { login, register, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<'accept' | 'reject' | 'auth' | null>(null)
  const [success, setSuccess] = useState('')
  const { show } = useToast()

  async function handleAccept() {
    if (!token) return
    setBusyAction('accept')
    setError('')
    try {
      const { workspace } = await acceptWorkspaceInvitation(token)
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
      setSuccess(`You joined ${workspace.name}.`)
      show({
        variant: 'success',
        title: 'Welcome aboard!',
        message: `You have successfully joined "${workspace.name}".`,
        duration: 4000,
      })
      navigate(`/workspaces/${workspace.id}`, { replace: true })
    } catch (acceptError) {
      setError(getApiErrorMessage(acceptError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleReject() {
    if (!token) return
    setBusyAction('reject')
    setError('')
    try {
      await rejectWorkspaceInvitation(token)
      window.history.replaceState(null, '', `${location.pathname}${location.search}`)
      setSuccess('Invitation declined.')
      show({
        variant: 'info',
        title: 'Invitation Declined',
        message: 'The workspace invitation has been declined.',
        duration: 3500,
      })
    } catch (rejectError) {
      setError(getApiErrorMessage(rejectError))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusyAction('auth')
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
      setBusyAction(null)
    }
  }

  if (!token) {
    return (
      <section className="mx-auto max-w-lg py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-950">
            Invitation link unavailable
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            This invitation link is invalid or missing its authentication token. Please ask the workspace administrator to resend your invite.
          </p>
          <Link
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            to="/"
          >
            Return to TeamSync
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-lg py-10">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        {/* Top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xs">
              <Mail size={20} />
            </span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                Workspace Invitation
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-950">
                Accept Invitation
              </h1>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            {user ? (
              <>
                You are currently signed in as{' '}
                <strong className="font-semibold text-slate-900">{user.email}</strong>. Accept to join this workspace.
              </>
            ) : (
              'Sign in or register with the email address that received this invitation.'
            )}
          </p>

          {success && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800" role="status">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800" role="alert">
              {error}
            </p>
          )}

          {user ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-60"
                disabled={busyAction !== null || Boolean(success)}
                onClick={() => void handleAccept()}
                type="button"
              >
                {busyAction === 'accept' ? (
                  <>
                    <LoaderCircle className="animate-spin" size={15} />
                    <span>Joining…</span>
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    <span>Accept & Join</span>
                  </>
                )}
              </button>

              <button
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60"
                disabled={busyAction !== null || Boolean(success)}
                onClick={() => void handleReject()}
                type="button"
              >
                {busyAction === 'reject' ? (
                  <>
                    <LoaderCircle className="animate-spin" size={15} />
                    <span>Declining…</span>
                  </>
                ) : (
                  <>
                    <X size={15} />
                    <span>Decline</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Username</label>
                    <input
                      autoComplete="username"
                      className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      maxLength={150}
                      name="username"
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">First name</label>
                      <input
                        autoComplete="given-name"
                        className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        name="first_name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Last name</label>
                      <input
                        autoComplete="family-name"
                        className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        name="last_name"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">Email address</label>
                <input
                  autoComplete="email"
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  name="email"
                  required
                  type="email"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                <input
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  name="password"
                  required
                  type="password"
                />
              </div>

              <button
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] disabled:opacity-60"
                disabled={busyAction === 'auth'}
                type="submit"
              >
                {busyAction === 'auth'
                  ? 'Authenticating…'
                  : mode === 'login'
                    ? 'Sign in and accept'
                    : 'Create account and accept'}
              </button>

              <p className="text-center text-xs text-slate-500">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  className="font-semibold text-indigo-600 hover:underline"
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
        </div>
      </div>
    </section>
  )
}
