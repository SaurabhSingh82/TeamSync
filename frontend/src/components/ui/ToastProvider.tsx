import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toast, type InvitationActionData, type ToastData, type ToastVariant } from './Toast'

export type ShowInvitationOptions = InvitationActionData

interface ToastContextValue {
  show: (opts: Omit<ToastData, 'id'>) => string
  dismiss: (id: string) => void
  showInvitation: (opts: ShowInvitationOptions) => string
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

let _toastIdCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (opts: Omit<ToastData, 'id'>): string => {
      const id = `toast-${++_toastIdCounter}`
      setToasts((prev) => [
        ...prev.slice(-3), // keep max 4 visible
        { ...opts, id },
      ])
      return id
    },
    [],
  )

  const showInvitation = useCallback(
    (invitation: ShowInvitationOptions) => {
      return show({
        variant: 'invitation' as ToastVariant,
        title: `Workspace invitation`,
        message: `${invitation.inviterName} invited you to join "${invitation.workspaceName}" as ${invitation.role}.`,
        duration: 30000, // 30s for interactive decision
        invitation,
      })
    },
    [show],
  )

  return (
    <ToastContext.Provider value={{ show, dismiss, showInvitation }}>
      {children}
      {createPortal(
        <div
          aria-label="Notifications"
          className="toast-container fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 pointer-events-none"
          role="region"
        >
          {toasts.map((t) => (
            <div className="pointer-events-auto" key={t.id}>
              <Toast toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
