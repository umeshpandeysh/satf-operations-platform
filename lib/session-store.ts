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
export const SESSION_READ_ERROR_PREFIX = "__SATF_STORAGE_READ_ERROR__:";

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

export interface SessionStoreReadState {
  status: "empty" | "ready" | "error";
  tours: Record<string, Tour> | null;
  error: string | null;
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

export type StorageReadResult =
  | { success: true; raw: string | null }
  | { success: false; error: string };

export type ParsedStorageResult =
  | { success: true; tours: Record<string, Tour> | null }
  | { success: false; error: string };

export type SingleTourReadResult =
  | { success: true; tour: Tour | null }
  | { success: false; error: string };

export function getRawStorageResult(): StorageReadResult {
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
    const raw = driver.getItem(SESSION_STORAGE_KEY);
    return { success: true, raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage read failed";
    return {
      success: false,
      error: `Failed to read from session storage: ${msg}`,
    };
  }
}

export function getRawStorage(): string | null {
  const result = getRawStorageResult();
  return result.success ? result.raw : null;
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

function parseRawPayload(raw: string | null): ParsedStorageResult {
  // Genuinely empty storage key (not edited in this session)
  if (raw === null || raw.trim() === "") {
    return { success: true, tours: null };
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: "Corrupted session data: stored payload is not a valid tour dictionary.",
      };
    }
    return { success: true, tours: parsed as Record<string, Tour> };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON syntax";
    return {
      success: false,
      error: `Corrupted session data: failed to parse stored JSON (${msg}).`,
    };
  }
}

/**
 * Retrieve all modified tours stored in the current session with explicit error reporting.
 * Distinguishes between an uninitialized key (tours: null) and an unreadable/corrupted store.
 */
export function getSessionToursResult(): ParsedStorageResult {
  const readRes = getRawStorageResult();
  if (!readRes.success) {
    return { success: false, error: readRes.error };
  }
  return parseRawPayload(readRes.raw);
}

/**
 * Retrieve all modified tours stored in the current session.
 * Throws an Error if storage cannot be reliably read or is corrupted,
 * ensuring callers never confuse a read failure with an empty session (null).
 * Returns null ONLY when storage is genuinely empty.
 */
export function getSessionTours(): Record<string, Tour> | null {
  const result = getSessionToursResult();
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.tours;
}

/**
 * Retrieve a specific tour by ID from the session with explicit error reporting.
 */
export function getSessionTourResult(tourId: string): SingleTourReadResult {
  const allResult = getSessionToursResult();
  if (!allResult.success) {
    return { success: false, error: allResult.error };
  }
  return {
    success: true,
    tour: allResult.tours ? (allResult.tours[tourId] ?? null) : null,
  };
}

/**
 * Retrieve a specific tour by ID from the session, if edited.
 * Throws an Error if storage cannot be reliably read or is corrupted.
 * Returns null ONLY when storage is empty or the tour has no session edits.
 */
export function getSessionTour(tourId: string): Tour | null {
  const result = getSessionTourResult(tourId);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.tour;
}

/**
 * Save an updated tour to session storage.
 * Refuses to save if previous storage state is unreadable or corrupted,
 * ensuring existing data is never wiped out or corrupted.
 */
export function saveSessionTour(updatedTour: Tour): StorageOperationResult {
  try {
    const readResult = getSessionToursResult();
    if (!readResult.success) {
      return {
        success: false,
        error: `Cannot save tour: ${readResult.error}`,
      };
    }

    const current = readResult.tours ?? {};
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
 * Must NOT report false success if storage cannot be reliably read.
 */
export function clearSessionTour(tourId: string): StorageOperationResult {
  try {
    const readResult = getSessionToursResult();
    if (!readResult.success) {
      return {
        success: false,
        error: `Cannot clear tour: ${readResult.error}`,
      };
    }

    const current = readResult.tours;
    // Storage read was verified and confirmed to not have edits for this tour
    if (!current || !(tourId in current)) {
      return { success: true };
    }

    const next = { ...current };
    delete next[tourId];

    const writeResult =
      Object.keys(next).length === 0
        ? removeRawStorage()
        : setRawStorage(JSON.stringify(next));

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
 * Returns raw string snapshot from session storage for React useSyncExternalStore.
 * Performs strictly ONE read operation to avoid double-read race conditions.
 * If storage read fails or is corrupted, returns a stable prefixed error string
 * so React consumers detect read failures without throwing or causing infinite loops.
 * Returns empty string "" ONLY when storage is genuinely empty.
 */
export function getSessionSnapshot(): string {
  const readRes = getRawStorageResult();
  if (!readRes.success) {
    return `${SESSION_READ_ERROR_PREFIX}${readRes.error}`;
  }

  const parsedRes = parseRawPayload(readRes.raw);
  if (!parsedRes.success) {
    return `${SESSION_READ_ERROR_PREFIX}${parsedRes.error}`;
  }

  if (!parsedRes.tours) {
    return "";
  }

  return readRes.raw!;
}

/**
 * Server snapshot for SSR hydration safety.
 * Always returns empty string so server and client initial render match identically.
 */
export function getServerSnapshot(): string {
  return "";
}

/**
 * Parses raw snapshot returned by getSessionSnapshot() into a structured, type-safe state.
 * Enables UI consumers (Dashboard, ToursView, TourDetailClient) to cleanly distinguish
 * between genuinely empty storage, active session edits, and storage read failures.
 */
export function parseSessionSnapshot(snapshot: string): SessionStoreReadState {
  if (!snapshot) {
    return { status: "empty", tours: null, error: null };
  }
  if (snapshot.startsWith(SESSION_READ_ERROR_PREFIX)) {
    return {
      status: "error",
      tours: null,
      error: snapshot.slice(SESSION_READ_ERROR_PREFIX.length),
    };
  }
  try {
    const parsed = JSON.parse(snapshot);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        status: "error",
        tours: null,
        error: "Corrupted session data: stored payload is not a valid tour dictionary.",
      };
    }
    return {
      status: "ready",
      tours: parsed as Record<string, Tour>,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "JSON syntax error";
    return {
      status: "error",
      tours: null,
      error: `Corrupted session data: failed to parse JSON (${msg}).`,
    };
  }
}
