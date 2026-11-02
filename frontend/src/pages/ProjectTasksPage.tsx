import { useCallback, useState } from 'react'
import { List, PanelsTopLeft } from 'lucide-react'
import { Outlet, useSearchParams } from 'react-router'

import { ProjectTaskListPage } from './ProjectTaskListPage'
import { ProjectBoardPage } from './ProjectBoardPage'

export interface ProjectTasksOutletContext {
  refreshBoard: () => void
}

export function ProjectTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const view = searchParams.get('view') === 'list' ? 'list' : 'board'
  const refreshBoard = useCallback(
    () => setRefreshKey((current) => current + 1),
    [],
  )

  function setView(nextView: 'board' | 'list') {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', nextView)
      return next
    })
  }

  return (
    <div>
      <nav aria-label="Task views" className="mb-5 flex gap-2">
        <button
          aria-pressed={view === 'board'}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'board' ? 'bg-teamsync-navy text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          onClick={() => setView('board')}
          type="button"
        >
          <PanelsTopLeft aria-hidden="true" size={16} />
          Board
        </button>
        <button
          aria-pressed={view === 'list'}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'list' ? 'bg-teamsync-navy text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          onClick={() => setView('list')}
          type="button"
        >
          <List aria-hidden="true" size={16} />
          List
        </button>
      </nav>
      {view === 'board' ? (
        <ProjectBoardPage refreshKey={refreshKey} />
      ) : (
        <ProjectTaskListPage refreshKey={refreshKey} />
      )}
      <Outlet context={{ refreshBoard } satisfies ProjectTasksOutletContext} />
    </div>
  )
}
