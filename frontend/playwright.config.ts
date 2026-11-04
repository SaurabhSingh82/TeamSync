import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const frontendDirectory = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = resolve(frontendDirectory, '..')
const backendDirectory = resolve(repositoryRoot, 'backend')
const localPython = resolve(repositoryRoot, '.venv', 'Scripts', 'python.exe')
const python = process.env.PYTHON ??
  (process.platform === 'win32' && existsSync(localPython) ? localPython : 'python')
const backendCommand = `"${python}" manage.py runserver 127.0.0.1:8100 --noreload`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: backendCommand,
      cwd: backendDirectory,
      url: 'http://127.0.0.1:8100/api/health/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DJANGO_SETTINGS_MODULE: 'config.e2e_settings',
        DJANGO_SECRET_KEY: 'playwright-only-test-secret-not-for-production',
        DJANGO_DEBUG: 'True',
        DJANGO_ALLOWED_HOSTS: '127.0.0.1,localhost',
        CSRF_TRUSTED_ORIGINS: 'http://127.0.0.1:4173',
        AUTH_COOKIE_SECURE: 'False',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: frontendDirectory,
      url: 'http://127.0.0.1:4173/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: '/api',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:8100',
      },
    },
  ],
})
