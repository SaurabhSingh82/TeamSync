import { LoaderCircle } from 'lucide-react'
import teamsyncLogo from '../../assets/teamsync-logo.svg'

export function PageLoader() {
  return (
    <div
      aria-label="Loading page"
      className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-slate-100 dark:bg-slate-800"
      role="progressbar"
    >
      <div className="h-full w-full origin-left animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />
    </div>
  )
}

export function CenteredLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center p-8 text-center" role="status">
      <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <img alt="" className="size-8 object-contain" src={teamsyncLogo} />
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs">
          <LoaderCircle className="animate-spin" size={12} />
        </span>
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{message}</p>
      <p className="mt-1 text-xs text-slate-400">Please wait a moment</p>
    </div>
  )
}

export function InlineLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-4 text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
      <LoaderCircle className="animate-spin text-indigo-600" size={16} />
      <span>{message}</span>
    </div>
  )
}

export function SkeletonBox({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/60 ${className}`}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-7" role="status" aria-label="Loading dashboard metrics">
      {/* Metrics skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            key={i}
          >
            <SkeletonBox className="size-10" />
            <SkeletonBox className="mt-4 h-4 w-28" />
            <SkeletonBox className="mt-2 h-8 w-16" />
            <SkeletonBox className="mt-2 h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Main 2-column skeleton */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <SkeletonBox className="h-6 w-40" />
          <div className="mt-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div className="flex items-center justify-between" key={i}>
                <div className="space-y-1.5">
                  <SkeletonBox className="h-4 w-48" />
                  <SkeletonBox className="h-3 w-24" />
                </div>
                <SkeletonBox className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <SkeletonBox className="h-6 w-36" />
          <div className="mt-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div className="space-y-1.5" key={i}>
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
