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
  // 'list' (default) uses Y-axis midpoint hit-testing — the original Ship #175
  // behavior. 'grid' uses 2D point-in-rect hit-testing with a
  // closest-tile-by-distance fallback, so the same gesture works in a
  // multi-column grid layout (admin/products cards view).
  orientation?: 'list' | 'grid'
}

export function useLongPressDrag({
  onReorder,
  disableAt,
  orientation = 'list',
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

  const computeOverIndex = useCallback((clientX: number, clientY: number): number | null => {
    const nodes = rowRefs.current
    if (orientation === 'grid') {
      // 2D hit-testing: first pass finds the tile under the pointer.
      // Second pass falls back to closest-tile-by-center-distance so the
      // drop target stays sticky when the pointer crosses gaps between
      // tiles (grid gutters) or hovers outside the grid bounds.
      let bestIdx: number | null = null
      let bestDist = Infinity
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        if (!n) continue
        const rect = n.getBoundingClientRect()
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return i
        }
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = clientX - cx
        const dy = clientY - cy
        const dist = dx * dx + dy * dy
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = i
        }
      }
      return bestIdx
    }
    // List mode (original Ship #175): Y-axis midpoint scan.
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (!n) continue
      const rect = n.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    // Past every midpoint → drop at the end.
    const last = nodes.length - 1
    return last >= 0 ? last : null
  }, [orientation])

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
        const over = computeOverIndex(e.clientX, e.clientY)
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

  // Row-level props: ref + probe attrs + sentinel marking the row body as
  // drag-LOCKED (drag-listener is NOT bound here). The ref is needed for
  // hit-testing each row's bounds; data-reorderable-row/-index are stable
  // selectors for probe harnesses.
  const getRowProps = useCallback(
    (index: number) => ({
      ref: (n: HTMLElement | null) => {
        rowRefs.current[index] = n
      },
      'data-reorderable-row': 'true' as const,
      'data-reorderable-index': String(index),
      'data-admin-row-drag-locked': 'true' as const,
    }),
    []
  )

  // Handle-only props: onPointerDown lives here (and ONLY here) so the
  // drag is initiated by long-pressing the GripVertical handle, not by
  // pressing anywhere on the row body. touch-action:none on the handle
  // prevents iOS from hijacking the long-press as a text-selection /
  // magnifier gesture while we're arming the drag.
  const getHandleProps = useCallback(
    (index: number) => ({
      onPointerDown: onPointerDown(index),
      'data-admin-row-drag-handle': 'true' as const,
      style: { touchAction: 'none' as const, cursor: 'grab' as const },
    }),
    [onPointerDown]
  )

  // One-step precision-move helpers for the up/down chevron buttons —
  // sibling affordance to drag for users who don't want to long-press.
  const getMoveHelpers = useCallback(
    (index: number, total: number) => ({
      moveUp: () => {
        if (index > 0) onReorder(index, index - 1)
      },
      moveDown: () => {
        if (index < total - 1) onReorder(index, index + 1)
      },
      canMoveUp: index > 0,
      canMoveDown: index < total - 1,
    }),
    [onReorder]
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
    getHandleProps,
    getMoveHelpers,
    setRowCount,
  }
}
