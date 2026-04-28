import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_FEATURE_FLAGS } from '@/lib/feature-flags-inventory'

// Ship #325 — per-feature admin-toggleable flags store.
//
// Replaces (functionally) the orphan AppSettings.phase2_enabled global
// switch with a per-feature granular control surface. Admin can enable
// / disable each Tranche-2 feature independently as it becomes ready,
// instead of all-or-nothing release.
//
// Per banked widen-reads-narrow-writes: getFlag falls back to the
// inventory default when an undefined / unknown key is read, so:
// (a) consumers integrating a flag for the first time get the default-
//     OFF behavior even on stored state from before the flag existed
// (b) future-added flags appear at their default state without a
//     migration step
//
// Per banked feedback_format_sot_shared_helper: inventory + store both
// reference the same FEATURE_FLAGS_INVENTORY (lib/feature-flags-inventory.ts)
// so the schema-of-truth lives in one place; consumer code pulls from
// the inventory list rather than hardcoding key strings.
//
// Per banked cross-file-idiom-consistency: same zustand+persist shape
// as useAdminModerationStore (matchRadiusMiles, demoDataHidden) — Map
// pattern with get / set / clear API + persist middleware with
// buildconnect- prefixed name.
//
// Mock-data-as-test-harness boundary: this store is auth-adjacent /
// admin-internal state per banked memory; lives in client-zustand-
// persist alongside the other admin moderation overrides. Real-Supabase
// migration deferred to whenever feature-flags need cross-device
// consistency (current scope: Rodolfo's local admin session).

interface FeatureFlagsState {
  flags: Record<string, boolean>
  setFlag: (key: string, enabled: boolean) => void
  getFlag: (key: string) => boolean
  resetFlags: () => void
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
  persist(
    (set, get) => ({
      flags: { ...DEFAULT_FEATURE_FLAGS },

      setFlag: (key, enabled) =>
        set((state) => ({
          flags: { ...state.flags, [key]: enabled },
        })),

      getFlag: (key) => {
        const stored = get().flags[key]
        if (typeof stored === 'boolean') return stored
        return DEFAULT_FEATURE_FLAGS[key] ?? false
      },

      resetFlags: () => set({ flags: { ...DEFAULT_FEATURE_FLAGS } }),
    }),
    { name: 'buildconnect-feature-flags' },
  ),
)
