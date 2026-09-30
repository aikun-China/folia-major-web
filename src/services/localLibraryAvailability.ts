// src/services/localLibraryAvailability.ts
// Centralizes the secure-context requirement for browser local-library access.

export interface LocalLibraryAvailability {
  supported: boolean;
  reason: 'insecure-http' | 'file-system-api-unavailable' | null;
  // True when folder import can still run through a plain file input with audio bytes persisted
  // in IndexedDB (no File System Access API, e.g. Android WebView). Songs imported this way
  // cannot be rescanned from disk and resync is unavailable for them.
  inputFallback: boolean;
}

const unavailable = (reason: 'insecure-http' | 'file-system-api-unavailable'): LocalLibraryAvailability => (
  { supported: false, reason, inputFallback: false }
);

export const getLocalLibraryAvailability = (): LocalLibraryAvailability => {
  if (typeof window === 'undefined') return unavailable('file-system-api-unavailable');
  if (window.electron) return { supported: true, reason: null, inputFallback: false };
  const currentLocation = window.location;
  if (!currentLocation) return unavailable('file-system-api-unavailable');
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(currentLocation.hostname);
  if (!(currentLocation.protocol === 'https:' || isLocalhost) || !window.isSecureContext) {
    return unavailable('insecure-http');
  }
  if (!('showDirectoryPicker' in window) || typeof navigator.storage?.getDirectory !== 'function') {
    const hasIndexedDb = typeof window.indexedDB !== 'undefined';
    if (hasIndexedDb) return { supported: true, reason: null, inputFallback: true };
    return unavailable('file-system-api-unavailable');
  }
  return { supported: true, reason: null, inputFallback: false };
};
