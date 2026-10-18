/**
 * SATF Operations Platform — Client Persistence Service
 *
 * Replaces browser sessionStorage with authenticated server APIs.
 * Communicates with /api/operations/tours and /api/operations/tours/[id].
 *
 * Implements:
 * - Operator authentication and CSRF token propagation
 * - Loading, success, and actionable error states
 * - Concurrency conflict detection (optimistic locking)
 * - Safe handling of unconfigured database states without silent fallbacks
 */

import type { Tour } from "./types";
import type { NewTourInput } from "./operations";

export interface OperationClientResult<T = Tour> {
  success: boolean;
  tour?: T;
  tours?: T[];
  error?: string;
  code?: string;
  conflict?: boolean;
  currentTour?: Tour;
  configured?: boolean;
}

let cachedCsrfToken: string | null = null;

/**
 * Retrieve active CSRF token from server session.
 */
export async function getClientCsrfToken(): Promise<string | null> {
  if (cachedCsrfToken) return cachedCsrfToken;
  try {
    const res = await fetch("/api/auth/session");
    if (res.ok) {
      const data = await res.json();
      if (data?.csrfToken) {
        cachedCsrfToken = data.csrfToken;
        return data.csrfToken;
      }
    }
  } catch (err) {
    console.error("Failed to retrieve operator session CSRF token:", err);
  }
  return null;
}

/**
 * Invalidate cached CSRF token (e.g. after logout or session refresh).
 */
export function invalidateClientCsrfToken(): void {
  cachedCsrfToken = null;
}

/**
 * Persist an updated tour record to the server database.
 * Detects concurrency conflicts (HTTP 409) if the tour was modified by another coordinator.
 */
export async function updateOperationalTour(
  tour: Tour,
  expectedLastUpdated?: string
): Promise<OperationClientResult<Tour>> {
  const csrfToken = await getClientCsrfToken();

  try {
    const res = await fetch(`/api/operations/tours/${encodeURIComponent(tour.id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify({ tour, expectedLastUpdated }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      return {
        success: false,
        conflict: true,
        code: "CONCURRENCY_CONFLICT",
        error:
          data.error ||
          "Concurrency Conflict: This tour was modified by another coordinator. Please reload the latest record.",
        currentTour: data.currentTour,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: "Operator authentication required. Please log in to save changes.",
        code: "UNAUTHORIZED",
      };
    }

    if (res.status === 503) {
      return {
        success: false,
        configured: false,
        code: "DATABASE_NOT_CONFIGURED",
        error:
          data.error ||
          "Server database persistence is not configured. Changes could not be persisted.",
      };
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to update tour (HTTP ${res.status}).`,
        code: data.code,
      };
    }

    return {
      success: true,
      tour: data.tour || tour,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network failure communicating with server.",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * Create a new tour booking file on the server database.
 */
export async function createOperationalTour(
  tourOrInput: Tour | NewTourInput
): Promise<OperationClientResult<Tour>> {
  const csrfToken = await getClientCsrfToken();

  const isDirectTour = "id" in tourOrInput;
  const payload = isDirectTour
    ? { tour: tourOrInput }
    : { newTourInput: tourOrInput };

  try {
    const res = await fetch("/api/operations/tours", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: "Operator authentication required. Please log in to create tours.",
        code: "UNAUTHORIZED",
      };
    }

    if (res.status === 503) {
      return {
        success: false,
        configured: false,
        code: "DATABASE_NOT_CONFIGURED",
        error:
          data.error ||
          "Server database persistence is not configured. New tours could not be persisted.",
      };
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to create tour (HTTP ${res.status}).`,
        code: data.code,
      };
    }

    return {
      success: true,
      tour: data.tour,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network failure communicating with server.",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * Cancel an operational tour on the server database with mandatory reason.
 */
export async function cancelOperationalTour(
  tourId: string,
  reason: string,
  expectedLastUpdated?: string
): Promise<OperationClientResult<Tour>> {
  const csrfToken = await getClientCsrfToken();

  try {
    const res = await fetch(`/api/operations/tours/${encodeURIComponent(tourId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify({ action: "cancel", reason, expectedLastUpdated }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      return {
        success: false,
        conflict: true,
        code: "CONCURRENCY_CONFLICT",
        error:
          data.error ||
          "Conflict: This tour was updated by another coordinator. Please reload before cancelling.",
        currentTour: data.currentTour,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: "Operator authentication required. Please log in to cancel tours.",
        code: "UNAUTHORIZED",
      };
    }

    if (res.status === 503) {
      return {
        success: false,
        configured: false,
        code: "DATABASE_NOT_CONFIGURED",
        error:
          data.error ||
          "Server database persistence is not configured. Cancellation could not be persisted.",
      };
    }

    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to cancel tour (HTTP ${res.status}).`,
        code: data.code,
      };
    }

    return {
      success: true,
      tour: data.tour,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network failure communicating with server.",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * Load operational tours from the server database.
 */
export async function fetchOperationalTours(): Promise<OperationClientResult<Tour>> {
  try {
    const res = await fetch("/api/operations/tours");
    if (res.status === 401) {
      return {
        success: false,
        error: "Authentication required to read operational data.",
        code: "UNAUTHORIZED",
      };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || "Failed to load operational tours from server.",
      };
    }

    return {
      success: true,
      configured: data.configured,
      tours: data.tours || [],
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error loading operational data.",
    };
  }
}
