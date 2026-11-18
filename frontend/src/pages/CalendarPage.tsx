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
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teamsync-navy">
            <CalendarDays aria-hidden="true" size={20} />
            <p className="text-sm font-semibold">Dates across your projects</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Calendar</h1>
          <p className="mt-2 text-sm text-slate-600">Task start dates, deadlines, and project dates you are allowed to view.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button aria-label="Previous period" className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => moveCursor(-1)} type="button">
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setLoading(true); setCursor(new Date()) }} type="button">
            Today
          </button>
          <button aria-label="Next period" className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => moveCursor(1)} type="button">
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          <h2 className="ml-2 text-lg font-semibold text-slate-900">{heading}</h2>
        </div>
        <div aria-label="Calendar view" className="flex rounded-lg border border-slate-200 p-1" role="group">
          {(['month', 'week', 'day'] as const).map((option) => (
            <button
              aria-pressed={view === option}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${view === option ? 'bg-teamsync-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              key={option}
              onClick={() => { setLoading(true); setView(option) }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {view !== 'day' && (
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
              <p className="px-2 py-3 text-center text-xs font-semibold text-slate-500 sm:text-sm" key={day}>
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day.slice(0, 1)}</span>
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
                className={`min-h-28 border-b border-r border-slate-100 p-1.5 sm:min-h-36 sm:p-2 ${isOutsideMonth ? 'bg-slate-50/70' : ''} ${view === 'day' ? 'min-h-80' : ''}`}
                key={key}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className={`grid size-7 place-items-center rounded-full text-xs font-medium ${isToday ? 'bg-teamsync-navy text-white' : isOutsideMonth ? 'text-slate-400' : 'text-slate-700'}`}>
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && <span className="text-[10px] text-slate-400">{dayEvents.length}</span>}
                </div>
                <ul className="space-y-1">
                  {visibleEvents.map((event) => (
                    <li key={`${event.event_type}:${event.object_id}:${event.event_date}`}>
                      <Link
                        className={`block truncate rounded-md px-1.5 py-1 text-[10px] leading-4 hover:underline sm:text-xs ${event.event_type.includes('deadline') ? 'bg-amber-50 text-amber-900' : event.event_type.includes('start') ? 'bg-blue-50 text-blue-900' : 'bg-slate-100 text-slate-700'}`}
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
                    <li className="px-1 text-[10px] text-slate-500">+{dayEvents.length - visibleEvents.length} more</li>
                  )}
                </ul>
              </section>
            )
          })}
        </div>
        {loading && (
          <p className="flex items-center justify-center gap-2 border-t border-slate-100 p-3 text-sm text-slate-500">
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
