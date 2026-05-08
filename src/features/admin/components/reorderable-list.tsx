import { useEffect, type ReactNode } from 'react'
import { useLongPressDrag } from '@/hooks/use-long-press-drag'

/*
 * Generic reorderable-list wrapper used across the four nested list
 * levels on /admin/products:
 *   1. option_groups within a service (the "menus")
 *   2. options within a group
 *   3. sub_groups under an option
 *   4. sub_options within a sub_group
 *
 * Top-level services deliberately do NOT use this wrapper - Rodolfo
 * scoped reorder to nested menus only.
 *
 * Drag is handle-only (PR #145 Rodolfo direct 04:36Z): consumers spread
 * `rowProps` on the row container (provides hit-testing ref + probe
 * attrs + drag-locked sentinel) and `handleProps` on the GripVertical
 * handle ONLY. Pressing anywhere else on the row will NOT initiate a
 * drag. `helpers.moveUp` / `moveDown` drive the up/down chevron
 * buttons for one-step precision moves.
 */

export interface ReorderableRowProps {
  ref: (n: HTMLElement | null) => void
  'data-reorderable-row': 'true'
  'data-reorderable-index': string
  'data-admin-row-drag-locked': 'true'
}

export interface ReorderableHandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  'data-admin-row-drag-handle': 'true'
  style: { touchAction: 'none'; cursor: 'grab' }
}

export interface ReorderableMoveHelpers {
  moveUp: () => void
  moveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

export interface ReorderableDragProps {
  row: ReorderableRowProps
  handle: ReorderableHandleProps
  helpers: ReorderableMoveHelpers
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
        const props: ReorderableDragProps = {
          row: drag.getRowProps(i) as unknown as ReorderableRowProps,
          handle: drag.getHandleProps(i) as unknown as ReorderableHandleProps,
          helpers: drag.getMoveHelpers(i, items.length),
        }
        return (
          <div key={keyFor(item, i)}>
            {renderItem(item, i, props, state)}
          </div>
        )
      })}
    </>
  )
}
