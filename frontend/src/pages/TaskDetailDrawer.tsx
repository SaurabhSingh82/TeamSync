import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router'

import { TaskDetailPage } from './TaskDetailPage'
import type { ProjectTasksOutletContext } from './ProjectTasksPage'

export function TaskDetailDrawer() {
  const { workspaceId, projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { refreshBoard } = useOutletContext<ProjectTasksOutletContext>()
  const closeButton = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    refreshBoard()
    navigate({
      pathname: `/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      search: location.search,
    })
  }, [location.search, navigate, projectId, refreshBoard, workspaceId])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = closeButton.current?.closest('[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (!focusable.length) {
        event.preventDefault()
        closeButton.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [close])

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Dismiss task details"
        className="absolute inset-0 size-full cursor-default bg-slate-950/45 backdrop-blur-sm"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label="Task details"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
        role="dialog"
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex justify-end border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:-mt-6 sm:px-6">
          <button
            aria-label="Close task details"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            onClick={close}
            ref={closeButton}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <TaskDetailPage onTaskChanged={refreshBoard} />
      </aside>
    </div>
  )
}
