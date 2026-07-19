/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { careersSitemapPlugin } from './tooling/careersSitemap.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, 'VITE_')
  if (env.VITE_SITE_URL && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error(
      'VITE_SITE_URL requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY so the sitemap cannot be incomplete.',
    )
  }

  return {
    envDir,

    plugins: [
      react(),
      tailwindcss(),
      ...(env.VITE_SITE_URL
        ? [
            careersSitemapPlugin({
              siteUrl: env.VITE_SITE_URL,
              supabaseUrl: env.VITE_SUPABASE_URL,
              supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
            }),
          ]
        : []),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Fixed test-only Supabase config so `hasSupabaseConfig` is true and the
      // MSW handlers' base URL (`test/msw/handlers.ts`) matches what the app
      // actually calls — never real credentials, this project has no browser
      // mock in dev (only in tests, per ticket 05/gaps-and-recommendations).
      env: {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    },
  }
})
