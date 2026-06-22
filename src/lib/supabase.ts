import { createClient } from '@supabase/supabase-js'

// `import.meta.env` is populated by Vite at runtime; in node/tsx contexts
// (test runners) it is undefined. The ?? {} keeps the module safe to
// evaluate at import time in both worlds — no Vite behavior change since
// import.meta.env is always an object there.
const env = ((import.meta as { env?: Record<string, string | undefined> }).env) ?? {}
const supabaseUrl = env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
