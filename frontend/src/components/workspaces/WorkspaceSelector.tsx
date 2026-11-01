import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { getApiErrorMessage } from '../../auth/errors'
import { listWorkspaces } from '../../workspaces/api'
import type { Workspace } from '../../workspaces/types'

export function WorkspaceSelector({
  userId,
  selectId = 'workspace-selector',
}: {
  userId: string
  selectId?: string
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const routeWorkspaceId = location.pathname.match(/^\/workspaces\/([^/]+)/)?.[1]
  const activeWorkspaceId = routeWorkspaceId === 'new' ? '' : routeWorkspaceId ?? ''
  const requestKey = `${userId}:${location.pathname}`
  const loading = loadedKey !== requestKey

  useEffect(() => {
    let active = true
    void listWorkspaces()
      .then((items) => {
        if (active) {
          setWorkspaces(items)
          setError('')
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setWorkspaces([])
          setError(getApiErrorMessage(loadError))
        }
      })
      .then(() => {
        if (active) setLoadedKey(requestKey)
      })
    return () => {
      active = false
    }
  }, [requestKey, userId])

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="sr-only" htmlFor={selectId}>
        Switch workspace
      </label>
      <select
        className="min-w-0 max-w-48 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teamsync-navy"
        disabled={loading || workspaces.length === 0}
        id={selectId}
        onChange={(event) => {
          if (event.target.value) navigate(`/workspaces/${event.target.value}`)
        }}
        value={activeWorkspaceId}
      >
        <option value="">
          {loading
            ? 'Loading workspaces…'
            : workspaces.length
              ? 'Select workspace'
              : 'No workspaces'}
        </option>
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} · {workspace.current_user_role}
          </option>
        ))}
      </select>
      <Link
        className="hidden whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-teamsync-navy hover:bg-slate-100 lg:inline-flex"
        to="/workspaces/new"
      >
        New workspace
      </Link>
      {error && (
        <span className="max-w-40 text-xs text-red-700" role="alert">
          Workspace list unavailable: {error}
        </span>
      )}
    </div>
  )
}
