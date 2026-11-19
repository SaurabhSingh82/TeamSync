import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router'

import { useAuth } from '../auth/useAuth'

export function HomePage() {
  const { user } = useAuth()

  if (user) {
    const displayName = user.first_name?.trim() || user.email.split('@')[0]

    return (
      <div className="space-y-10">
        {/* Hub Header */}
        <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-indigo-50/40 p-8 shadow-xs dark:border-slate-800 dark:from-slate-900/90 dark:via-slate-900/50 dark:to-indigo-950/20">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Real-Time Synchronized
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
                Welcome back, {displayName}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Jump straight into your active tasks, monitor workspace velocity, or collaborate with your team in real time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/workspaces/new"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus size={16} />
                New Workspace
              </Link>
              <Link
                to="/dashboard"
                className="teamsync-primary-button inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:shadow"
              >
                Open Dashboard
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </header>

        {/* Quick Launch Cards */}
        <section aria-labelledby="quick-launch-heading">
          <h2 id="quick-launch-heading" className="text-sm font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
            Quick Launch Hub
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLaunchCard
              title="Dashboard"
              description="Live view of open tasks, upcoming deadlines, and recent workspace activity."
              to="/dashboard"
              icon={<LayoutDashboard size={22} className="text-indigo-600 dark:text-indigo-400" />}
              badge="Overview"
            />
            <QuickLaunchCard
              title="Calendar & Deadlines"
              description="Interactive calendar view of sprint schedules and task due dates."
              to="/calendar"
              icon={<Calendar size={22} className="text-sky-600 dark:text-sky-400" />}
              badge="Schedule"
            />
            <QuickLaunchCard
              title="Analytics & Velocity"
              description="Deep dive into workload balance, completion rates, and productivity metrics."
              to="/analytics"
              icon={<BarChart3 size={22} className="text-emerald-600 dark:text-emerald-400" />}
              badge="Metrics"
            />
            <QuickLaunchCard
              title="Workspace Invitations"
              description="Review pending team invitations and join new workspaces instantly."
              to="/invitations"
              icon={<Mail size={22} className="text-violet-600 dark:text-violet-400" />}
              badge="Collaboration"
            />
            <QuickLaunchCard
              title="Live Notifications"
              description="Real-time alerts for task mentions, assignments, and workspace events."
              to="/notifications"
              icon={<Bell size={22} className="text-amber-600 dark:text-amber-400" />}
              badge="Updates"
            />
            <QuickLaunchCard
              title="New Workspace"
              description="Create a dedicated space for your next project, client, or engineering team."
              to="/workspaces/new"
              icon={<FolderKanban size={22} className="text-rose-600 dark:text-rose-400" />}
              badge="Admin"
            />
          </div>
        </section>

        {/* Key Features Banner */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex items-start gap-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Zap size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Live WebSocket Sync</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Invitations, tasks, and notifications arrive instantly without page refreshes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Granular Role Access</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Owner, Admin, Member, and Viewer permissions tailored per workspace.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Multi-Project Boards</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Kanban drag-and-drop, label filtering, and milestone tracking.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-16 py-4">
      {/* Landing Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-indigo-50/20 to-slate-50/50 p-8 sm:p-14 text-center shadow-xs dark:border-slate-800 dark:from-slate-900 dark:via-slate-900/60 dark:to-slate-950">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Sparkles size={14} className="text-indigo-500" />
            Next-Gen Engineering Collaboration Platform
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl lg:text-6xl">
            Where high-velocity teams{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 bg-clip-text text-transparent">
              sync, build, and ship.
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
            TeamSync combines real-time workspace collaboration, instant WebSocket notifications,
            granular access controls, and sprint telemetry in one frictionless workspace.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <Link
              to="/register"
              className="teamsync-primary-button inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-md transition hover:shadow-lg"
            >
              Get Started Free
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Zap size={24} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">Real-Time Invitations</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Receive workspace invitations instantly via live WebSocket popups with direct one-click Accept or Decline actions.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
            <ShieldCheck size={24} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">Enterprise Workspaces</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Fine-grained role hierarchy (Owner, Admin, Member, Viewer) with secure token expiration and email invitations.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
            <LayoutDashboard size={24} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">Sprint Dashboards</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Monitor accessible projects, open tasks, upcoming 7-day deadlines, and overdue tasks with real-time analytics.
          </p>
        </div>
      </section>
    </div>
  )
}

function QuickLaunchCard({
  badge,
  description,
  icon,
  title,
  to,
}: {
  badge: string
  description: string
  icon: React.ReactNode
  title: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs transition-all hover:border-indigo-300/80 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-800/80"
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="flex size-11 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 dark:border-slate-800 dark:bg-slate-800/80">
            {icon}
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {badge}
          </span>
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 transition-colors">
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        <span>Launch</span>
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  )
}
