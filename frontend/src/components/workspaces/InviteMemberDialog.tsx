import { useState, type FormEvent } from 'react'
import { Check, Mail, MessageSquare, Shield, User, UserPlus, Users, X } from 'lucide-react'

import { getApiErrorMessage } from '../../auth/errors'
import type {
  WorkspaceInvitableRole,
  WorkspaceRole,
} from '../../workspaces/types'
import { useToast } from '../ui/ToastProvider'

interface InviteMemberDialogProps {
  role: WorkspaceRole
  busy: boolean
  onInvite: (input: {
    email: string
    role: WorkspaceInvitableRole
    message: string
  }) => Promise<void>
}

interface RoleOption {
  value: WorkspaceInvitableRole
  label: string
  desc: string
  icon: typeof User
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'member',
    label: 'Member',
    desc: 'Can create and edit projects, tasks, and comments.',
    icon: User,
  },
  {
    value: 'admin',
    label: 'Admin',
    desc: 'Can manage workspace members, settings, and all projects.',
    icon: Shield,
  },
  {
    value: 'viewer',
    label: 'Viewer',
    desc: 'Read-only access to view projects, boards, and tasks.',
    icon: Users,
  },
]

export function InviteMemberDialog({
  role,
  busy,
  onInvite,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<WorkspaceInvitableRole>('member')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const { show } = useToast()

  const availableRoles = ROLE_OPTIONS.filter((opt) => {
    if (opt.value === 'admin') return role === 'owner'
    return true
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await onInvite({
        email: email.trim(),
        role: selectedRole,
        message: message.trim(),
      })
      show({
        variant: 'success',
        title: 'Invitation Sent',
        message: `An invitation was sent to ${email.trim()} as ${selectedRole}.`,
        duration: 4000,
      })
      setEmail('')
      setMessage('')
      setSelectedRole('member')
      setOpen(false)
    } catch (inviteError) {
      setError(getApiErrorMessage(inviteError))
    }
  }

  function handleClose() {
    if (!busy) {
      setError('')
      setOpen(false)
    }
  }

  return (
    <div>
      <button
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] disabled:opacity-50"
        onClick={() => setOpen(true)}
        type="button"
      >
        <UserPlus aria-hidden="true" size={16} />
        <span>Invite member</span>
      </button>

      {open && (
        <div
          aria-label="Modal backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <section
            aria-labelledby="invite-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl"
            role="dialog"
          >
            {/* ── Dialog Header ── */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <UserPlus aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2
                    className="text-lg font-bold tracking-tight text-slate-950"
                    id="invite-dialog-title"
                  >
                    Invite to workspace
                  </h2>
                  <p className="text-xs text-slate-500">
                    Invite colleagues to collaborate in real time.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close dialog"
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={handleClose}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            {/* ── Form ── */}
            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Email address <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Mail aria-hidden="true" size={16} />
                  </span>
                  <input
                    autoComplete="email"
                    autoFocus
                    className="block w-full rounded-xl border border-slate-300 bg-white pl-9.5 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    name="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    type="email"
                    value={email}
                  />
                </div>
              </div>

              {/* Role Selection (Sleek cards) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Workspace role <span className="text-rose-500">*</span>
                </label>
                <div className="mt-1.5 grid gap-2">
                  {availableRoles.map((opt) => {
                    const isSelected = selectedRole === opt.value
                    const Icon = opt.icon
                    return (
                      <button
                        className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                            : 'border-slate-200 bg-white hover:bg-slate-50/70'
                        }`}
                        key={opt.value}
                        onClick={() => setSelectedRole(opt.value)}
                        type="button"
                      >
                        <span
                          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {opt.label}
                            </span>
                            {isSelected && (
                              <Check aria-hidden="true" className="text-indigo-600" size={14} />
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Personal Message */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Personal message <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">{message.length}/500</span>
                </div>
                <div className="relative mt-1.5">
                  <textarea
                    className="block min-h-20 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    maxLength={500}
                    name="message"
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Hey! Join our workspace so we can coordinate our sprint tasks."
                    rows={2}
                    value={message}
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700" role="alert">
                  {error}
                </p>
              )}

              {/* ── Dialog Actions ── */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  disabled={busy}
                  onClick={handleClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] disabled:opacity-60"
                  disabled={busy || !email.trim()}
                  type="submit"
                >
                  {busy ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
