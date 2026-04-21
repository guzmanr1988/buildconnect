import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * Long-press + pointer-drag reorder hook (Ship #175, Rodolfo-direct
 * 2026-04-21 "press and dragging into the desire order").
 *
 * Touch-first but works on desktop too. Flow:
 *   1. pointerdown on a row → start 450ms long-press timer
 *   2. pointermove > MOVE_CANCEL_PX before the timer fires → cancel
 *      (treats the gesture as a scroll, not a drag)
 *   3. timer fires → enter DRAGGING mode; record the starting index
 *   4. pointermove during DRAGGING → track the pointer Y against each
 *      registered row's bounds to compute the "over index" (the slot
 *      the user would drop into now)
 *   5. pointerup → call onReorder(fromIndex, toIndex) and reset
 *   6. Escape key or pointercancel → abort (no reorder fired)
 *
 * The hook is list-scoped: one instance manages a single ordered list of
 * items. Consumers call `getRowProps(index)` to wire a row's pointer
 * handlers + track its DOM node for hit-testing. UI helpers `isDragging`,
 * `draggingIndex`, and `overIndex` are returned so callers can style the
 * grabbed row + drop-indicator between siblings.
 *
 * Deliberately dep-free (no @dnd-kit) so the interaction is small,
 * predictable, and easy to tune per-level. All admin-products lists use
 * this same hook; four instances cover the four nested levels.
 */

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 8 // before long-press: this much movement = scroll, cancel

export type LongPressDragState = {
  isDragging: boolean
  draggingIndex: number | null
  overIndex: number | null
}

export interface UseLongPressDragOptions {
  onReorder: (fromIndex: number, toIndex: number) => void
  // Opt-out per-row: e.g. a row that's showing an inline dialog should
  // not initiate drag. Receives the row index, returns true to disable.
  disableAt?: (index: number) => boolean
}

export function useLongPressDrag({
  onReorder,
  disableAt,
}: UseLongPressDragOptions) {
  const rowRefs = useRef<Array<HTMLElement | null>>([])
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const pendingIndex = useRef<number | null>(null)
  const pendingStart = useRef<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const reset = useCallback(() => {
    clearTimer()
    pendingIndex.current = null
    pendingStart.current = null
    setDraggingIndex(null)
    setOverIndex(null)
  }, [])

  const computeOverIndex = useCallback((clientY: number): number | null => {
    const nodes = rowRefs.current
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (!n) continue
      const rect = n.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    // Past every midpoint → drop at the end.
    const last = nodes.length - 1
    return last >= 0 ? last : null
  }, [])

  // Global listeners for move + up kick in only while a long-press is
  // pending or a drag is active. We don't want to leak pointer handlers
  // across the whole document otherwise.
  useEffect(() => {
    if (pendingIndex.current === null && draggingIndex === null) return

    const onMove = (e: PointerEvent) => {
      // Phase 1: long-press armed but not yet fired — cancel on scroll.
      if (pendingIndex.current !== null && draggingIndex === null) {
        const start = pendingStart.current
        if (!start) return
        const dx = Math.abs(e.clientX - start.x)
        const dy = Math.abs(e.clientY - start.y)
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          reset()
        }
        return
      }
      // Phase 2: dragging — update over-index. Prevent default so the
      // native scroll doesn't fight the drag visual.
      if (draggingIndex !== null) {
        e.preventDefault()
        const over = computeOverIndex(e.clientY)
        setOverIndex(over)
      }
    }

    const onUp = () => {
      if (draggingIndex !== null && overIndex !== null && overIndex !== draggingIndex) {
        onReorder(draggingIndex, overIndex)
      }
      reset()
    }

    const onCancel = () => reset()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reset()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [draggingIndex, overIndex, onReorder, computeOverIndex, reset])

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      if (disableAt?.(index)) return
      // Only primary-button / touch. Ignore right-click and middle-click.
      if (e.button !== 0 && e.pointerType === 'mouse') return
      pendingIndex.current = index
      pendingStart.current = { x: e.clientX, y: e.clientY }
      clearTimer()
      longPressTimer.current = setTimeout(() => {
        // Long-press fired → enter drag mode from the pending slot.
        if (pendingIndex.current !== null) {
          setDraggingIndex(pendingIndex.current)
          setOverIndex(pendingIndex.current)
        }
      }, LONG_PRESS_MS)
    },
    [disableAt]
  )

  // A row that's currently draggable. Consumers spread these props on
  // the element that represents the grabbable surface. The
  // `data-reorderable-row` + `data-reorderable-index` attributes give
  // probe harnesses (Apollo matrix) a stable selector so the drag
  // surface can be targeted independent of Tailwind class churn.
  const getRowProps = useCallback(
    (index: number) => ({
      ref: (n: HTMLElement | null) => {
        rowRefs.current[index] = n
      },
      onPointerDown: onPointerDown(index),
      'data-reorderable-row': 'true' as const,
      'data-reorderable-index': String(index),
      // touch-action: none on the row prevents iOS from hijacking the
      // long-press as a text-selection / magnifier gesture while we're
      // arming the drag. Desktop ignores it.
      style: { touchAction: 'none' as const },
    }),
    [onPointerDown]
  )

  // Reset refs array when list length changes. Called by consumers.
  const setRowCount = useCallback((n: number) => {
    rowRefs.current.length = n
  }, [])

  const state: LongPressDragState = {
    isDragging: draggingIndex !== null,
    draggingIndex,
    overIndex,
  }

  return {
    ...state,
    getRowProps,
    setRowCount,
  }
}
