import { NextRequest } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const COOKIE_NAME = "satf_operator_session";
export const SESSION_DURATION_SECONDS = 8 * 3600; // 8 hours

export interface SessionPayload {
  operator: string;
  csrfToken: string;
  iat: number;
  exp: number;
}

// ─── Secret & Passphrase Management ──────────────────────────────────────────

/**
 * Retrieve operator passphrase from server-side environment only.
 * Fails closed if neither SATF_OPERATOR_PASSPHRASE nor SATF_ADMIN_PASSPHRASE is configured.
 */
export function getOperatorPassphrase(): string | null {
  const envPass = process.env.SATF_OPERATOR_PASSPHRASE || process.env.SATF_ADMIN_PASSPHRASE;
  if (envPass && envPass.trim()) {
    return envPass.trim();
  }
  return null;
}

/**
 * Retrieve or generate persistent server-side HMAC session secret.
 * Stored in git-ignored data/ directory if environment variable is unset.
 */
export function getSessionSecret(): string {
  if (process.env.SATF_SESSION_SECRET && process.env.SATF_SESSION_SECRET.trim()) {
    return process.env.SATF_SESSION_SECRET.trim();
  }

  const secretFile = path.resolve(process.cwd(), "data/.session_secret");
  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, "utf-8").trim();
      if (stored.length >= 32) return stored;
    }
    const dir = path.dirname(secretFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, generated, { encoding: "utf-8", mode: 0o600 });
    return generated;
  } catch {
    return "satf-ephemeral-session-secret-fallback-minimum-32-chars-long";
  }
}

// ─── Constant-Time Passphrase Verification ───────────────────────────────────

export function verifyPassphrase(input: string): boolean {
  if (typeof input !== "string" || !input) return false;
  const expected = getOperatorPassphrase();
  if (!expected) {
    // Fail closed: No operator passphrase configured in environment
    return false;
  }

  // Hash both with SHA-256 to ensure identical buffer length for timingSafeEqual
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(expected).digest();

  return crypto.timingSafeEqual(a, b);
}

// ─── Rate Limiting (In-Memory IP Bucket) ──────────────────────────────────────

interface RateLimitRecord {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check active lockout
  if (record.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  // Reset window if expired
  if (now - record.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    rateLimitMap.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.attempts);
  if (remaining === 0) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  return { allowed: true, remainingAttempts: remaining };
}

export function recordFailedAttempt(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(identifier) || {
    attempts: 0,
    firstAttemptAt: now,
    lockedUntil: null,
  };

  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    rateLimitMap.set(identifier, record);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  rateLimitMap.set(identifier, record);
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - record.attempts };
}

export function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

// ─── Session Token Signing & Verification ────────────────────────────────────

export function createSessionToken(operatorName = "Duty Operator"): {
  token: string;
  payload: SessionPayload;
} {
  const now = Date.now();
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const payload: SessionPayload = {
    operator: operatorName,
    csrfToken,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS * 1000,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = getSessionSecret();
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  return {
    token: `${payloadB64}.${signature}`,
    payload,
  };
}

export function verifySessionToken(token: string): {
  valid: boolean;
  payload?: SessionPayload;
  error?: string;
} {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Session token is missing." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed session token format." };
  }

  const [payloadB64, providedSig] = parts;
  const secret = getSessionSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  // Constant-time signature comparison
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: "Invalid session token signature." };
  }

  try {
    const raw = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(raw) as SessionPayload;

    if (!payload.exp || Date.now() >= payload.exp) {
      return { valid: false, error: "Session has expired. Please log in again." };
    }

    if (!payload.csrfToken) {
      return { valid: false, error: "Session is missing CSRF protection token." };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Failed to parse session payload." };
  }
}

// ─── CSRF & Origin Validation ────────────────────────────────────────────────

export function validateRequestOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (!host) return false;

  // Origin check
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.host === host) return true;
    } catch {}
    return false;
  }

  // Fallback to referer
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.host === host) return true;
    } catch {}
    return false;
  }

  // Standard non-browser API client or same-origin direct request without origin/referer
  // In dev / test environments or server-to-server calls
  return true;
}

// ─── Unified Route Authorization Helper ──────────────────────────────────────

export function authenticateOperatorRequest(
  req: NextRequest,
  options: { checkCsrf?: boolean } = {}
): {
  authorized: boolean;
  payload?: SessionPayload;
  error?: string;
  status: 200 | 401 | 403;
} {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie || !cookie.value) {
    return {
      authorized: false,
      error: "Authentication required: No active operator session.",
      status: 401,
    };
  }

  const verification = verifySessionToken(cookie.value);
  if (!verification.valid || !verification.payload) {
    return {
      authorized: false,
      error: verification.error || "Authentication failed: Invalid operator session.",
      status: 401,
    };
  }

  // CSRF validation for mutating requests
  const shouldCheckCsrf = options.checkCsrf ?? (req.method !== "GET" && req.method !== "HEAD");
  if (shouldCheckCsrf) {
    if (!validateRequestOrigin(req)) {
      return {
        authorized: false,
        error: "Forbidden: Request origin does not match server host (CSRF protection).",
        status: 403,
      };
    }

    const clientCsrf = req.headers.get("x-csrf-token");
    if (!clientCsrf) {
      return {
        authorized: false,
        error: "Forbidden: Missing CSRF token header (x-csrf-token).",
        status: 403,
      };
    }

    const a = Buffer.from(clientCsrf);
    const b = Buffer.from(verification.payload.csrfToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return {
        authorized: false,
        error: "Forbidden: Invalid CSRF token.",
        status: 403,
      };
    }
  }

  return {
    authorized: true,
    payload: verification.payload,
    status: 200,
  };
}

/**
 * Standard cookie configuration flags for the operator session.
 */
export function getSessionCookieConfig() {
  return {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    },
  };
}
