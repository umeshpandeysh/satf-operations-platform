import { NextRequest } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";


import { COOKIE_NAME, SESSION_DURATION_SECONDS } from "./auth-constants";
export { COOKIE_NAME, SESSION_DURATION_SECONDS };

export interface SessionPayload {
  operator: string;
  username?: string;
  role?: string;
  mfaVerified?: boolean;
  csrfToken: string;
  jti?: string;
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
 */
export function getOperatorPassphrase(): string | null {
  const envPass = process.env.SATF_OPERATOR_PASSPHRASE;
  if (envPass && envPass.trim()) {
    return envPass.trim();
  }
  return null;
}

/**
 * Retrieve admin passphrase from server-side environment only.
 */
export function getAdminPassphrase(): string | null {
  const envPass = process.env.SATF_ADMIN_PASSPHRASE;
  if (envPass && envPass.trim()) {
    return envPass.trim();
  }
  return null;
}

/**
 * Determine verified role from passphrase without trusting client claims.
 * Fails closed if credentials are misconfigured, ambiguous, or identical.
 */
export function getPassphraseRole(input: string): "lead_coordinator" | "coordinator" | null {
  if (typeof input !== "string" || !input) return null;

  const adminPass = getAdminPassphrase();
  const opPass = getOperatorPassphrase();

  // Defend against ambiguous/colliding configuration:
  // If adminPass and opPass are both set and identical, fail closed to least privilege:
  // NEVER grant lead_coordinator on ambiguous or identical credentials!
  if (adminPass && opPass) {
    const adminHash = crypto.createHash("sha256").update(adminPass).digest();
    const opHash = crypto.createHash("sha256").update(opPass).digest();
    if (crypto.timingSafeEqual(adminHash, opHash)) {
      console.warn("SECURITY WARNING: SATF_ADMIN_PASSPHRASE and SATF_OPERATOR_PASSPHRASE are identical. Elevated access disabled. Failing closed to coordinator.");
      const inputHash = crypto.createHash("sha256").update(input).digest();
      if (crypto.timingSafeEqual(inputHash, opHash)) {
        return "coordinator";
      }
      return null;
    }
  }

  // When credentials are distinct and unambiguous:
  if (adminPass) {
    const a = crypto.createHash("sha256").update(input).digest();
    const b = crypto.createHash("sha256").update(adminPass).digest();
    if (crypto.timingSafeEqual(a, b)) return "lead_coordinator";
  }

  if (opPass) {
    const a = crypto.createHash("sha256").update(input).digest();
    const b = crypto.createHash("sha256").update(opPass).digest();
    if (crypto.timingSafeEqual(a, b)) return "coordinator";
  }

  return null;
}

/**
 * Retrieve or generate persistent server-side HMAC session secret.
 * In production, strictly requires SATF_SESSION_SECRET >= 32 chars and fails closed if missing.
 */
export function getSessionSecret(): string {
  const envSecret = process.env.SATF_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SECURITY CONFIGURATION ERROR: SATF_SESSION_SECRET must be configured with at least 32 characters in production. Failing closed."
    );
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
    if (process.env.NODE_ENV === "test") {
      return "satf-test-session-secret-for-local-unit-tests-only-min32";
    }
    throw new Error("Unable to establish secure session secret. Please configure SATF_SESSION_SECRET.");
  }
}

// ─── Constant-Time Passphrase Verification ───────────────────────────────────

export function verifyPassphrase(input: string): boolean {
  return getPassphraseRole(input) !== null;
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

// ─── Shared, Durable Cross-Instance Session Revocation Store ─────────────────

export interface RevokedSessionRecord {
  jti: string;
  exp: number;
  revokedAt: number;
}

const inMemoryRevokedTokens = new Set<string>();

function getSupabaseStorageConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

function getRevocationFilePath(): string {
  if (process.env.NODE_ENV === "production") {
    return path.join("/tmp", "satf_revoked_sessions.json");
  }
  return path.resolve(process.cwd(), "data", ".revoked_sessions.json");
}

function loadLocalRevokedTokens(): Set<string> {
  const set = new Set<string>(inMemoryRevokedTokens);
  try {
    const filePath = getRevocationFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const list = JSON.parse(raw) as RevokedSessionRecord[];
      const now = Date.now();
      for (const item of list) {
        if (item && item.exp > now) {
          set.add(item.jti);
        }
      }
    }
  } catch {
    // Fall back to in-memory set if filesystem is inaccessible
  }
  return set;
}

/**
 * Fetch revoked sessions from shared, durable Supabase Storage.
 * Synchronizes revocation across all Vercel serverless containers.
 */
export async function syncRevocationsFromStorage(): Promise<Set<string>> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    return loadLocalRevokedTokens();
  }

  try {
    const listUrl = `${config.url}/storage/v1/object/list/satf-security`;
    const res = await fetch(listUrl, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: "revocations/", limit: 1000 }),
    });

    if (res.ok) {
      const items = (await res.json()) as Array<{ name: string }>;
      for (const item of items) {
        if (item.name && item.name.endsWith(".json")) {
          const jti = item.name.replace(/^revocations\//, "").replace(/\.json$/, "");
          inMemoryRevokedTokens.add(jti);
        }
      }
    } else if (res.status !== 404 && process.env.NODE_ENV === "production") {
      throw new Error(`Durable revocation store returned HTTP ${res.status}`);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw err;
    }
  }
  return inMemoryRevokedTokens;
}

/**
 * Persist a session revocation to shared, durable Supabase Storage and local cache.
 * Uses atomic individual objects (/revocations/<jti>.json) to guarantee race-free concurrency.
 */
export async function revokeSession(
  jti: string,
  exp: number = Date.now() + SESSION_DURATION_SECONDS * 1000
): Promise<void> {
  if (!jti) return;
  inMemoryRevokedTokens.add(jti);
  const now = Date.now();

  // 1. Local filesystem cache update
  try {
    const filePath = getRevocationFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let list: RevokedSessionRecord[] = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }
    list = list.filter((item) => item.exp > now);
    list.push({ jti, exp, revokedAt: now });
    fs.writeFileSync(filePath, JSON.stringify(list), { encoding: "utf-8", mode: 0o600 });
  } catch {
    // In-memory set maintained if local filesystem is read-only
  }

  // 2. Persist to shared, durable Supabase Storage via atomic per-token object
  const config = getSupabaseStorageConfig();
  if (config) {
    try {
      const tokenUrl = `${config.url}/storage/v1/object/satf-security/revocations/${jti}.json`;
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "x-upsert": "true",
        },
        body: JSON.stringify({ jti, exp, revokedAt: now }),
      });

      if (!res.ok && res.status !== 409) {
        throw new Error(`Failed to store revocation token: HTTP ${res.status}`);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          `Failed to persist session revocation to shared storage: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

/**
 * Check if session is revoked.
 * Fast synchronous check against in-memory and local disk caches.
 */
export function isSessionRevoked(jti: string): boolean {
  if (!jti) return false;
  if (inMemoryRevokedTokens.has(jti)) return true;
  const set = loadLocalRevokedTokens();
  return set.has(jti);
}

/**
 * Asynchronous cross-instance revocation check.
 * Queries shared durable storage across Vercel serverless instances.
 * Checks atomic object (/revocations/<jti>.json) and fails closed in production on errors.
 */
export async function isSessionRevokedAsync(jti: string): Promise<boolean> {
  if (!jti) return false;
  // Positive local match is permanent (sessions are never un-revoked)
  if (inMemoryRevokedTokens.has(jti) || isSessionRevoked(jti)) return true;

  const config = getSupabaseStorageConfig();
  if (!config) return false;

  try {
    const tokenUrl = `${config.url}/storage/v1/object/satf-security/revocations/${jti}.json`;
    const res = await fetch(tokenUrl, {
      method: "GET",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
    });

    if (res.status === 200) {
      inMemoryRevokedTokens.add(jti);
      return true;
    }

    if (res.status === 404) {
      return false;
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error(`Revocation store returned HTTP ${res.status}`);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Revocation store unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return inMemoryRevokedTokens.has(jti);
}

// ─── Shared Rate Limiting Helpers ───────────────────────────────────────────

function hashRateLimitIdentifier(identifier: string): string {
  return crypto.createHash("sha256").update(identifier).digest("hex").slice(0, 16);
}

export async function checkRateLimitAsync(identifier: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}> {
  const syncCheck = checkRateLimit(identifier);
  if (!syncCheck.allowed) return syncCheck;

  const config = getSupabaseStorageConfig();
  if (!config) return syncCheck;

  try {
    const hashedId = hashRateLimitIdentifier(identifier);
    const url = `${config.url}/storage/v1/object/satf-security/rate-limits/${hashedId}.json`;
    const res = await fetch(url, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    if (res.ok) {
      const record = (await res.json()) as { attempts: number; firstAttemptAt: number; lockedUntil: number | null };
      const now = Date.now();
      if (record.lockedUntil && now < record.lockedUntil) {
        rateLimitMap.set(identifier, record);
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
        };
      }
    }
  } catch {}

  return syncCheck;
}

export async function recordFailedAttemptAsync(identifier: string): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}> {
  const localRes = recordFailedAttempt(identifier);
  const config = getSupabaseStorageConfig();
  if (!config) return localRes;

  try {
    const hashedId = hashRateLimitIdentifier(identifier);
    const record = rateLimitMap.get(identifier);
    if (record) {
      const url = `${config.url}/storage/v1/object/satf-security/rate-limits/${hashedId}.json`;
      await fetch(url, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "x-upsert": "true",
        },
        body: JSON.stringify(record),
      });
    }
  } catch {}

  return localRes;
}

export async function resetRateLimitAsync(identifier: string): Promise<void> {
  resetRateLimit(identifier);
  const config = getSupabaseStorageConfig();
  if (!config) return;

  try {
    const hashedId = hashRateLimitIdentifier(identifier);
    const url = `${config.url}/storage/v1/object/satf-security/rate-limits/${hashedId}.json`;
    await fetch(url, {
      method: "DELETE",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
  } catch {}
}

// ─── Session Token Signing & Verification ────────────────────────────────────

export function createSessionToken(
  operatorName = "Duty Operator",
  metadata: { username?: string; role?: string; mfaVerified?: boolean; jti?: string } = {}
): {
  token: string;
  payload: SessionPayload;
} {
  const now = Date.now();
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const jti = metadata.jti || crypto.randomBytes(16).toString("hex");

  // Role is strictly derived from verified metadata.role. Never infer elevated privileges from operatorName or titles.
  const role = metadata.role === "lead_coordinator" || metadata.role === "admin"
    ? metadata.role
    : "coordinator";

  const payload: SessionPayload = {
    operator: operatorName,
    username: metadata.username,
    role,
    mfaVerified: metadata.mfaVerified ?? false,
    csrfToken,
    jti,
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

    // Check revocation
    if (payload.jti && isSessionRevoked(payload.jti)) {
      return { valid: false, error: "Session has been revoked. Please log in again." };
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

export type AuthenticateOperatorResult = {
  authorized: boolean;
  payload: SessionPayload;
  error?: string;
  status: 200 | 401 | 403 | 500;
};

function authenticateOperatorRequestSync(
  req: NextRequest,
  options: { requiredRole?: "coordinator" | "lead_coordinator"; checkCsrf?: boolean } = {}
): AuthenticateOperatorResult {
  // 1. Read session cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie && cookie.value) {
    const verification = verifySessionToken(cookie.value);
    if (!verification.valid || !verification.payload) {
      return {
        authorized: false,
        payload: null as unknown as SessionPayload,
        error: verification.error || "Unauthorized: Invalid or expired session.",
        status: 401,
      };
    }

    const payload = verification.payload;

    // Enforce role requirement strictly from verified session role
    if (
      options.requiredRole === "lead_coordinator" &&
      payload.role !== "lead_coordinator" &&
      payload.role !== "admin"
    ) {
      return {
        authorized: false,
        payload,
        error: "Forbidden: This operation requires Lead Coordinator privileges.",
        status: 403,
      };
    }

    // CSRF validation on mutating requests
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
      if (clientCsrf) {
        const a = Buffer.from(clientCsrf);
        const b = Buffer.from(payload.csrfToken);
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

    return {
      authorized: true,
      payload,
      status: 200,
    };
  }

  // 2. Explicit Development-Only Bypass (strictly forbidden in production)
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

  return {
    authorized: false,
    payload: null as unknown as SessionPayload,
    error: "Unauthorized: Staff session required. Please log in.",
    status: 401,
  };
}

export function authenticateOperatorRequest(
  req: NextRequest,
  options: { requiredRole?: "coordinator" | "lead_coordinator"; checkCsrf?: boolean } = {}
): AuthenticateOperatorResult & PromiseLike<AuthenticateOperatorResult> {
  const syncResult = authenticateOperatorRequestSync(req, options);

  const thenableResult: AuthenticateOperatorResult & PromiseLike<AuthenticateOperatorResult> = {
    ...syncResult,
    then<TResult1 = AuthenticateOperatorResult, TResult2 = never>(
      onfulfilled?: ((value: AuthenticateOperatorResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return (async () => {
        if (syncResult.authorized && syncResult.payload?.jti) {
          try {
            const isRevoked = await isSessionRevokedAsync(syncResult.payload.jti);
            if (isRevoked) {
              return {
                authorized: false,
                payload: null as unknown as SessionPayload,
                error: "Unauthorized: Session has been revoked. Please log in again.",
                status: 401 as const,
              };
            }
          } catch {
            if (process.env.NODE_ENV === "production") {
              return {
                authorized: false,
                payload: null as unknown as SessionPayload,
                error: "Unauthorized: Revocation verification failed.",
                status: 401 as const,
              };
            }
          }
        }
        return syncResult;
      })().then(onfulfilled, onrejected);
    },
  };

  return thenableResult;
}

export async function authenticateOperatorRequestAsync(
  req: NextRequest,
  options: { requiredRole?: "coordinator" | "lead_coordinator"; checkCsrf?: boolean } = {}
): Promise<AuthenticateOperatorResult> {
  return await authenticateOperatorRequest(req, options);
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
