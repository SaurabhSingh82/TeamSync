import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toast, type ToastData, type ToastVariant } from './Toast'

interface ToastContextValue {
  show: (opts: Omit<ToastData, 'id'>) => string
  dismiss: (id: string) => void
  showInvitation: (opts: {
    workspaceName: string
    inviterName: string
    role: string
    onView?: () => void
  }) => string
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
        ...prev.slice(-4), // keep max 5 visible
        { ...opts, id },
      ])
      return id
    },
    [],
  )

  const showInvitation = useCallback(
    ({
      workspaceName,
      inviterName,
      role,
      onView,
    }: {
      workspaceName: string
      inviterName: string
      role: string
      onView?: () => void
    }) => {
      return show({
        variant: 'invitation' as ToastVariant,
        title: `Workspace invitation`,
        message: `${inviterName} invited you to join "${workspaceName}" as ${role}.`,
        detail: 'Click "View" to accept or reject.',
        duration: 8000,
        action: onView
          ? { label: 'View invitation', onClick: onView }
          : undefined,
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
          className="toast-container fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3"
          role="region"
        >
          {toasts.map((t) => (
            <Toast key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
