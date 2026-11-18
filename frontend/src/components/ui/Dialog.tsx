import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  title: string
  description?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  children: ReactNode
  size?: 'medium' | 'large'
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  title,
  description,
  onClose,
  closeDisabled = false,
  children,
  size = 'medium',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
  }, [closeDisabled, onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(focusableSelector)
    const initialFocus = dialog?.querySelector<HTMLElement>('[autofocus]')
    ;(initialFocus ?? focusable?.[0] ?? dialog)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`my-auto w-full rounded-2xl bg-white p-6 shadow-2xl ${size === 'large' ? 'max-w-2xl' : 'max-w-lg'}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950" id={titleId}>
              {title}
            </h2>
            {description && (
              <div className="mt-2 text-sm leading-6 text-slate-600" id={descriptionId}>
                {description}
              </div>
            )}
          </div>
          <button
            aria-label="Close dialog"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
