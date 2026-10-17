/**
 * SATF Operations Platform — Client Session Storage Adapter
 *
 * PROTOTYPE SCOPE & LIMITATIONS:
 * 1. Scope: Browser-local demonstration persistence for active session only.
 * 2. Non-Authoritative: Edits made here do NOT persist to a backend database
 *    and are NOT shared between staff or other browsers.
 * 3. Fallback: Automatically falls back to deterministic mock baseline data
 *    if session storage is unavailable or cleared.
 * 4. Node/Testing Support: Includes in-memory fallback for unit testing in Node
 *    without browser globals.
 */

import type { Tour } from "./types";
export { mergeSessionTours } from "./operations";

const SESSION_STORAGE_KEY = "satf_prototype_tours_session_v1";
const SESSION_EVENT = "satf-session-store-update";

const memoryStorage: Record<string, string> = {};
const memoryListeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getRawStorage(): string | null {
  if (isBrowser()) {
    try {
      return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  return memoryStorage[SESSION_STORAGE_KEY] ?? null;
}

function setRawStorage(value: string): void {
  if (isBrowser()) {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, value);
    } catch {
      // Session storage quota or privacy mode error handled gracefully
    }
  } else {
    memoryStorage[SESSION_STORAGE_KEY] = value;
  }
}

function removeRawStorage(): void {
  if (isBrowser()) {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore error
    }
  } else {
    delete memoryStorage[SESSION_STORAGE_KEY];
  }
}

function notifySubscribers(): void {
  if (isBrowser()) {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } else {
    for (const listener of memoryListeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber error
      }
    }
  }
}

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
 */
export function saveSessionTour(updatedTour: Tour): void {
  try {
    const current = getSessionTours() ?? {};
    current[updatedTour.id] = {
      ...updatedTour,
      lastUpdated: new Date().toISOString(),
    };
    setRawStorage(JSON.stringify(current));
    notifySubscribers();
  } catch {
    // Graceful fallback
  }
}

/**
 * Clear a specific tour edit, reverting it to baseline mock data.
 */
export function clearSessionTour(tourId: string): void {
  try {
    const current = getSessionTours();
    if (!current) return;
    delete current[tourId];
    setRawStorage(JSON.stringify(current));
    notifySubscribers();
  } catch {
    // Ignore error
  }
}

/**
 * Clear all session edits across the entire application.
 */
export function clearAllSessionTours(): void {
  try {
    removeRawStorage();
    notifySubscribers();
  } catch {
    // Ignore error
  }
}

/**
 * React 18/19 useSyncExternalStore subscription for external session store.
 */
export function subscribeSessionStore(callback: () => void): () => void {
  if (isBrowser()) {
    window.addEventListener(SESSION_EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(SESSION_EVENT, callback);
      window.removeEventListener("storage", callback);
    };
  }
  memoryListeners.add(callback);
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
