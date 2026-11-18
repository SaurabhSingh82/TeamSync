import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search, Trash2, Users } from 'lucide-react'
import { useParams } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { useProjectContext } from '../components/projects/projectContext'
import { ConfirmDialog } from '../components/workspaces/ConfirmDialog'
import {
  addProjectMember,
  listAllProjectMembers,
  removeProjectMember,
  updateProjectMember,
} from '../projects/api'
import { canManageProject } from '../projects/permissions'
import type { ProjectMember, ProjectRole } from '../projects/types'
import { listWorkspaceMembers } from '../workspaces/api'
import type { WorkspaceMember } from '../workspaces/types'

type PendingRemoval = ProjectMember | null

const roles: { value: ProjectRole; label: string }[] = [
  { value: 'manager', label: 'Project Manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]

function displayName(member: Pick<ProjectMember, 'first_name' | 'last_name' | 'username'>) {
  return [member.first_name, member.last_name].filter(Boolean).join(' ') || member.username
}

export function ProjectMembersPage() {
  const { project, refresh } = useProjectContext()
  const { workspaceId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [loadedKey, setLoadedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>(null)
  const requestKey = `${project.id}:${workspaceId}`
  const canManage = canManageProject(project)

  useEffect(() => {
    let active = true
    if (!workspaceId) return
    void Promise.all([
      listAllProjectMembers(project.id),
      listWorkspaceMembers(workspaceId),
    ])
      .then(([projectItems, workspaceItems]) => {
        if (active) {
          setMembers(projectItems)
          setWorkspaceMembers(workspaceItems)
          setError('')
          setLoadedKey(requestKey)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setMembers([])
          setWorkspaceMembers([])
          setError(getApiErrorMessage(loadError))
          setLoadedKey(requestKey)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [project.id, workspaceId, requestKey])

  const refreshMembers = useCallback(async () => {
    const updated = await listAllProjectMembers(project.id)
    setMembers(updated)
    await refresh()
  }, [project.id, refresh])

  const eligibleMembers = useMemo(() => {
    const projectUserIds = new Set(members.map((member) => member.user_id))
    return workspaceMembers.filter((member) => !projectUserIds.has(member.user_id))
  }, [members, workspaceMembers])
  const managerCount = members.filter((member) => member.role === 'manager').length
  const filteredMembers = members.filter((member) => {
    const value = `${displayName(member)} ${member.username}`.toLowerCase()
    return value.includes(search.trim().toLowerCase())
  })

  async function handleAdd(userId: string, role: ProjectRole) {
    setError('')
    setNotice('')
    await addProjectMember(project.id, { user_id: userId, role })
    setShowAddDialog(false)
    setNotice('Project member added.')
    try {
      await refreshMembers()
    } catch (refreshError) {
      setError(`The member was added, but project details could not be refreshed: ${getApiErrorMessage(refreshError)}`)
    }
  }

  async function handleRoleChange(member: ProjectMember, role: ProjectRole) {
    setError('')
    setNotice('')
    setBusyAction(member.id)
    try {
      const updated = await updateProjectMember(project.id, member.id, role)
      setMembers((current) => current.map((item) => item.id === member.id ? updated : item))
      setNotice(`${displayName(member)}'s project role was updated.`)
      try {
        await refresh()
      } catch (refreshError) {
        setError(`The role changed, but the project header could not be refreshed: ${getApiErrorMessage(refreshError)}`)
      }
    } catch (changeError) {
      setError(getApiErrorMessage(changeError))
    } finally {
      setBusyAction('')
    }
  }

  async function handleRemove() {
    if (!pendingRemoval) return
    setError('')
    setBusyAction(pendingRemoval.id)
    const removedMember = pendingRemoval
    try {
      await removeProjectMember(project.id, removedMember.id)
    } catch (removeError) {
      setError(getApiErrorMessage(removeError))
      setPendingRemoval(null)
      setBusyAction('')
      return
    }
    setPendingRemoval(null)
    setNotice(`${displayName(removedMember)} was removed from the project.`)
    try {
      await refreshMembers()
    } catch (refreshError) {
      setError(`The member was removed, but project details could not be refreshed: ${getApiErrorMessage(refreshError)}`)
    } finally {
      setBusyAction('')
    }
  }

  const stale = loadedKey !== requestKey

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Project members</h2>
          <p className="mt-1 text-sm text-slate-600">
            Add workspace members and assign their project-level role.
          </p>
        </div>
        {canManage && (
          <Button
            disabled={eligibleMembers.length === 0 || loading}
            onClick={() => setShowAddDialog(true)}
          >
            <Plus aria-hidden="true" size={17} />
            Add member
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}

      <label className="relative mt-6 block max-w-md">
        <span className="sr-only">Search project members</span>
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search members"
          type="search"
          value={search}
        />
      </label>

      {loading || stale ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500" role="status">
          Loading members…
        </p>
      ) : filteredMembers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Users aria-hidden="true" className="mx-auto text-slate-400" size={28} />
          <h3 className="mt-4 font-semibold text-slate-900">
            {search ? 'No matching members' : 'No project members'}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {search ? 'Try another name or username.' : 'Add people from this workspace to collaborate on the project.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1fr)_220px_100px] gap-4 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Member</span>
            <span>Project role</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filteredMembers.map((member) => {
              const isSelf = member.user_id === user?.id
              return (
                <li className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_220px_100px] md:items-center" key={member.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar alt={displayName(member)} name={displayName(member)} src={member.avatar_url} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {displayName(member)} {isSelf && <span className="font-normal text-slate-500">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">@{member.username}</p>
                    </div>
                  </div>
                  <label className="text-xs font-medium text-slate-500">
                    <span className="sr-only">Role for {displayName(member)}</span>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-50"
                      disabled={!canManage || busyAction === member.id}
                      onChange={(event) => void handleRoleChange(member, event.target.value as ProjectRole)}
                      value={member.role}
                    >
                      {roles.map((role) => {
                        const cannotPromoteSelf =
                          isSelf && member.role !== 'manager' && role.value === 'manager'
                        const cannotRemoveLastManager =
                          member.role === 'manager' && managerCount <= 1 && role.value !== 'manager'
                        return (
                          <option
                            disabled={cannotPromoteSelf || cannotRemoveLastManager}
                            key={role.value}
                            value={role.value}
                          >
                            {role.label}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <div className="flex justify-end">
                    {canManage && (
                      <Button
                        aria-label={`Remove ${displayName(member)} from project`}
                        disabled={busyAction === member.id || (member.role === 'manager' && managerCount <= 1)}
                        onClick={() => setPendingRemoval(member)}
                        type="button"
                        variant="quiet"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                        <span className="md:sr-only">Remove</span>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {showAddDialog && (
        <AddProjectMemberDialog
          currentUserId={user?.id ?? ''}
          members={eligibleMembers}
          onClose={() => setShowAddDialog(false)}
          onSave={handleAdd}
        />
      )}
      {pendingRemoval && (
        <ConfirmDialog
          busy={busyAction === pendingRemoval.id}
          confirmLabel="Remove member"
          description={<>Remove <strong>{displayName(pendingRemoval)}</strong> from this project? Their workspace access will not change.</>}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => void handleRemove()}
          title="Remove project member?"
        />
      )}
    </section>
  )
}

function AddProjectMemberDialog({
  members,
  currentUserId,
  onClose,
  onSave,
}: {
  members: WorkspaceMember[]
  currentUserId: string
  onClose: () => void
  onSave: (userId: string, role: ProjectRole) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [role, setRole] = useState<ProjectRole>('member')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const filtered = members.filter((member) =>
    `${displayName(member)} ${member.username}`.toLowerCase().includes(search.trim().toLowerCase()),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId) return
    setError('')
    setSaving(true)
    try {
      await onSave(selectedId, role)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      closeDisabled={saving}
      description="Only existing members of this workspace can be added to a project."
      onClose={onClose}
      title="Add a project member"
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="relative block">
          <span className="sr-only">Search workspace members</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            autoFocus
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workspace members"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Workspace members" className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200" role="group">
          {filtered.length ? filtered.map((member) => {
            const name = displayName(member)
            const selected = selectedId === member.user_id
            return (
              <button
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${selected ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                key={member.id}
                onClick={() => setSelectedId(member.user_id)}
                type="button"
              >
                <Avatar alt={name} name={name} src={member.avatar_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
                  <span className="block truncate text-xs text-slate-500">@{member.username}</span>
                </span>
                <span className={`size-4 rounded-full border ${selected ? 'border-teamsync-navy bg-teamsync-navy ring-2 ring-white' : 'border-slate-300'}`} />
              </button>
            )
          }) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {members.length ? 'No workspace members match your search.' : 'Everyone in this workspace is already on the project.'}
            </p>
          )}
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Project role
          <select
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
            onChange={(event) => setRole(event.target.value as ProjectRole)}
            value={role}
          >
            {roles.map((item) => (
              <option
                disabled={selectedId === currentUserId && item.value === 'manager'}
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancel</Button>
          <Button disabled={saving || !selectedId} type="submit">{saving ? 'Adding…' : 'Add member'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
