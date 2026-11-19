import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Check,
  Info,
  LoaderCircle,
  Mail,
  X,
} from 'lucide-react'

export type ToastVariant = 'info' | 'success' | 'warning' | 'invitation'

export interface InvitationActionData {
  invitationId: string
  workspaceId?: string
  workspaceName: string
  inviterName: string
  role: string
  message?: string
  onAccept?: () => Promise<void> | void
  onReject?: () => Promise<void> | void
  onView?: () => void
}

export interface ToastData {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  /** Sub-line shown below message — e.g. workspace name */
  detail?: string
  /** ms before auto-dismiss; 0 = no auto-dismiss */
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  invitation?: InvitationActionData
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { bar: string; icon: string; iconBg: string; Ring: React.ElementType }
> = {
  invitation: {
    bar: 'bg-gradient-to-b from-violet-500 to-indigo-600',
    icon: 'text-white',
    iconBg: 'bg-gradient-to-br from-violet-500 to-indigo-600',
    Ring: Mail,
  },
  success: {
    bar: 'bg-gradient-to-b from-emerald-400 to-green-600',
    icon: 'text-white',
    iconBg: 'bg-gradient-to-br from-emerald-400 to-green-600',
    Ring: Check,
  },
  warning: {
    bar: 'bg-gradient-to-b from-amber-400 to-orange-500',
    icon: 'text-white',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    Ring: AlertTriangle,
  },
  info: {
    bar: 'bg-gradient-to-b from-sky-400 to-blue-600',
    icon: 'text-white',
    iconBg: 'bg-gradient-to-br from-sky-400 to-blue-600',
    Ring: Info,
  },
}

interface ToastProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [actionLoading, setActionLoading] = useState<'accept' | 'reject' | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Enter animation frame
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const dur = toast.duration ?? (toast.invitation ? 25000 : 6000)
    if (dur <= 0) return
    timerRef.current = window.setTimeout(() => handleDismiss(), dur)
    return () => window.clearTimeout(timerRef.current)
  }, [toast.duration, toast.invitation]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    setExiting(true)
    window.setTimeout(() => onDismiss(toast.id), 320)
  }

  // ── Specialized Interactive Invitation Popup ────────────────────────────
  if (toast.invitation) {
    const inv = toast.invitation
    return (
      <div
        aria-live="polite"
        className={`
          toast-item
          relative w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl
          border border-indigo-200/80 bg-white/95 shadow-2xl backdrop-blur-xl
          transition-all duration-300 ease-out dark:border-indigo-900/50 dark:bg-slate-900/95
          ${
            visible && !exiting
              ? 'translate-x-0 opacity-100 scale-100'
              : 'translate-x-full opacity-0 scale-95'
          }
        `}
        role="alert"
      >
        {/* Top accent gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />

        <div className="p-4 sm:p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm"
              >
                {(inv.workspaceName || '?')[0].toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Workspace Invitation
                  </span>
                  <span className="inline-flex size-1.5 rounded-full bg-emerald-500" />
                </div>
                <h3 className="text-sm font-bold leading-tight text-slate-900 dark:text-white sm:text-base">
                  {inv.workspaceName}
                </h3>
              </div>
            </div>
            <button
              aria-label="Dismiss notification"
              className="grid size-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              onClick={handleDismiss}
              type="button"
            >
              <X size={15} />
            </button>
          </div>

          {/* Details */}
          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-white">
              {inv.inviterName}
            </strong>{' '}
            invited you to collaborate as a{' '}
            <span className="inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold capitalize text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              {inv.role}
            </span>
            .
          </p>

          {/* Personal message */}
          {inv.message && (
            <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-xs italic text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              &ldquo;{inv.message}&rdquo;
            </div>
          )}

          {/* Action Buttons: Accept & Decline */}
          <div className="mt-4 flex items-center gap-2.5">
            <button
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-60"
              disabled={actionLoading !== null}
              onClick={async () => {
                setActionLoading('accept')
                try {
                  if (inv.onAccept) await inv.onAccept()
                  handleDismiss()
                } catch {
                  setActionLoading(null)
                }
              }}
              type="button"
            >
              {actionLoading === 'accept' ? (
                <>
                  <LoaderCircle className="animate-spin" size={13} />
                  <span>Joining…</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>Accept & Join</span>
                </>
              )}
            </button>

            <button
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              disabled={actionLoading !== null}
              onClick={async () => {
                setActionLoading('reject')
                try {
                  if (inv.onReject) await inv.onReject()
                  handleDismiss()
                } catch {
                  setActionLoading(null)
                }
              }}
              type="button"
            >
              {actionLoading === 'reject' ? (
                <>
                  <LoaderCircle className="animate-spin" size={13} />
                  <span>Declining…</span>
                </>
              ) : (
                <span>Decline</span>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {(toast.duration ?? 25000) > 0 && (
          <div
            className="toast-progress absolute bottom-0 left-0 right-0 h-0.5 origin-left bg-gradient-to-r from-violet-500 to-indigo-600 opacity-40"
            style={
              {
                '--toast-duration': `${toast.duration ?? 25000}ms`,
              } as React.CSSProperties
            }
          />
        )}
      </div>
    )
  }

  // ── Standard Toast Notification ──────────────────────────────────────────
  const { bar, icon, iconBg, Ring } = VARIANT_STYLES[toast.variant]

  return (
    <div
      aria-live="polite"
      className={`
        toast-item
        relative flex w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl
        border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl
        transition-all duration-300 ease-out
        ${visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      role="alert"
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 ${bar}`} />

      {/* Icon */}
      <div className="flex shrink-0 items-start p-4 pb-3 pr-0">
        <span className={`grid size-9 place-items-center rounded-xl ${iconBg} shadow-md`}>
          <Ring aria-hidden="true" className={icon} size={17} strokeWidth={2.5} />
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 px-3 py-3.5">
        <p className="text-sm font-semibold leading-snug text-slate-900">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
            {toast.message}
          </p>
        )}
        {toast.detail && (
          <p className="mt-1 text-xs font-medium text-slate-500">{toast.detail}</p>
        )}
        {toast.action && (
          <button
            className="mt-2 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700 active:bg-indigo-800"
            onClick={() => {
              toast.action!.onClick()
              handleDismiss()
            }}
            type="button"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        aria-label="Dismiss notification"
        className="shrink-0 self-start p-3 text-slate-400 transition hover:text-slate-700"
        onClick={handleDismiss}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>

      {/* Progress bar */}
      {(toast.duration ?? 6000) > 0 && (
        <div
          className={`
            toast-progress absolute bottom-0 left-1 right-0 h-0.5 origin-left
            ${bar} opacity-50
          `}
          style={
            { '--toast-duration': `${toast.duration ?? 6000}ms` } as React.CSSProperties
          }
        />
      )}
    </div>
  )
}
