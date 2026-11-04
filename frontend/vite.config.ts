import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..')
  const apiProxyTarget =
    process.env.VITE_API_PROXY_TARGET ||
    env.VITE_API_PROXY_TARGET ||
    'http://127.0.0.1:8000'
  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': apiProxyTarget,
      },
    },
  }
})
