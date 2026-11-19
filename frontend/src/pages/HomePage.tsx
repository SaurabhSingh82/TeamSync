import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '../auth/useAuth'
import { listWorkspaces } from '../workspaces/api'
import type { Workspace } from '../workspaces/types'
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../workspaces/activeWorkspace'

function getGreeting(name: string) {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${timeOfDay}, ${name}`
}

function getFormattedDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date())
}

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')

  useEffect(() => {
    if (!user) return
    let active = true
    setLoadingWorkspaces(true)
    void listWorkspaces()
      .then((items) => {
        if (!active) return
        setWorkspaces(items)
        const stored = getStoredWorkspaceId()
        if (stored && items.some((w) => w.id === stored)) {
          setSelectedWorkspaceId(stored)
        } else if (items.length > 0) {
          setSelectedWorkspaceId(items[0].id)
        }
      })
      .catch(() => {
        // graceful fallback
      })
      .finally(() => {
        if (active) setLoadingWorkspaces(false)
      })
    return () => {
      active = false
    }
  }, [user])

  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0]

  if (user) {
    const displayName = user.first_name?.trim() || user.email.split('@')[0]

    return (
      <div className="space-y-6">
        {/* Compact Executive Header */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                  Engineering Hub · {getFormattedDate()}
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                {getGreeting(displayName)}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connected to live telemetry. Jump straight to tasks or manage your active workspaces.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/workspaces/new"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Plus size={13} />
                New Workspace
              </Link>
              <Link
                to="/dashboard"
                className="teamsync-primary-button inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-2xs transition"
              >
                Open Dashboard
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* Smart Workspace Switcher Card */}
          {workspaces.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Workspace:</span>
                <div className="relative">
                  <select
                    aria-label="Select active workspace"
                    value={selectedWorkspaceId}
                    onChange={(e) => {
                      const newId = e.target.value
                      setSelectedWorkspaceId(newId)
                      setStoredWorkspaceId(newId)
                    }}
                    className="h-7 cursor-pointer appearance-none rounded-md border border-slate-200 bg-slate-50 pl-2.5 pr-7 text-xs font-semibold text-slate-800 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.current_user_role})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {activeWorkspace && (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/workspaces/${activeWorkspace.id}/projects`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:underline dark:text-slate-300 dark:hover:text-indigo-400"
                  >
                    <FolderKanban size={13} />
                    Projects
                  </Link>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <Link
                    to={`/workspaces/${activeWorkspace.id}/members`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:underline dark:text-slate-300 dark:hover:text-indigo-400"
                  >
                    <Users size={13} />
                    Members
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Workspace Navigation Grid */}
        <section aria-labelledby="hub-navigation">
          <div className="flex items-center justify-between">
            <h2 id="hub-navigation" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Workspace Workflows
            </h2>
            <span className="text-[11px] text-slate-400">Quick launch</span>
          </div>

          <div className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HubCard
              title="Dashboard"
              description="Live telemetry of open tasks, upcoming deadlines, and active projects."
              to="/dashboard"
              icon={<LayoutDashboard size={16} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Sprint Calendar"
              description="Timeline schedule of task deadlines, project milestones, and sprint dates."
              to="/calendar"
              icon={<Calendar size={16} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Velocity Analytics"
              description="Burndown velocity, task completion rates, and workload balance."
              to="/analytics"
              icon={<BarChart3 size={16} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Invitations"
              description="Review pending team invitations and join new collaborative workspaces."
              to="/invitations"
              icon={<Mail size={16} className="text-slate-700 dark:text-slate-300" />}
            />
          </div>
        </section>

        {/* Pro Developer Bar */}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={13} className="text-slate-500" />
            <span>
              Pro Tip: Press{' '}
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                /
              </kbd>{' '}
              anywhere to quickly search projects, tasks, and teammates.
            </span>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:underline dark:text-slate-200"
          >
            Open Search <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-12 py-4">
      {/* High-Craft Developer Hero */}
      <section className="relative mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>TeamSync Platform · Real-Time Engineering Collaboration</span>
        </div>

        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl lg:text-5xl">
          The real-time workspace for high-velocity engineering teams.
        </h1>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
          Coordinate sprints, track deliverables, and synchronize workspaces with instant WebSocket updates. Built for speed, precision, and focus.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to="/register"
            className="teamsync-primary-button inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold shadow-2xs transition"
          >
            Get Started Free
            <ArrowRight size={13} />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Sign In to Workspace
          </Link>
        </div>
      </section>

      {/* Interactive Mock Window Preview */}
      <section className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
          {/* Mac-style Window Titlebar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-400" />
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="size-2 rounded-full bg-emerald-400" />
            </div>
            <span className="font-mono text-[11px] text-slate-400">teamsync / sprint-board</span>
            <div className="size-2" />
          </div>

          {/* Miniature Kanban Columns */}
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>To Do</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">2</span>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="rounded-md border border-slate-200/80 bg-white p-2 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-900 dark:text-slate-100">WebSocket toast notification</span>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-bold text-red-600 uppercase">Urgent</span>
                    <span>Due in 2d</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>In Progress</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">1</span>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="rounded-md border border-slate-200/80 bg-white p-2 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Fix dark mode overscroll canvas</span>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-bold text-amber-600 uppercase">High</span>
                    <span>In Review</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Completed</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">14</span>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="rounded-md border border-slate-200/80 bg-white p-2 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-400 line-through dark:text-slate-500">Role-based invitations & RBAC</span>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-emerald-600">
                    <span>Verified</span>
                    <span>Done</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Focused Feature Pillars */}
      <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <Zap size={18} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Sub-millisecond Sync
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Real-time WebSocket event streaming ensures workspace invitations and task state changes arrive without polling.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <ShieldCheck size={18} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Granular Governance
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Enterprise role-based access control with Owner, Admin, Member, and Viewer permissions configured securely.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <BarChart3 size={18} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Sprint Telemetry
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Monitor accessible projects, open deliverables, overdue tasks, and velocity metrics through an integrated suite.
          </p>
        </div>
      </section>
    </div>
  )
}

function HubCard({
  description,
  icon,
  title,
  to,
}: {
  description: string
  icon: React.ReactNode
  title: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700"
    >
      <div>
        <div className="flex size-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80">
          {icon}
        </div>
        <h3 className="mt-3 text-xs font-semibold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 sm:text-sm">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="mt-3.5 flex items-center gap-1 text-xs font-semibold text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200">
        <span>Open</span>
        <ArrowUpRight size={12} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  )
}
