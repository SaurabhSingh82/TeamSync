import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export default function globalSetup() {
  const frontendDirectory = fileURLToPath(new URL('../', import.meta.url))
  const repositoryRoot = resolve(frontendDirectory, '..')
  const backendDirectory = resolve(repositoryRoot, 'backend')
  const localPython = resolve(repositoryRoot, '.venv', 'Scripts', 'python.exe')
  const python = process.env.PYTHON ??
    (process.platform === 'win32' && existsSync(localPython) ? localPython : 'python')
  const databaseFile = resolve(backendDirectory, '.test-e2e.sqlite3')

  execFileSync(python, ['manage.py', 'migrate', '--noinput'], {
    cwd: backendDirectory,
    stdio: 'inherit',
    env: {
      ...process.env,
      DJANGO_SETTINGS_MODULE: 'config.e2e_settings',
      DJANGO_SECRET_KEY: 'playwright-only-test-secret-not-for-production',
      DJANGO_DEBUG: 'True',
      DJANGO_ALLOWED_HOSTS: '127.0.0.1,localhost',
      AUTH_COOKIE_SECURE: 'False',
    },
  })

  return () => {
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${databaseFile}${suffix}`
      if (existsSync(file)) rmSync(file)
    }
  }
}
