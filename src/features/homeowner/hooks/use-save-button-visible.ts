import { useEffect, type RefObject } from 'react'

// Rod voice via kratos msg fiesi (2026-07-17 ~09:15Z), verdict (B) at 09:37Z
// (helios source-grep on refine a2662c3): the homeowner mobile bottom nav is
// `position:fixed z-50` (homeowner-layout.tsx L388, className "fixed bottom-0
// left-0 right-0 z-50 px-3 pb-3 safe-area-inset-bottom"). When a roofing
// material configurator's `isComplete` flips true, the Save Selection button
// renders at the bottom of that configurator. On mobile (390x844) it lands at
// ~746, colliding with the nav wrapper's occlusion zone (764-844) — 56% of
// the button hides behind the nav, `document.elementFromPoint(save_center)`
// returns the nav not the button.
//
// Before this hook: ZERO app scroll fired on color-pick/isComplete-flip in
// the refine tree. Walker traces showed a 681px scroll after chip click that
// LOOKED like clause 2 was implemented — that was Playwright auto-scrolling
// the chip into view before clicking it, not app code. A real mobile user
// tapping a chip already visible would get NO scroll at all and the Save
// button would render below-fold silently. Clause 2 ("take him to the Save
// Selection button first") was never actually satisfied — see
// feedback_mobile_viewport_scroll_into_view_before_click / feedback_in_
// viewport_is_a_geometry_claim_not_a_visibility_claim_a_rect_cannot_see_
// occlusion_by_fixed_overlay for the class.
//
// This hook:
//   1. Fires once per false→true isComplete transition (React deps).
//   2. Waits one paint (80ms — same delay as scrollToFirstConfigSection in
//      service-detail.tsx L940-966, and enough for the configurator's
//      framer-motion `height: auto` mount animation to settle).
//   3. Measures the fixed bottom-nav wrapper via
//      `[data-homeowner-bottom-nav-frame="true"]`; falls back to
//      `window.innerHeight` (no clip) if the nav is unmounted (desktop or
//      pre-mount race).
//   4. If save.bottom > nav.top - CLEARANCE, scrolls the DELTA (imperative
//      `window.scrollTo`, not scrollIntoView — the caller may sit inside a
//      framer-motion animating container and `scrollIntoView` treats every
//      scrollable ancestor as a scroll root; only the document scroll matters
//      here).
//   5. Derives nav height from getBoundingClientRect at scroll time — never
//      a hardcoded 80 (the nav wrapper is `safe-area-inset-bottom`, so
//      effective height varies by device / orientation / OS chrome).
//
// TERM B / geometry-vs-visibility trap (kratos msg 4p5li): after this scroll
// lands, step3_rect.top may drop below the viewport top so a rect-based
// `in_viewport` check flips true — but the visible step-3 sliver sits BEHIND
// the fixed nav and the user sees NONE of it. That is the fix working, not
// a regression. Verify with an occlusion cell (elementFromPoint /
// unoccluded_fraction), not a bounding-rect predicate.
export function useSaveButtonVisible(
  saveButtonRef: RefObject<HTMLElement | null>,
  isComplete: boolean,
): void {
  useEffect(() => {
    if (!isComplete) return
    const t = window.setTimeout(() => {
      const btn = saveButtonRef.current
      if (!btn) return
      const navFrame = document.querySelector<HTMLElement>(
        '[data-homeowner-bottom-nav-frame="true"]',
      )
      const navTop = navFrame
        ? navFrame.getBoundingClientRect().top
        : window.innerHeight
      const CLEARANCE_PX = 12
      const btnRect = btn.getBoundingClientRect()
      const overshootPx = btnRect.bottom - (navTop - CLEARANCE_PX)
      if (overshootPx <= 0) return
      window.scrollTo({
        top: window.scrollY + overshootPx,
        behavior: 'smooth',
      })
    }, 80)
    return () => window.clearTimeout(t)
  }, [isComplete, saveButtonRef])
}
