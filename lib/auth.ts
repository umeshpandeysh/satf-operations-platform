import { NextRequest } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { verifyCloudflareAccessJwtSync } from "./gateway-jwt-sync";

export const COOKIE_NAME = "satf_operator_session";
export const SESSION_DURATION_SECONDS = 8 * 3600; // 8 hours

export interface SessionPayload {
  operator: string;
  username?: string;
  role?: string;
  mfaVerified?: boolean;
  csrfToken: string;
  iat: number;
  exp: number;
}

export interface CoordinatorUser {
  id: string;
  username: string;
  name: string;
  role: "coordinator" | "lead_coordinator" | "dispatcher" | "admin";
  passphrase?: string;
  passphraseHash?: string;
  totpSecret?: string;
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

// ─── Multi-Factor Authentication (RFC 6238 TOTP) ─────────────────────────────

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTOTP(secretBase32: string, timeStepSeconds = 30, timestamp = Date.now()): string {
  const key = base32ToBuffer(secretBase32);
  const counter = Math.floor(timestamp / 1000 / timeStepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, "0");
}

export function verifyTOTP(token: string, secretBase32: string, window = 1): boolean {
  if (!token || typeof token !== "string") return false;
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const stepTime = now + i * 30 * 1000;
    const expected = generateTOTP(secretBase32, 30, stepTime);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

// ─── Individual Coordinator Accounts ─────────────────────────────────────────

export function getCoordinatorAccounts(): CoordinatorUser[] {
  const envVal = process.env.SATF_COORDINATORS;
  if (envVal && envVal.trim()) {
    try {
      const parsed = JSON.parse(envVal);
      if (Array.isArray(parsed)) return parsed as CoordinatorUser[];
    } catch (e) {
      console.error("Failed to parse SATF_COORDINATORS:", e);
    }
  }
  return [];
}

export function verifyCoordinatorCredentials(
  username: string,
  passphrase: string,
  mfaCode?: string
): {
  success: boolean;
  user?: CoordinatorUser;
  mfaRequired?: boolean;
  error?: string;
} {
  const accounts = getCoordinatorAccounts();
  const user = accounts.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return { success: false, error: "Invalid username or passphrase." };
  }

  // Check passphrase
  let validPass = false;
  if (user.passphrase) {
    const a = crypto.createHash("sha256").update(passphrase).digest();
    const b = crypto.createHash("sha256").update(user.passphrase).digest();
    validPass = crypto.timingSafeEqual(a, b);
  } else if (user.passphraseHash) {
    const a = crypto.createHash("sha256").update(passphrase).digest("hex");
    validPass = a.toLowerCase() === user.passphraseHash.toLowerCase();
  }

  if (!validPass) {
    return { success: false, error: "Invalid username or passphrase." };
  }

  // Check MFA if configured for account or globally enforced
  const mfaEnforced = Boolean(user.totpSecret || process.env.SATF_MFA_ENFORCED === "true");
  if (mfaEnforced) {
    if (!mfaCode || !mfaCode.trim()) {
      return { success: false, mfaRequired: true, error: "Multi-factor authentication (MFA) code is required." };
    }
    if (user.totpSecret) {
      const validCode = verifyTOTP(mfaCode, user.totpSecret);
      if (!validCode) {
        return { success: false, mfaRequired: true, error: "Invalid multi-factor authentication (MFA) code." };
      }
    }
  }

  return { success: true, user };
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

export function createSessionToken(
  operatorName = "Duty Operator",
  metadata: { username?: string; role?: string; mfaVerified?: boolean } = {}
): {
  token: string;
  payload: SessionPayload;
} {
  const now = Date.now();
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const payload: SessionPayload = {
    operator: operatorName,
    username: metadata.username,
    role: metadata.role || "coordinator",
    mfaVerified: metadata.mfaVerified ?? false,
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

  if (!host) {
    return !origin && !referer;
  }

  // Origin check
  if (origin) {
    try {
      const url = new URL(origin);
      return url.host === host;
    } catch {
      return false;
    }
  }

  // Fallback to referer
  if (referer) {
    try {
      const url = new URL(referer);
      return url.host === host;
    } catch {
      return false;
    }
  }

  // Direct same-origin request
  return true;
}

// ─── Unified Route Authorization Helper ──────────────────────────────────────

export function isDevelopmentBypassActive(): boolean {
  if (process.env.NODE_ENV === "production") {
    if (process.env.SATF_DEV_AUTH_BYPASS === "true") {
      console.error(
        "FATAL SECURITY MISCONFIGURATION: SATF_DEV_AUTH_BYPASS cannot be enabled in production. Ignoring bypass and failing closed."
      );
    }
    return false;
  }
  return process.env.SATF_DEV_AUTH_BYPASS === "true";
}

export function authenticateOperatorRequest(
  req: NextRequest,
  options: { requiredRole?: "coordinator" | "lead_coordinator"; checkCsrf?: boolean } = {}
): {
  authorized: boolean;
  payload: SessionPayload;
  error?: string;
  status: 200 | 401 | 403 | 500;
} {
  const isProduction = process.env.NODE_ENV === "production";
  const hasGatewayConfig = Boolean(process.env.CF_ACCESS_AUD && process.env.CF_ACCESS_TEAM_NAME);
  const token =
    req.headers.get("cf-access-jwt-assertion") ||
    req.cookies.get("CF_Authorization")?.value;

  // 1. Explicit Development-Only Bypass (strictly forbidden in production)
  if (isDevelopmentBypassActive()) {
    return {
      authorized: true,
      payload: {
        operator: "Development Lead Coordinator",
        username: "dev.coordinator@southasiatravelfactory.com",
        role: "lead_coordinator",
        mfaVerified: true,
        csrfToken: "dev-bypass",
        iat: Date.now(),
        exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
      },
      status: 200,
    };
  }

  // 2. Production Security Boundary or Gateway Assertion Provided
  if (isProduction || hasGatewayConfig || token) {
    if (isProduction && !hasGatewayConfig) {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: "Gateway configuration missing. Failing closed in production.",
        status: 500,
      };
    }

    const verification = verifyCloudflareAccessJwtSync(token);
    if (!verification.valid || !verification.identity) {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: verification.error || "Unauthorized: Valid Cloudflare Access JWT assertion required.",
        status: (verification.statusCode as 401 | 403 | 500) || 401,
      };
    }

    const email = verification.identity.email.trim().toLowerCase();

    // Resolve Role: Lead Coordinator vs Standard Coordinator
    const leadEmails = (process.env.SATF_LEAD_COORDINATOR_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isLead = leadEmails.includes(email);

    // Resolve Authorization: Explicit email allowlists only (least-privilege perimeter)
    const authEmails = (process.env.SATF_AUTHORIZED_COORDINATOR_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAuthorized = isLead || authEmails.includes(email);

    if (!isAuthorized) {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: `Forbidden: Identity '${email}' is not an authorized SATF operator.`,
        status: 403,
      };
    }

    const userRole: "coordinator" | "lead_coordinator" = isLead ? "lead_coordinator" : "coordinator";

    // Enforce Least-Privilege Role Authorization
    if (options.requiredRole === "lead_coordinator" && userRole !== "lead_coordinator") {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: "Forbidden: This operation requires Lead Coordinator privileges.",
        status: 403,
      };
    }

    // Enforce CSRF Origin Validation on mutating requests
    const shouldCheckOrigin = req.method !== "GET" && req.method !== "HEAD";
    if (shouldCheckOrigin && !validateRequestOrigin(req)) {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: "Forbidden: Request origin does not match server host (CSRF protection).",
        status: 403,
      };
    }

    return {
      authorized: true,
      payload: {
        operator: verification.identity.name || email,
        username: email,
        role: userRole,
        mfaVerified: true,
        csrfToken: "gateway-verified",
        iat: verification.identity.iat * 1000,
        exp: verification.identity.exp * 1000,
      },
      status: 200,
    };
  }

  // 3. Legacy Non-Production Test Environment Fallback (Preserves offline unit test suites)
  let payload: SessionPayload = {
    operator: "Duty Dispatcher",
    username: "dispatcher",
    role: "lead_coordinator",
    mfaVerified: false,
    csrfToken: "direct-access",
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  };

  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie && cookie.value) {
    const verification = verifySessionToken(cookie.value);
    if (verification.valid && verification.payload) {
      payload = verification.payload;

      const shouldCheckCsrf = options.checkCsrf ?? (req.method !== "GET" && req.method !== "HEAD");
      if (shouldCheckCsrf) {
        if (!validateRequestOrigin(req)) {
          return {
            authorized: false,
            payload,
            error: "Forbidden: Request origin does not match server host (CSRF protection).",
            status: 403,
          };
        }

        const clientCsrf = req.headers.get("x-csrf-token");
        if (!clientCsrf) {
          return {
            authorized: false,
            payload,
            error: "Forbidden: Missing CSRF token header (x-csrf-token).",
            status: 403,
          };
        }

        const a = Buffer.from(clientCsrf);
        const b = Buffer.from(verification.payload.csrfToken);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return {
            authorized: false,
            payload,
            error: "Forbidden: Invalid CSRF token.",
            status: 403,
          };
        }
      }
    }
  }

  // Check role in legacy mode if required
  if (
    options.requiredRole === "lead_coordinator" &&
    payload.role !== "lead_coordinator" &&
    payload.role !== "admin" &&
    !payload.operator.toLowerCase().includes("lead") &&
    !payload.operator.toLowerCase().includes("coordinator") &&
    !payload.operator.toLowerCase().includes("manager") &&
    !payload.operator.toLowerCase().includes("dispatcher")
  ) {
    return {
      authorized: false,
      payload,
      error: "Forbidden: This operation requires Lead Coordinator privileges.",
      status: 403,
    };
  }

  const shouldCheckOrigin = req.method !== "GET" && req.method !== "HEAD";
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (shouldCheckOrigin && (origin || referer) && !validateRequestOrigin(req)) {
    return {
      authorized: false,
      payload,
      error: "Forbidden: Request origin does not match server host (CSRF protection).",
      status: 403,
    };
  }

  return {
    authorized: true,
    payload,
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
