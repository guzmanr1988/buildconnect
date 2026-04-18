import { useLayoutEffect } from 'react'
import { Outlet, useMatches } from 'react-router-dom'

/**
 * Root route wrapper: reads the deepest matched route's `handle.title`,
 * applies the "{title} — BuildConnect" convention to document.title, and
 * falls back to "BuildConnect" when no route-level title is declared.
 *
 * Uses useLayoutEffect (not useEffect) so the static title is applied
 * BEFORE the browser paints AND before page-level useEffect-based
 * useDocumentTitle hooks fire. That ordering matters: React fires effects
 * bottom-up (child then parent), so if RootLayout used useEffect, its
 * effect would run AFTER the child's useDocumentTitle and clobber the
 * dynamic title (seen empirically on /home/service/:serviceId — parent
 * "Home" won over child "Pool & Oasis"). useLayoutEffect runs in an
 * earlier phase and never competes with page-level useEffect overrides.
 */
export function RootLayout() {
  const matches = useMatches()
  const leafTitle = matches
    .map((m) => (m.handle as { title?: string } | null | undefined)?.title)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .pop()

  useLayoutEffect(() => {
    document.title = leafTitle ? `${leafTitle} — BuildConnect` : 'BuildConnect'
  }, [leafTitle])

  return <Outlet />
}
