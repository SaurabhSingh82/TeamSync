import { useEffect, useRef, useState } from 'react'
import { Bell, Check, X, Mail, AlertTriangle, Info } from 'lucide-react'

export type ToastVariant = 'info' | 'success' | 'warning' | 'invitation'

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
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Enter animation frame
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const dur = toast.duration ?? 6000
    if (dur <= 0) return
    timerRef.current = window.setTimeout(() => handleDismiss(), dur)
    return () => window.clearTimeout(timerRef.current)
  }, [toast.duration]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    setExiting(true)
    window.setTimeout(() => onDismiss(toast.id), 320)
  }

  const { bar, icon, iconBg, Ring } = VARIANT_STYLES[toast.variant]

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        toast-item
        relative flex w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl
        border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl
        transition-all duration-300 ease-out
        ${visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
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
