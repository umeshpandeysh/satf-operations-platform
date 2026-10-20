export interface GatewayIdentity {
  email: string;
  sub: string;
  aud: string[];
  iss: string;
  exp: number;
  iat: number;
  identityNonce?: string;
  name?: string;
  custom?: Record<string, unknown>;
}

export interface VerifyResult {
  valid: boolean;
  identity?: GatewayIdentity;
  error?: string;
  statusCode?: 401 | 403 | 500;
}

export interface VerifyOptions {
  teamName?: string;
  expectedAud?: string;
  clockToleranceSeconds?: number;
  customJwksUrl?: string;
}

// In-memory JWKS cache holding CryptoKey instances
interface KeyCacheEntry {
  cryptoKey: CryptoKey;
  fetchedAt: number;
}

const keyCache = new Map<string, KeyCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let lastJwksFetchTimestamp = 0;
const MIN_FETCH_INTERVAL_MS = 5000; // Rate limit dynamic key fetches to 1 per 5s

// Registry for synthetic test keys in unit tests
const testKeyRegistry = new Map<string, { cryptoKey: CryptoKey; teamName: string }>();
export const testJwkRawMap = new Map<string, JsonWebKey>();

/**
 * Register a synthetic JWK for offline testing in unit tests.
 */
export async function registerTestJwksKey(
  kid: string,
  publicKeyJwk: JsonWebKey,
  teamName = "satf-ops"
): Promise<void> {
  testJwkRawMap.set(kid, publicKeyJwk);
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    testKeyRegistry.set(kid, { cryptoKey, teamName });
  } catch (err) {
    console.error("Failed to register test JWK key:", err);
  }
}

/**
 * Clear test keys and JWKS cache (used in test teardown).
 */
export function clearJwksCache(): void {
  keyCache.clear();
  testKeyRegistry.clear();
  testJwkRawMap.clear();
  lastJwksFetchTimestamp = 0;
}

/**
 * Base64URL decoder using universal Web APIs.
 */
function base64UrlToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLen);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlToString(str: string): string {
  const bytes = base64UrlToUint8Array(str);
  return new TextDecoder().decode(bytes);
}

/**
 * Get public key from test registry or memory cache.
 */
function getCachedPublicKey(kid: string): CryptoKey | null {
  if (testKeyRegistry.has(kid)) {
    return testKeyRegistry.get(kid)!.cryptoKey;
  }
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.cryptoKey;
  }
  return null;
}

/**
 * Fetch and import public keys dynamically from Cloudflare JWKS endpoint.
 */
async function fetchAndCacheJwks(teamName: string, customJwksUrl?: string): Promise<void> {
  const now = Date.now();
  if (now - lastJwksFetchTimestamp < MIN_FETCH_INTERVAL_MS) {
    return;
  }

  lastJwksFetchTimestamp = now;
  const jwksUrl = customJwksUrl || `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;

  try {
    const res = await fetch(jwksUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return;

    const data = await res.json() as {
      keys?: Array<JsonWebKey & { kid?: string }>;
    };

    if (data && Array.isArray(data.keys)) {
      for (const key of data.keys) {
        if (key.kid && key.kty === "RSA") {
          try {
            const cryptoKey = await crypto.subtle.importKey(
              "jwk",
              key,
              { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
              false,
              ["verify"]
            );
            keyCache.set(key.kid, { cryptoKey, fetchedAt: now });
          } catch {
            // Skip invalid key format
          }
        }
      }
    }
  } catch {
    // Network or timeout failure handled gracefully
  }
}

/**
 * Universal Web Crypto verification of Cloudflare Access RS256 JWT assertion.
 * Fully compatible with Next.js Edge Runtime, Node.js runtime, and browsers.
 */
export async function verifyCloudflareAccessJwt(
  assertion: string | null | undefined,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const isProduction = process.env.NODE_ENV === "production";
  const teamName = options.teamName || process.env.CF_ACCESS_TEAM_NAME;
  const expectedAud = options.expectedAud || process.env.CF_ACCESS_AUD;

  // Fail-closed in production if required gateway parameters are missing
  if (isProduction && (!teamName || !expectedAud)) {
    return {
      valid: false,
      error: "Gateway configuration missing. Failing closed in production.",
      statusCode: 500,
    };
  }

  if (!assertion || typeof assertion !== "string") {
    return {
      valid: false,
      error: "Missing Cloudflare Access JWT assertion header (cf-access-jwt-assertion).",
      statusCode: 401,
    };
  }

  const parts = assertion.trim().split(".");
  if (parts.length !== 3) {
    return {
      valid: false,
      error: "Malformed JWT assertion. Expected 3 base64url segments.",
      statusCode: 401,
    };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Parse header
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    const rawHeader = base64UrlToString(headerB64);
    header = JSON.parse(rawHeader);
  } catch {
    return { valid: false, error: "Failed to parse JWT header.", statusCode: 401 };
  }

  if (header.alg !== "RS256") {
    return {
      valid: false,
      error: `Invalid JWT algorithm '${header.alg}'. Strictly RS256 is required.`,
      statusCode: 401,
    };
  }

  if (!header.kid) {
    return { valid: false, error: "JWT header missing key ID ('kid').", statusCode: 401 };
  }

  // 2. Parse payload
  let payload: {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    nbf?: number;
    sub?: string;
    email?: string;
    name?: string;
    identity_nonce?: string;
  };

  try {
    const rawPayload = base64UrlToString(payloadB64);
    payload = JSON.parse(rawPayload);
  } catch {
    return { valid: false, error: "Failed to parse JWT payload.", statusCode: 401 };
  }

  // 3. Validate issuer
  if (teamName) {
    const expectedIssuer = `https://${teamName}.cloudflareaccess.com`;
    if (payload.iss !== expectedIssuer) {
      return {
        valid: false,
        error: `JWT issuer mismatch. Expected '${expectedIssuer}', received '${payload.iss}'.`,
        statusCode: 401,
      };
    }
  }

  // 4. Validate audience
  if (expectedAud) {
    const audienceList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audienceList.includes(expectedAud)) {
      return {
        valid: false,
        error: `JWT audience mismatch. Token not issued for this application AUD.`,
        statusCode: 401,
      };
    }
  }

  // 5. Validate expiration & timing (with clock tolerance)
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 60;

  if (!payload.exp || typeof payload.exp !== "number") {
    return { valid: false, error: "JWT missing expiration claim ('exp').", statusCode: 401 };
  }

  if (payload.exp + tolerance < nowSeconds) {
    return { valid: false, error: "JWT assertion has expired.", statusCode: 401 };
  }

  if (payload.nbf && payload.nbf - tolerance > nowSeconds) {
    return { valid: false, error: "JWT assertion is not yet valid (nbf).", statusCode: 401 };
  }

  // 6. Validate identity presence
  const userEmail = payload.email || (payload.sub && payload.sub.includes("@") ? payload.sub : undefined);
  if (!userEmail) {
    return { valid: false, error: "JWT assertion missing valid user email identity.", statusCode: 401 };
  }

  // 7. Resolve public key (check cache first, then fetch from JWKS if missing)
  let cryptoKey = getCachedPublicKey(header.kid);
  if (!cryptoKey) {
    await fetchAndCacheJwks(teamName || "satf-ops", options.customJwksUrl);
    cryptoKey = getCachedPublicKey(header.kid);
  }

  if (!cryptoKey) {
    return {
      valid: false,
      error: `Public certificate not found for key ID '${header.kid}'.`,
      statusCode: 401,
    };
  }

  // 8. Cryptographic RSASSA-PKCS1-v1_5 signature verification via Web Crypto
  try {
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToUint8Array(signatureB64);

    const isSignatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      signedData
    );

    if (!isSignatureValid) {
      return { valid: false, error: "Invalid cryptographic JWT signature.", statusCode: 401 };
    }
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      statusCode: 401,
    };
  }

  return {
    valid: true,
    identity: {
      email: userEmail.toLowerCase().trim(),
      sub: payload.sub || userEmail,
      aud: Array.isArray(payload.aud) ? payload.aud : [payload.aud || ""],
      iss: payload.iss || "",
      exp: payload.exp,
      iat: payload.iat || nowSeconds,
      identityNonce: payload.identity_nonce,
      name: payload.name,
    },
  };
}
