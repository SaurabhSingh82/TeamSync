import { Link } from 'react-router'

import { useAuth } from '../auth/useAuth'

export function HomePage() {
  const { user } = useAuth()

  return (
    <section className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
        Engineering foundation
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        Welcome to TeamSync
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        Create a workspace to bring your team together, manage members, and set
        access roles in one shared space.
      </p>
      {user ? (
        <Link
          to="/workspaces/new"
          className="mt-8 inline-flex rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Create a workspace
        </Link>
      ) : (
        <Link
          to="/register"
          className="mt-8 inline-flex rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Get started
        </Link>
      )}
    </section>
  )
}
