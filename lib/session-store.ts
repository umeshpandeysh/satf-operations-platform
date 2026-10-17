/**
 * SATF Operations Platform — Client Session Storage Adapter
 *
 * PROTOTYPE SCOPE & LIMITATIONS:
 * 1. Scope: Browser-local demonstration persistence for active session only.
 * 2. Non-Authoritative: Edits made here do NOT persist to a backend database
 *    and are NOT shared between staff or other browsers.
 * 3. Fallback: Automatically falls back to deterministic mock baseline data
 *    if session storage is unavailable or cleared.
 */

import type { Tour } from "./types";

const SESSION_STORAGE_KEY = "satf_prototype_tours_session_v1";
const SESSION_EVENT = "satf-session-store-update";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/**
 * Retrieve all modified tours stored in the current browser session.
 */
export function getSessionTours(): Record<string, Tour> | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, Tour>;
  } catch {
    return null;
  }
}

/**
 * Retrieve a specific tour by ID from the browser session, if edited.
 */
export function getSessionTour(tourId: string): Tour | null {
  const all = getSessionTours();
  if (!all) return null;
  return all[tourId] ?? null;
}

/**
 * Save an updated tour to the browser session.
 */
export function saveSessionTour(updatedTour: Tour): void {
  if (!isBrowser()) return;
  try {
    const current = getSessionTours() ?? {};
    current[updatedTour.id] = {
      ...updatedTour,
      lastUpdated: new Date().toISOString(),
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // Session storage failure (e.g. quota or private browsing mode) handled gracefully
  }
}

/**
 * Clear a specific tour edit, reverting it to baseline mock data.
 */
export function clearSessionTour(tourId: string): void {
  if (!isBrowser()) return;
  try {
    const current = getSessionTours();
    if (!current) return;
    delete current[tourId];
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // Ignore error
  }
}

/**
 * Clear all session edits across the entire application.
 */
export function clearAllSessionTours(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // Ignore error
  }
}

/**
 * React 18/19 useSyncExternalStore subscription for external session store.
 */
export function subscribeSessionStore(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Returns raw string snapshot from session storage.
 */
export function getSessionSnapshot(): string {
  if (!isBrowser()) return "";
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Server snapshot for SSR hydration safety.
 */
export function getServerSnapshot(): string {
  return "";
}
