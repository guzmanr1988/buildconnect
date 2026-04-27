// Shared layout className constants for dialogs that use the Bin-A
// horizontal-PC treatment (see #308 Lead Detail Modal, #309 Project
// Detail Dialog). Mobile portrait stays single-column (grid-cols-1
// default); PC sm+ splits into 2 columns with sm:items-start so
// columns top-align regardless of differing height.
//
// Format-SoT extraction trigger met at n=2 consumers per #103. Held
// as className-string-constant rather than full component abstraction
// to avoid over-abstraction (the pattern is trivially small and varies
// in inner content per consumer).
export const DIALOG_HORIZONTAL_GRID =
  'grid gap-3 sm:grid-cols-2 sm:gap-6 sm:items-start'
