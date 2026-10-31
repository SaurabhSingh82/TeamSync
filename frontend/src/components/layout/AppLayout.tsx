import { NavLink, Outlet } from 'react-router'

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-100 text-slate-950'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
  }`

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <NavLink
            to="/"
            className="text-lg font-semibold tracking-tight text-slate-950"
          >
            TeamSync
          </NavLink>
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            <NavLink to="/" end className={linkClassName}>
              Home
            </NavLink>
            <NavLink to="/dashboard" className={linkClassName}>
              Dashboard
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}
