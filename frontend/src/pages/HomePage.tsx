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
          className="teamsync-primary-button mt-8 inline-flex rounded-md px-4 py-2.5 text-sm font-semibold transition"
        >
          Create a workspace
        </Link>
      ) : (
        <Link
          to="/register"
          className="teamsync-primary-button mt-8 inline-flex rounded-md px-4 py-2.5 text-sm font-semibold transition"
        >
          Get started
        </Link>
      )}
    </section>
  )
}
