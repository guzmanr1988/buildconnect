// Auto-derive initials from a person or company name (ship #164 per
// task_1776721365362_726; prophylactic fix for the rename-residue defect
// class first caught at #116 Rosa AM→RJ). Future code should prefer passing
// `name` and letting the UI derive display initials; hardcoded `initials`
// fields on Profile / fixtures remain supported for backward compat but
// become stale when `name` is renamed without updating them.
//
// Rules:
//   - Split on whitespace, take first char of each of the first two words
//   - Uppercase + strip non-letter characters
//   - Empty/whitespace-only input returns a single '?' placeholder

export function deriveInitials(name: string | undefined | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const firstChars = parts.slice(0, 2).map((p) => p[0] ?? '')
  const joined = firstChars.join('').replace(/[^A-Za-z]/g, '').toUpperCase()
  return joined || '?'
}

// Profile-flavored helper: prefer the fixture's explicit initials if set
// (legacy fixtures + intentional overrides), else derive from name.
export function getInitials(profile: { initials?: string; name?: string } | null | undefined): string {
  if (!profile) return '?'
  if (profile.initials && profile.initials.trim()) return profile.initials
  return deriveInitials(profile.name)
}
