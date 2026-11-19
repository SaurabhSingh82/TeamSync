import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  Check,
  CheckCircle2,
  Clock,
  LoaderCircle,
  Mail,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

import { getApiErrorMessage } from '../auth/errors'
import {
  acceptReceivedInvitation,
  listReceivedInvitations,
  rejectReceivedInvitation,
} from '../workspaces/api'
import type { WorkspaceInvitation } from '../workspaces/types'
import { useRealtime } from '../realtime/useRealtime'
import { useToast } from '../components/ui/ToastProvider'

export function InvitationsPage() {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<{
    id: string
    action: 'accept' | 'reject'
  } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('invitation')
  const navigate = useNavigate()
  const { show } = useToast()

  // ── Load from API ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const result = await listReceivedInvitations()
      setInvitations(result)
      setError('')
    } catch (loadError) {
      setError(getApiErrorMessage(loadError))
    }
  }, [])

  useEffect(() => {
    let active = true
    void listReceivedInvitations()
      .then((result) => {
        if (active) setInvitations(result)
      })
      .catch((loadError: unknown) => {
        if (active) setError(getApiErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  // Auto-scroll to highlighted invitation
  useEffect(() => {
    if (!highlightId || invitations.length === 0) return
    const el = document.getElementById(`invitation-${highlightId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, invitations])

  // ── Real-time WebSocket ───────────────────────────────────────────────────
  const handleRealtimeEvent = useCallback(
    (event: { type: string; payload?: Record<string, unknown> }) => {
      if (event.type === 'resync.required') {
        void load()
        return
      }

      if (event.type === 'invitation.created') {
        const p = event.payload ?? {}
        const synthetic: WorkspaceInvitation = {
          id: String(p.invitation_id ?? ''),
          email: '',
          message: String(p.message ?? ''),
          role: (p.role as WorkspaceInvitation['role']) ?? 'member',
          workspace_id: String(p.workspace_id ?? ''),
          workspace_name: String(p.workspace_name ?? 'Unknown workspace'),
          invited_by_name: String(p.invited_by_name ?? ''),
          invited_by_id: p.invited_by_id ? String(p.invited_by_id) : null,
          status: 'pending',
          created_at: String(p.created_at ?? new Date().toISOString()),
          expires_at: String(p.expires_at ?? ''),
          accepted_at: null,
          revoked_at: null,
          email_delivery: { status: 'unknown', attempts: 0, last_error: '' },
        }
        setInvitations((prev) => {
          if (prev.some((inv) => inv.id === synthetic.id)) return prev
          return [synthetic, ...prev]
        })
      }
    },
    [load],
  )

  const connected = useRealtime('/ws/notifications/', handleRealtimeEvent)
  // ─────────────────────────────────────────────────────────────────────────

  async function handleManualRefresh() {
    setIsRefreshing(true)
    await load()
    setIsRefreshing(false)
  }

  async function act(invitation: WorkspaceInvitation, action: 'accept' | 'reject') {
    setBusyAction({ id: invitation.id, action })
    setError('')
    try {
      if (action === 'accept') {
        const result = await acceptReceivedInvitation(invitation.id)
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitation.id
              ? { ...inv, status: 'accepted', workspace_id: result.workspace.id }
              : inv,
          ),
        )
        show({
          variant: 'success',
          title: 'Welcome aboard!',
          message: `You have successfully joined "${result.workspace.name}".`,
          duration: 4000,
        })
        navigate(`/workspaces/${result.workspace.id}`, { replace: true })
      } else {
        await rejectReceivedInvitation(invitation.id)
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitation.id ? { ...inv, status: 'rejected' } : inv,
          ),
        )
        show({
          variant: 'info',
          title: 'Invitation Declined',
          message: `Declined invitation to "${invitation.workspace_name}".`,
          duration: 3500,
        })
      }
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
      await load()
    } finally {
      setBusyAction(null)
    }
  }

  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length

  return (
    <section className="mx-auto max-w-3xl pb-12">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teamsync-navy">
            <Mail aria-hidden="true" size={20} />
            <p className="text-sm font-semibold tracking-wide">Workspace access</p>
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-950">
            Invitations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {pendingCount > 0
              ? `You have ${pendingCount} pending workspace invitation${pendingCount === 1 ? '' : 's'}.`
              : 'Workspace invitations sent to your account.'}
          </p>
        </div>

        {/* Live indicator + refresh */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold shadow-2xs"
            title={connected ? 'Live synchronization active' : 'Reconnecting…'}
          >
            {connected ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-700">Live</span>
              </>
            ) : (
              <>
                <WifiOff aria-hidden="true" className="text-slate-400" size={13} />
                <span className="text-slate-500">Reconnecting…</span>
              </>
            )}
          </span>
          <button
            aria-label="Refresh invitations"
            className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            disabled={isRefreshing}
            onClick={() => void handleManualRefresh()}
            title="Refresh"
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={isRefreshing ? 'animate-spin' : ''}
              size={15}
            />
          </button>
        </div>
      </div>

      {error && (
        <p
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* ── List ── */}
      <div className="space-y-4">
        {invitations.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
            <div className="mx-auto mb-3.5 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Mail aria-hidden="true" size={26} />
            </div>
            <h3 className="font-semibold text-slate-900">No invitations</h3>
            <p className="mt-1 text-xs text-slate-500">
              When teammates invite you to workspaces, they will appear here in real time.
            </p>
          </div>
        )}

        {invitations.map((invitation) => {
          const pending = invitation.status === 'pending'
          const isHighlighted = highlightId === invitation.id
          const isAccepting =
            busyAction?.id === invitation.id && busyAction.action === 'accept'
          const isRejecting =
            busyAction?.id === invitation.id && busyAction.action === 'reject'
          const isBusy = busyAction?.id === invitation.id

          return (
            <article
              className={`overflow-hidden rounded-2xl border bg-white shadow-xs transition-all duration-300 ${
                isHighlighted
                  ? 'border-indigo-400 ring-2 ring-indigo-500 shadow-md scale-[1.01]'
                  : pending
                    ? 'border-indigo-200/90 ring-1 ring-indigo-100'
                    : 'border-slate-200'
              }`}
              id={`invitation-${invitation.id}`}
              key={invitation.id}
            >
              {/* Top accent strip for pending */}
              {pending && (
                <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />
              )}

              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    {/* Workspace Initial Avatar */}
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-xs"
                    >
                      {(invitation.workspace_name || '?')[0].toUpperCase()}
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-slate-950 sm:text-lg">
                        {invitation.workspace_name || 'Unknown workspace'}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
                        <span className="font-semibold text-slate-900">
                          {invitation.invited_by_name || 'A workspace administrator'}
                        </span>{' '}
                        invited you as a{' '}
                        <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold capitalize text-indigo-700">
                          {invitation.role}
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      pending
                        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                        : invitation.status === 'accepted'
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                          : invitation.status === 'rejected'
                            ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {invitation.status}
                  </span>
                </div>

                {invitation.message && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs italic text-slate-700 sm:text-sm">
                    &ldquo;{invitation.message}&rdquo;
                  </div>
                )}

                {invitation.expires_at && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock size={13} />
                    <span>
                      {pending ? 'Expires' : 'Expired'}{' '}
                      {new Date(invitation.expires_at).toLocaleString()}
                    </span>
                  </p>
                )}

                {/* ── Interactive Actions ── */}
                {pending && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-60 sm:text-sm"
                      disabled={isBusy}
                      onClick={() => void act(invitation, 'accept')}
                      type="button"
                    >
                      {isAccepting ? (
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
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] disabled:opacity-60 sm:text-sm"
                      disabled={isBusy}
                      onClick={() => void act(invitation, 'reject')}
                      type="button"
                    >
                      {isRejecting ? (
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
                )}

                {!pending && invitation.workspace_id && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {invitation.status === 'accepted'
                        ? 'You are a member of this workspace.'
                        : 'This invitation was declined.'}
                    </span>
                    {invitation.status === 'accepted' && (
                      <Link
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                        to={`/workspaces/${invitation.workspace_id}`}
                      >
                        <span>Open workspace</span>
                        <span>→</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
