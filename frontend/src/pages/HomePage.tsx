import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router'

import { useAuth } from '../auth/useAuth'

function getGreeting(name: string) {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${timeOfDay}, ${name}`
}

export function HomePage() {
  const { user } = useAuth()

  if (user) {
    const displayName = user.first_name?.trim() || user.email.split('@')[0]

    return (
      <div className="space-y-8">
        {/* Personal Executive Header */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Engineering Hub
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                {getGreeting(displayName)}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Welcome to your TeamSync command center. Jump directly into your active sprint, review team deliverables, or manage workspaces.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/workspaces/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Plus size={14} />
                New Workspace
              </Link>
              <Link
                to="/dashboard"
                className="teamsync-primary-button inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-2xs transition"
              >
                Open Dashboard
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* Primary Workspace Navigation Grid */}
        <section aria-labelledby="hub-navigation">
          <div className="flex items-center justify-between">
            <h2 id="hub-navigation" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Workspace Workflows
            </h2>
            <span className="text-xs text-slate-400">Quick launch</span>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HubCard
              title="Dashboard"
              description="Live telemetry of open tasks, upcoming 7-day deadlines, and active projects."
              to="/dashboard"
              icon={<LayoutDashboard size={18} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Sprint Calendar"
              description="Timeline schedule of task deadlines, project milestones, and sprint dates."
              to="/calendar"
              icon={<Calendar size={18} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Velocity Analytics"
              description="Comprehensive charts on workload velocity, task completion, and status balance."
              to="/analytics"
              icon={<BarChart3 size={18} className="text-slate-700 dark:text-slate-300" />}
            />
            <HubCard
              title="Invitations"
              description="Review pending team invitations and join new collaborative workspaces."
              to="/invitations"
              icon={<Mail size={18} className="text-slate-700 dark:text-slate-300" />}
            />
          </div>
        </section>

        {/* Pro Developer Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200/60 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-slate-500" />
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
            className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline dark:text-slate-100"
          >
            Open Search <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-16 py-6">
      {/* High-Craft Developer Hero */}
      <section className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>TeamSync Platform · Real-Time Engineering Collaboration</span>
        </div>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl lg:text-6xl">
          The real-time workspace for high-velocity engineering teams.
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
          Coordinate sprints, track deliverables, and synchronize workspaces with instant WebSocket updates. Built for speed, precision, and focus.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/register"
            className="teamsync-primary-button inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-2xs transition"
          >
            Get Started Free
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Sign In to Workspace
          </Link>
        </div>
      </section>

      {/* Interactive Mock Window Preview */}
      <section className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {/* Mac-style Window Titlebar */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="font-mono text-xs text-slate-400">teamsync / sprint-board</span>
            <div className="size-3" />
          </div>

          {/* Miniature Kanban Columns */}
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>To Do</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">2</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-900 dark:text-slate-100">WebSocket toast notification</span>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="text-red-600 font-semibold uppercase">Urgent</span>
                    <span>Due in 2d</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>In Progress</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">1</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Fix dark mode overscroll canvas</span>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="text-amber-600 font-semibold uppercase">High</span>
                    <span>In Review</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Completed</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] dark:bg-slate-800">14</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-medium text-slate-900 line-through text-slate-400 dark:text-slate-500">Role-based invitations & RBAC</span>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-emerald-600">
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
      <section className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <Zap size={20} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sub-millisecond Sync
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Real-time WebSocket event streaming ensures workspace invitations and task state changes arrive without polling or refreshes.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <ShieldCheck size={20} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Granular Governance
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Enterprise role-based access control with Owner, Admin, Member, and Viewer permissions configured securely per workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
          <BarChart3 size={20} className="text-slate-800 dark:text-slate-200" />
          <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sprint Telemetry
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Monitor accessible projects, open deliverables, overdue tasks, and velocity metrics through an integrated calendar and analytics suite.
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
      className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700"
    >
      <div>
        <div className="flex size-9 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/80">
          {icon}
        </div>
        <h3 className="mt-3.5 text-sm font-semibold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-200">
        <span>Open</span>
        <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  )
}
