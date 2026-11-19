import { useState, type FormEvent } from 'react'
import { useEffect } from 'react'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { apiClient } from '../lib/api/client'

export function ProfilePage() {
  const { setUser, user } = useAuth()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<Record<string, boolean>>({})
  const [savingPreferences, setSavingPreferences] = useState(false)

  useEffect(() => {
    void apiClient.get<{ categories: Record<string, boolean> }>(
      '/notifications/preferences/',
    ).then(({ data }) => setPreferences(data.categories))
  }, [])

  if (!user) return null

  async function savePreferences() {
    setSavingPreferences(true)
    setError('')
    try {
      await apiClient.patch('/notifications/preferences/', { categories: preferences })
      setSaved(true)
    } catch (preferenceError) {
      setError(getApiErrorMessage(preferenceError))
    } finally {
      setSavingPreferences(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const avatar = form.get('avatar')
    if (!(avatar instanceof File) || avatar.size === 0) {
      form.delete('avatar')
    }
    try {
      const { data } = await apiClient.patch('/auth/me/', form)
      setUser(data)
      setSaved(true)
    } catch (saveError) {
      setError(getApiErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="max-w-2xl space-y-5">
      <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Account Settings
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Signed in as <strong className="font-semibold text-slate-800 dark:text-slate-200">{user.username}</strong> ({user.email}) ·{' '}
          {user.email_verified ? 'Verified' : 'Unverified email'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Personal Information
        </h2>
        <form className="mt-4 space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              First name
              <input
                autoComplete="given-name"
                className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                defaultValue={user.first_name}
                maxLength={150}
                name="first_name"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Last name
              <input
                autoComplete="family-name"
                className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                defaultValue={user.last_name}
                maxLength={150}
                name="last_name"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Email address
            <input
              autoComplete="email"
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              defaultValue={user.email}
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Time zone
            <input
              className="mt-1 block h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              defaultValue={user.timezone}
              maxLength={64}
              name="timezone"
              placeholder="e.g. Asia/Kolkata"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Bio
            <textarea
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              defaultValue={user.bio}
              maxLength={500}
              name="bio"
              rows={3}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Avatar Image
            <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
              JPEG, PNG, or WebP; max 5 MB.
            </span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="teamsync-file-input mt-1.5 block w-full text-xs text-slate-700 dark:text-slate-300"
              name="avatar"
              type="file"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-xs text-emerald-800 dark:text-emerald-400">
              Profile updated successfully.
            </p>
          )}
          <button
            className="teamsync-primary-button h-8 rounded-lg px-4 text-xs font-semibold shadow-2xs"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          In-App Notification Preferences
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Select which notification event categories trigger real-time alerts for your account.
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[
            ['task_assigned', 'Task assignments'],
            ['task_comment', 'Task comments'],
            ['task_mention', 'Mentions'],
            ['workspace_invitation', 'Workspace invitations'],
            ['invitation_accepted', 'Accepted invitations'],
            ['deadline_today', 'Due today'],
            ['deadline_overdue', 'Overdue tasks'],
          ].map(([key, label]) => (
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300" key={key}>
              <input
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                checked={preferences[key] !== false}
                onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </div>
        <button
          className="mt-4 h-8 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          disabled={savingPreferences}
          onClick={() => void savePreferences()}
          type="button"
        >
          {savingPreferences ? 'Saving…' : 'Save notification preferences'}
        </button>
      </div>
    </section>
  )
  )
}
