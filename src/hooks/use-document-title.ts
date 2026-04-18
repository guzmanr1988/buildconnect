import { useEffect } from 'react'

/**
 * Set document.title with the "{title} — BuildConnect" convention.
 * Pass an empty/undefined value and the parent route's title wins (the hook
 * is a no-op). The RootLayout wrapper in router/root-layout.tsx handles the
 * static per-route titles via route handle metadata; pages with dynamic
 * titles (e.g. /home/service/:serviceId) call this hook directly to
 * override with a resolved name.
 */
export function useDocumentTitle(title: string | undefined | null) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} — BuildConnect`
    return () => {
      document.title = previous
    }
  }, [title])
}
