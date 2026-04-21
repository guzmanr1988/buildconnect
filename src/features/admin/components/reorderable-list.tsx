import { useEffect, type ReactNode } from 'react'
import { useLongPressDrag } from '@/hooks/use-long-press-drag'

/*
 * Ship #175 — generic reorderable-list wrapper used across the four
 * nested list levels on /admin/products:
 *   1. option_groups within a service (the "menus")
 *   2. options within a group
 *   3. sub_groups under an option
 *   4. sub_options within a sub_group
 *
 * Top-level services deliberately do NOT use this wrapper — Rodolfo
 * scoped reorder to nested menus only.
 *
 * Consumers pass items + an onReorder callback that accepts
 * (fromIndex, toIndex). renderItem receives drag props that must be
 * spread onto the row's grabbable surface, plus a state object so the
 * consumer can style the currently-dragging row + the drop-indicator.
 */

export interface ReorderableDragProps {
  ref: (n: HTMLElement | null) => void
  onPointerDown: (e: React.PointerEvent) => void
  'data-reorderable-row': 'true'
  'data-reorderable-index': string
  style: { touchAction: 'none' }
}

export interface ReorderableDragState {
  isDragging: boolean
  dragOver: boolean
  anyDragging: boolean
}

export interface ReorderableListProps<T> {
  items: T[]
  keyFor: (item: T, index: number) => string
  onReorder: (fromIndex: number, toIndex: number) => void
  renderItem: (
    item: T,
    index: number,
    dragProps: ReorderableDragProps,
    state: ReorderableDragState,
  ) => ReactNode
  // Stops drag initiation on specific rows (e.g. ones currently editing).
  disableAt?: (index: number) => boolean
}

export function ReorderableList<T>({
  items,
  keyFor,
  onReorder,
  renderItem,
  disableAt,
}: ReorderableListProps<T>) {
  const drag = useLongPressDrag({ onReorder, disableAt })
  useEffect(() => {
    drag.setRowCount(items.length)
  }, [items.length, drag])

  return (
    <>
      {items.map((item, i) => {
        const state: ReorderableDragState = {
          isDragging: drag.isDragging && drag.draggingIndex === i,
          dragOver:
            drag.isDragging &&
            drag.overIndex === i &&
            drag.draggingIndex !== null &&
            drag.draggingIndex !== i,
          anyDragging: drag.isDragging,
        }
        // Cast the ref signature to match React's useRef shape. Our hook
        // stores raw HTMLElement refs internally; consumers attach to the
        // row element regardless of underlying HTML tag.
        const props = drag.getRowProps(i) as unknown as ReorderableDragProps
        return (
          <div key={keyFor(item, i)}>
            {renderItem(item, i, props, state)}
          </div>
        )
      })}
    </>
  )
}
