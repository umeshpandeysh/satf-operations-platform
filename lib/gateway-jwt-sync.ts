import crypto from "node:crypto";
import {
  VerifyOptions,
  VerifyResult,
  testJwkRawMap,
  base64UrlToString,
} from "./gateway-jwt";

/**
 * Synchronous verification of Cloudflare Access RS256 JWT for Node.js runtime.
 */
export function verifyCloudflareAccessJwtSync(
  token: string | null | undefined,
  options: VerifyOptions = {}
): VerifyResult {
  if (!token) {
    return {
      valid: false,
      error: "Missing Cloudflare Access JWT assertion header.",
      statusCode: 401,
    };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return {
      valid: false,
      error: "Malformed JWT assertion format.",
      statusCode: 401,
    };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: {
    iss?: string;
    aud?: string | string[];
    email?: string;
    sub?: string;
    exp?: number;
    nbf?: number;
    iat?: number;
    identity_nonce?: string;
    name?: string;
  };

  try {
    header = JSON.parse(base64UrlToString(headerB64));
    payload = JSON.parse(base64UrlToString(payloadB64));
  } catch {
    return {
      valid: false,
      error: "Invalid base64url encoding in JWT assertion.",
      statusCode: 401,
    };
  }

  if (header.alg !== "RS256" || !header.kid) {
    return {
      valid: false,
      error: "Invalid JWT header: RS256 algorithm and kid required.",
      statusCode: 401,
    };
  }

  const teamName = options.teamName || process.env.CF_ACCESS_TEAM_NAME;
  const expectedIss = `https://${teamName}.cloudflareaccess.com`;
  if (teamName && payload.iss !== expectedIss) {
    return {
      valid: false,
      error: `JWT issuer mismatch: expected '${expectedIss}', got '${payload.iss}'.`,
      statusCode: 401,
    };
  }

  const expectedAud = options.expectedAud || process.env.CF_ACCESS_AUD;
  if (expectedAud) {
    const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud || ""];
    if (!audArray.includes(expectedAud)) {
      return {
        valid: false,
        error: `JWT audience mismatch: '${expectedAud}' not found in audience tags.`,
        statusCode: 401,
      };
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 60;

  if (payload.exp && payload.exp + tolerance < nowSeconds) {
    return { valid: false, error: "JWT assertion has expired.", statusCode: 401 };
  }

  if (payload.nbf && payload.nbf - tolerance > nowSeconds) {
    return { valid: false, error: "JWT assertion is not yet valid (nbf).", statusCode: 401 };
  }

  const userEmail = payload.email || (payload.sub && payload.sub.includes("@") ? payload.sub : undefined);
  if (!userEmail) {
    return { valid: false, error: "JWT assertion missing valid user email identity.", statusCode: 401 };
  }

  const rawJwk = testJwkRawMap.get(header.kid);
  if (!rawJwk) {
    return {
      valid: false,
      error: `Public certificate not found for key ID '${header.kid}'.`,
      statusCode: 401,
    };
  }

  try {
    const keyObject = crypto.createPublicKey({
      key: rawJwk as unknown as Record<string, unknown>,
      format: "jwk",
    });
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureBuffer = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const isSignatureValid = verifier.verify(keyObject, signatureBuffer);

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
      exp: payload.exp || 0,
      iat: payload.iat || nowSeconds,
      identityNonce: payload.identity_nonce,
      name: payload.name,
    },
  };
}
