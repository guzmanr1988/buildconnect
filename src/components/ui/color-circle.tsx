// Small filled-dot indicator used to bind a UI chip to a colored map polygon.
// Rod 18:37Z directive (pergolas multi-structure): each selected structure chip
// shows a ColorCircle in the same color as its polygon on the satellite map so
// the homeowner can tell which chip maps to which area.
export function ColorCircle({
  color,
  size = 8,
  className,
}: {
  color: string
  size?: number
  className?: string
}) {
  return (
    <span
      data-color-circle={color}
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  )
}
