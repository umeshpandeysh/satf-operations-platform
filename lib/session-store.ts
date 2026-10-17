/**
 * SATF Operations Platform — Client Session Storage Adapter
 *
 * PROTOTYPE SCOPE & LIMITATIONS:
 * 1. Scope: Browser-local demonstration persistence for active session only.
 * 2. Non-Authoritative: Edits made here do NOT persist to a backend database
 *    and are NOT shared between staff or other browsers.
 * 3. Fallback: Automatically falls back to deterministic mock baseline data
 *    if session storage is unavailable or cleared.
 * 4. Error Handling: Honest failure propagation — if storage write fails
 *    (e.g., quota exceeded, storage disabled, or privacy restrictions),
 *    the error is explicitly returned to the caller so the UI can keep the
 *    draft open, inform the user, and prevent corrupt state.
 */

import type { Tour } from "./types";
export { mergeSessionTours } from "./operations";

export const SESSION_STORAGE_KEY = "satf_prototype_tours_session_v1";
export const SESSION_EVENT = "satf-session-store-update";

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

export interface StorageDriver {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

// ─── Environment-Aware Driver & Test Hooks ───────────────────────────────────

let customDriver: StorageDriver | null = null;
let simulatedFailure: string | null = null;

const defaultMemoryStorage: Record<string, string> = {};
const defaultMemoryDriver: StorageDriver = {
  getItem: (k) => defaultMemoryStorage[k] ?? null,
  setItem: (k, v) => {
    defaultMemoryStorage[k] = v;
  },
  removeItem: (k) => {
    delete defaultMemoryStorage[k];
  },
};

const memoryListeners = new Set<() => void>();

export function setStorageDriverForTesting(driver: StorageDriver | null): void {
  customDriver = driver;
}

export function simulateStorageFailureForTesting(errorMessage: string | null): void {
  simulatedFailure = errorMessage;
}

export function resetSessionStoreForTesting(): void {
  customDriver = null;
  simulatedFailure = null;
  for (const key of Object.keys(defaultMemoryStorage)) {
    delete defaultMemoryStorage[key];
  }
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function getDriver(): StorageDriver | null {
  if (customDriver) return customDriver;
  if (typeof window !== "undefined") {
    const storage = getBrowserStorage();
    if (!storage) return null;
    return {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => storage.setItem(k, v),
      removeItem: (k) => storage.removeItem(k),
    };
  }
  // Outside browser (Node/tests)
  return defaultMemoryDriver;
}

function getRawStorage(): string | null {
  const driver = getDriver();
  if (!driver) return null;
  try {
    return driver.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setRawStorage(value: string): StorageOperationResult {
  if (simulatedFailure) {
    return { success: false, error: simulatedFailure };
  }

  const driver = getDriver();
  if (!driver) {
    return {
      success: false,
      error: "Browser session storage is unavailable or disabled in current environment.",
    };
  }

  try {
    driver.setItem(SESSION_STORAGE_KEY, value);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage write failed";
    return {
      success: false,
      error: `Failed to persist to session storage: ${msg}`,
    };
  }
}

function removeRawStorage(): StorageOperationResult {
  if (simulatedFailure) {
    return { success: false, error: simulatedFailure };
  }

  const driver = getDriver();
  if (!driver) {
    return {
      success: false,
      error: "Browser session storage is unavailable or disabled in current environment.",
    };
  }

  try {
    driver.removeItem(SESSION_STORAGE_KEY);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage delete failed";
    return {
      success: false,
      error: `Failed to remove from session storage: ${msg}`,
    };
  }
}

function notifySubscribers(): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch {
      // Ignore window event dispatch errors
    }
  }
  for (const listener of memoryListeners) {
    try {
      listener();
    } catch {
      // Ignore subscriber callback error
    }
  }
}

// ─── Authoritative Public Session Store API ──────────────────────────────────

/**
 * Retrieve all modified tours stored in the current session.
 */
export function getSessionTours(): Record<string, Tour> | null {
  try {
    const raw = getRawStorage();
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, Tour>;
  } catch {
    return null;
  }
}

/**
 * Retrieve a specific tour by ID from the session, if edited.
 */
export function getSessionTour(tourId: string): Tour | null {
  const all = getSessionTours();
  if (!all) return null;
  return all[tourId] ?? null;
}

/**
 * Save an updated tour to session storage.
 * Returns a StorageOperationResult indicating success or explicit failure.
 * Does not notify subscribers or corrupt existing data if write fails.
 */
export function saveSessionTour(updatedTour: Tour): StorageOperationResult {
  try {
    const current = getSessionTours() ?? {};
    const next: Record<string, Tour> = {
      ...current,
      [updatedTour.id]: {
        ...updatedTour,
        lastUpdated: new Date().toISOString(),
      },
    };

    const writeResult = setRawStorage(JSON.stringify(next));
    if (!writeResult.success) {
      return writeResult;
    }

    notifySubscribers();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected save failure";
    return { success: false, error: msg };
  }
}

/**
 * Clear a specific tour edit, reverting it to baseline mock data.
 * Returns a StorageOperationResult indicating success or explicit failure.
 */
export function clearSessionTour(tourId: string): StorageOperationResult {
  try {
    const current = getSessionTours();
    if (!current || !(tourId in current)) {
      return { success: true };
    }

    const next = { ...current };
    delete next[tourId];

    const writeResult = setRawStorage(JSON.stringify(next));
    if (!writeResult.success) {
      return writeResult;
    }

    notifySubscribers();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected clear failure";
    return { success: false, error: msg };
  }
}

/**
 * Clear all session edits across the entire application.
 * Returns a StorageOperationResult indicating success or explicit failure.
 */
export function clearAllSessionTours(): StorageOperationResult {
  try {
    const writeResult = removeRawStorage();
    if (!writeResult.success) {
      return writeResult;
    }

    notifySubscribers();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected clear failure";
    return { success: false, error: msg };
  }
}

/**
 * React 18/19 useSyncExternalStore subscription for external session store.
 */
export function subscribeSessionStore(callback: () => void): () => void {
  memoryListeners.add(callback);
  if (typeof window !== "undefined") {
    try {
      window.addEventListener(SESSION_EVENT, callback);
      window.addEventListener("storage", callback);
      return () => {
        memoryListeners.delete(callback);
        window.removeEventListener(SESSION_EVENT, callback);
        window.removeEventListener("storage", callback);
      };
    } catch {
      // Fall back to memoryListeners
    }
  }
  return () => {
    memoryListeners.delete(callback);
  };
}

/**
 * Returns raw string snapshot from session storage.
 */
export function getSessionSnapshot(): string {
  return getRawStorage() || "";
}

/**
 * Server snapshot for SSR hydration safety.
 * Always returns empty string so server and client initial render match identically.
 */
export function getServerSnapshot(): string {
  return "";
}
