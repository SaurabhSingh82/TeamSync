import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Mail, RefreshCw, Wifi, WifiOff } from 'lucide-react'

import { getApiErrorMessage } from '../auth/errors'
import {
  acceptReceivedInvitation,
  listReceivedInvitations,
  rejectReceivedInvitation,
} from '../workspaces/api'
import type { WorkspaceInvitation } from '../workspaces/types'
import { useRealtime } from '../realtime/useRealtime'

export function InvitationsPage() {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const navigate = useNavigate()

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

  // ── Real-time WebSocket ───────────────────────────────────────────────────
  const handleRealtimeEvent = useCallback(
    (event: { type: string; payload?: Record<string, unknown> }) => {
      if (event.type === 'resync.required') {
        // Reconnected — full refresh to fix any missed events
        void load()
        return
      }

      if (event.type === 'invitation.created') {
        // Optimistically prepend new invitation using WS payload (no extra fetch)
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
          // Avoid duplicates if the page was already loaded with this invitation
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
    setBusyId(invitation.id)
    setError('')
    try {
      if (action === 'accept') {
        const result = await acceptReceivedInvitation(invitation.id)
        navigate(`/workspaces/${result.workspace.id}`, { replace: true })
      } else {
        await rejectReceivedInvitation(invitation.id)
        await load()
      }
    } catch (actionError) {
      setError(getApiErrorMessage(actionError))
      await load()
    } finally {
      setBusyId('')
    }
  }

  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length

  return (
    <section className="mx-auto max-w-3xl">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teamsync-navy">
            <Mail aria-hidden="true" size={20} />
            <p className="text-sm font-semibold">Your invitations</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Invitations
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {pendingCount > 0
              ? `${pendingCount} pending workspace invitation${pendingCount === 1 ? '' : 's'}`
              : 'Workspace invitations sent to your account.'}
          </p>
        </div>

        {/* Live indicator + refresh */}
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium"
            title={connected ? 'Receiving live updates' : 'Reconnecting…'}
          >
            {connected ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <Wifi aria-hidden="true" className="text-emerald-600" size={12} />
                <span className="text-emerald-700">Live</span>
              </>
            ) : (
              <>
                <WifiOff aria-hidden="true" className="text-slate-400" size={12} />
                <span className="text-slate-500">Reconnecting…</span>
              </>
            )}
          </span>
          <button
            aria-label="Refresh invitations"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
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
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {/* ── List ── */}
      <div className="space-y-4">
        {invitations.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Mail aria-hidden="true" size={24} />
            </div>
            <p className="font-medium text-slate-700">No invitations</p>
            <p className="mt-1 text-sm text-slate-500">
              New workspace invitations will appear here instantly.
            </p>
          </div>
        )}

        {invitations.map((invitation) => {
          const pending = invitation.status === 'pending'
          return (
            <article
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                pending
                  ? 'border-indigo-200 ring-1 ring-indigo-100'
                  : 'border-slate-200'
              }`}
              key={invitation.id}
            >
              {/* Top accent strip for pending */}
              {pending && (
                <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />
              )}

              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Workspace initial avatar */}
                    <span
                      className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow"
                      aria-hidden="true"
                    >
                      {(invitation.workspace_name || '?')[0].toUpperCase()}
                    </span>
                    <div>
                      <h2 className="font-semibold text-slate-950">
                        {invitation.workspace_name || 'Unknown workspace'}
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {invitation.invited_by_name || 'A workspace administrator'} invited
                        you as a{' '}
                        <span className="font-semibold capitalize text-indigo-700">
                          {invitation.role}
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      pending
                        ? 'bg-indigo-100 text-indigo-800'
                        : invitation.status === 'accepted'
                          ? 'bg-emerald-100 text-emerald-800'
                          : invitation.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {invitation.status}
                  </span>
                </div>

                {invitation.message && (
                  <p className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                    &ldquo;{invitation.message}&rdquo;
                  </p>
                )}

                {invitation.expires_at && (
                  <p className="mt-3 text-xs text-slate-400">
                    {pending ? 'Expires' : 'Expired'}{' '}
                    {new Date(invitation.expires_at).toLocaleString()}
                  </p>
                )}

                {pending && (
                  <div className="mt-4 flex gap-2.5">
                    <button
                      className="teamsync-primary-button rounded-xl px-5 py-2 text-sm font-semibold transition disabled:opacity-60"
                      disabled={busyId === invitation.id}
                      onClick={() => void act(invitation, 'accept')}
                      type="button"
                    >
                      {busyId === invitation.id ? 'Accepting…' : 'Accept'}
                    </button>
                    <button
                      className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      disabled={busyId === invitation.id}
                      onClick={() => void act(invitation, 'reject')}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {!pending && invitation.workspace_id && (
                  <Link
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
                    to={`/workspaces/${invitation.workspace_id}`}
                  >
                    Open workspace →
                  </Link>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
