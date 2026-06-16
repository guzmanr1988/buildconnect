// Escrow provider registry — parallel to lib/financing/adapters/index.ts.
//
// Phase 1: only the stub adapter is registered. Phase 2 replaces the stub
// implementation in-place (same key, same interface) so callers don't need
// to change. Additional providers (Tilled, custom) can register here later.

import type { EscrowProviderAdapter } from './_contract';
import { stripeExpressEscrowAdapter } from './stripe_express';
import { ESCROW_ADAPTER_KEY } from './constants';

const REGISTRY: Record<string, EscrowProviderAdapter> = {
  [ESCROW_ADAPTER_KEY]: stripeExpressEscrowAdapter,
};

export function getEscrowAdapterByKey(key: string): EscrowProviderAdapter {
  const adapter = REGISTRY[key];
  if (!adapter) throw new Error(`Unknown escrow adapter: ${key}`);
  return adapter;
}

export function getActiveEscrowAdapter(): EscrowProviderAdapter {
  return REGISTRY[ESCROW_ADAPTER_KEY];
}

export function listEscrowAdapterKeys(): string[] {
  return Object.keys(REGISTRY);
}
