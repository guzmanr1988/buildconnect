import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// ENV-PRECEDENCE GUARD (task_1782371132811_937):
// Fleet shell profiles export VITE_* vars by default (e.g.
// `export VITE_SUPABASE_URL="$SUPABASE_URL"` pointing at apex prod).
// When a worktree's local .env tries to scope an isolated dev project,
// those shell exports silently win — process.env outranks .env in
// vite's resolution path for client-exposed VITE_ variables. The bug
// surface is severe: dev work appears to land cleanly while actually
// writing to prod (or, in our case, vice versa — the dev override is
// dropped and FE talks to whatever shell points at).
//
// Fix: read .env files directly via loadEnv() and force those values
// into `define`. import.meta.env.VITE_* gets compile-time-replaced with
// the .env value, regardless of what process.env holds.
export default defineConfig(({ mode }) => {
  const envFromFile = loadEnv(mode, process.cwd(), '')
  const forcedDefine: Record<string, string> = {}
  for (const [key, val] of Object.entries(envFromFile)) {
    if (key.startsWith('VITE_') && val) {
      forcedDefine[`import.meta.env.${key}`] = JSON.stringify(val)
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: forcedDefine,
  }
})
