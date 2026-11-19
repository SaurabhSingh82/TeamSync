import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'

import { getApiErrorMessage } from '../auth/errors'
import { getCalendarEvents } from '../dashboard/api'
import type { CalendarEvent } from '../dashboard/types'
import { formatDate } from '../projects/format'

type CalendarView = 'month' | 'week' | 'day'

function dateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, count: number) {
  const result = new Date(value)
  result.setDate(result.getDate() + count)
  return result
}

function startOfWeek(value: Date) {
  const result = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const weekday = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - weekday)
  return result
}

function calendarRange(view: CalendarView, cursor: Date) {
  if (view === 'day') return { start: cursor, end: cursor }
  if (view === 'week') {
    const start = startOfWeek(cursor)
    return { start, end: addDays(start, 6) }
  }
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = startOfWeek(firstOfMonth)
  return { start, end: addDays(start, 41) }
}

const eventLabels: Record<CalendarEvent['event_type'], string> = {
  task_start: 'Task starts',
  task_deadline: 'Task deadline',
  project_start: 'Project starts',
  project_deadline: 'Project deadline',
  milestone_due: 'Milestone due',
}

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const range = useMemo(() => calendarRange(view, cursor), [view, cursor])
  const start = dateKey(range.start)
  const end = dateKey(range.end)

  useEffect(() => {
    let active = true
    void getCalendarEvents(start, end)
      .then((result) => {
        if (!active) return
        setEvents(result.results)
        setPage(1)
        setHasMore(result.next !== null)
        setError('')
      })
      .catch((loadError: unknown) => {
        if (active) setError(getApiErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [start, end])

  const displayedDays = useMemo(() => {
    const length = view === 'month' ? 42 : view === 'week' ? 7 : 1
    return Array.from({ length }, (_, index) => addDays(range.start, index))
  }, [range.start, view])
  const eventsByDate = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const current = groups.get(event.event_date) ?? []
      current.push(event)
      groups.set(event.event_date, current)
    }
    return groups
  }, [events])

  function moveCursor(direction: -1 | 1) {
    setLoading(true)
    setCursor((current) => {
      if (view === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + direction, 1)
      }
      return addDays(current, direction * (view === 'week' ? 7 : 1))
    })
  }

  async function loadMore() {
    setLoading(true)
    setError('')
    try {
      const result = await getCalendarEvents(start, end, page + 1)
      setEvents((current) => [...current, ...result.results])
      setPage((current) => current + 1)
      setHasMore(result.next !== null)
    } catch (loadError) {
      setError(getApiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  const heading = view === 'day'
    ? formatDate(dateKey(cursor))
    : view === 'week'
      ? `${formatDate(start)} – ${formatDate(end)}`
      : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <section className="space-y-4">
      <header className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" size={16} className="text-slate-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Sprint Schedule
          </p>
        </div>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Calendar
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Task start dates, deadlines, and project milestones across accessible workspaces.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-1.5">
          <button aria-label="Previous period" className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => moveCursor(-1)} type="button">
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <button className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => { setLoading(true); setCursor(new Date()) }} type="button">
            Today
          </button>
          <button aria-label="Next period" className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => moveCursor(1)} type="button">
            <ChevronRight aria-hidden="true" size={16} />
          </button>
          <h2 className="ml-2 text-sm font-bold text-slate-900 dark:text-slate-100">{heading}</h2>
        </div>
        <div aria-label="Calendar view" className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group">
          {(['month', 'week', 'day'] as const).map((option) => (
            <button
              aria-pressed={view === option}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${view === option ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
              key={option}
              onClick={() => { setLoading(true); setView(option) }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        {view !== 'day' && (
          <div className="grid grid-cols-7 border-b border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <p className="px-2 py-2 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400" key={day}>
                {day}
              </p>
            ))}
          </div>
        )}
        <div className={view === 'day' ? 'grid grid-cols-1' : 'grid grid-cols-7'}>
          {displayedDays.map((day) => {
            const key = dateKey(day)
            const dayEvents = eventsByDate.get(key) ?? []
            const isOutsideMonth = view === 'month' && day.getMonth() !== cursor.getMonth()
            const isToday = key === dateKey(new Date())
            const visibleEvents = view === 'month' ? dayEvents.slice(0, 3) : dayEvents
            return (
              <section
                aria-label={day.toLocaleDateString(undefined, { dateStyle: 'full' })}
                className={`min-h-24 border-b border-r border-slate-100 p-1.5 dark:border-slate-800/80 sm:min-h-32 sm:p-2 ${isOutsideMonth ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''} ${view === 'day' ? 'min-h-80' : ''}`}
                key={key}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${isToday ? 'bg-emerald-600 text-white' : isOutsideMonth ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}`}>
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && <span className="text-[10px] text-slate-400 dark:text-slate-500">{dayEvents.length}</span>}
                </div>
                <ul className="space-y-1">
                  {visibleEvents.map((event) => (
                    <li key={`${event.event_type}:${event.object_id}:${event.event_date}`}>
                      <Link
                        className={`block truncate rounded px-1.5 py-0.5 text-[10px] leading-4 hover:underline sm:text-xs ${
                          event.event_type.includes('deadline')
                            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                            : event.event_type.includes('start')
                              ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                        title={`${eventLabels[event.event_type]}: ${event.event_title}`}
                        to={event.event_type.startsWith('task_')
                          ? `/workspaces/${event.event_workspace_id}/projects/${event.event_project_id}/tasks/${event.object_id}`
                          : `/workspaces/${event.event_workspace_id}/projects/${event.event_project_id}`}
                      >
                        <span className="hidden sm:inline">{eventLabels[event.event_type]} · </span>
                        {event.event_title}
                      </Link>
                    </li>
                  ))}
                  {view === 'month' && dayEvents.length > visibleEvents.length && (
                    <li className="px-1 text-[10px] text-slate-500 dark:text-slate-400">+{dayEvents.length - visibleEvents.length} more</li>
                  )}
                </ul>
              </section>
            )
          })}
        </div>
        {loading && (
          <p className="flex items-center justify-center gap-2 border-t border-slate-100 p-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
            Updating calendar...
          </p>
        )}
      </div>
      {hasMore && !loading && (
        <button className="min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => void loadMore()} type="button">
          Load more events
        </button>
      )}
      {!loading && events.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No project dates or task deadlines in this period.
        </p>
      )}
    </section>
  )
}
