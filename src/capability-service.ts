import type { CapabilityFreshness, ProviderCapabilitySnapshot } from './capability-types';

export const LIVE_TTL_MS = 60_000;
export const CACHED_TTL_MS = 600_000;

export class CapabilityService {
  private readonly cache = new Map<string, ProviderCapabilitySnapshot>();

  getFreshness(observedAt: number, explicitUnavailable = false): CapabilityFreshness {
    if (explicitUnavailable || observedAt <= 0) return 'unavailable';
    const age = Date.now() - observedAt;
    if (age < LIVE_TTL_MS) return 'live';
    if (age < CACHED_TTL_MS) return 'cached';
    return 'stale';
  }

  record(snapshot: ProviderCapabilitySnapshot): void {
    this.cache.set(snapshot.provider, {
      ...snapshot,
      observedAt: snapshot.observedAt > 0 ? snapshot.observedAt : Date.now(),
      freshness: this.getFreshness(snapshot.observedAt > 0 ? snapshot.observedAt : Date.now(), snapshot.freshness === 'unavailable')
    });
  }

  get(provider: string): ProviderCapabilitySnapshot {
    const existing = this.cache.get(provider);
    if (!existing) {
      return this.createUnavailable(provider);
    }
    const currentFreshness = this.getFreshness(existing.observedAt, existing.freshness === 'unavailable');
    if (currentFreshness !== existing.freshness) {
      const updated: ProviderCapabilitySnapshot = { ...existing, freshness: currentFreshness };
      this.cache.set(provider, updated);
      return updated;
    }
    return existing;
  }

  createUnavailable(provider: string): ProviderCapabilitySnapshot {
    return {
      provider,
      authenticated: false,
      models: [],
      observedAt: 0,
      freshness: 'unavailable'
    };
  }

  createDefaultFallback(provider: string, authenticated = true): ProviderCapabilitySnapshot {
    return {
      provider,
      authenticated,
      models: [],
      observedAt: Date.now(),
      freshness: 'live'
    };
  }

  invalidate(provider?: string): void {
    if (provider) {
      this.cache.delete(provider);
    } else {
      this.cache.clear();
    }
  }
}
