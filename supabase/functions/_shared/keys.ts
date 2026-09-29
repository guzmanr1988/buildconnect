/* Key rotation task_1790694878552_317 (part of atlas _397): every function
   reads the new Supabase API keys through here, never the legacy JWT ones.
   The platform injects SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS as
   JSON keyed by key name. There is deliberately NO fallback to
   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY: those stay set after the
   legacy keys are disabled, so a fallback would pass every check today and
   break silently later. Both keys resolve when this module loads, so a
   missing var or name stops the function from booting (every request 500s)
   instead of failing on some later code path. The next rotation changes the
   two names below. */
export const SECRET_KEY_NAME = 'rot20260929'
export const PUBLISHABLE_KEY_NAME = 'rot20260929pub'

export function namedKey(envVar: string, name: string): string {
  const raw = Deno.env.get(envVar)
  if (!raw) throw new Error(`Missing env var ${envVar}`)
  let map: Record<string, unknown>
  try {
    map = JSON.parse(raw)
  } catch {
    throw new Error(`${envVar} is not valid JSON`)
  }
  const v = map?.[name]
  if (typeof v !== 'string' || !v) throw new Error(`${envVar} has no key named ${name}`)
  return v
}

const SECRET_KEY = namedKey('SUPABASE_SECRET_KEYS', SECRET_KEY_NAME)
const PUBLISHABLE_KEY = namedKey('SUPABASE_PUBLISHABLE_KEYS', PUBLISHABLE_KEY_NAME)

export function secretKey(): string {
  return SECRET_KEY
}

export function publishableKey(): string {
  return PUBLISHABLE_KEY
}
