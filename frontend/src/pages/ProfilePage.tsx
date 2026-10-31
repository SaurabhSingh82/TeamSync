import { useState, type FormEvent } from 'react'

import { getApiErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/useAuth'
import { apiClient } from '../lib/api/client'

export function ProfilePage() {
  const { setUser, user } = useAuth()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!user) return null

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
            className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
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
          className="rounded-md bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  )
}
