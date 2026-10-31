import { Link } from 'react-router'

export function HomePage() {
  return (
    <section className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
        Engineering foundation
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
        Welcome to TeamSync
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        The application shell is ready. Team and project features will be added
        in their planned implementation modules.
      </p>
      <Link
        to="/dashboard"
        className="mt-8 inline-flex rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        View placeholder
      </Link>
    </section>
  )
}
