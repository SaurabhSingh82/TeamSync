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
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        Profile and account settings
      </h1>
      <p className="mt-2 text-slate-600">
        Signed in as <span className="font-medium">{user.username}</span>.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Email status:{' '}
        {user.email_verified ? 'verified' : 'not verified; sign-in is still enabled'}
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            First name
            <input
              autoComplete="given-name"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
              defaultValue={user.first_name}
              maxLength={150}
              name="first_name"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Last name
            <input
              autoComplete="family-name"
              className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
              defaultValue={user.last_name}
              maxLength={150}
              name="last_name"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            autoComplete="email"
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
            defaultValue={user.email}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Time zone
          <input
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
            defaultValue={user.timezone}
            maxLength={64}
            name="timezone"
            placeholder="America/New_York"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Bio
          <textarea
            className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-slate-950"
            defaultValue={user.bio}
            maxLength={500}
            name="bio"
            rows={4}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Avatar
          <span className="mt-1 block text-xs font-normal text-slate-500">
            JPEG, PNG, or WebP; maximum 5 MB and 4096 × 4096 pixels.
          </span>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="teamsync-file-input mt-2 block w-full text-sm text-slate-700"
            name="avatar"
            type="file"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-emerald-800">
            Profile saved.
          </p>
        )}
        <button
          className="teamsync-primary-button rounded-md px-4 py-2.5 font-semibold"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <section className="mt-12 border-t border-slate-200 pt-6">
        <h2 className="text-xl font-semibold text-slate-950">In-app notification preferences</h2>
        <p className="mt-2 text-sm text-slate-600">Choose which notification categories are created for your account.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['task_assigned', 'Task assignments'],
            ['task_comment', 'Task comments'],
            ['task_mention', 'Mentions'],
            ['workspace_invitation', 'Workspace invitations'],
            ['invitation_accepted', 'Accepted invitations'],
            ['deadline_today', 'Due today'],
            ['deadline_overdue', 'Overdue tasks'],
          ].map(([key, label]) => (
            <label className="flex items-center gap-3 text-sm text-slate-700" key={key}>
              <input
                checked={preferences[key] !== false}
                onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </div>
        <button
          className="mt-5 rounded-md border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 disabled:opacity-60"
          disabled={savingPreferences}
          onClick={() => void savePreferences()}
          type="button"
        >
          {savingPreferences ? 'Saving…' : 'Save notification preferences'}
        </button>
      </section>
    </section>
  )
}
