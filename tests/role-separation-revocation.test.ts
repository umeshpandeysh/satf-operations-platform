import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  getPassphraseRole,
  createSessionToken,
  verifySessionToken,
  revokeSession,
  isSessionRevoked,
  isSessionRevokedAsync,
  authenticateOperatorRequest,
  authenticateOperatorRequestAsync,
  COOKIE_NAME,
} from "../lib/auth";

test("Role Separation & Session Revocation Verification", async (t) => {
  // Backup environment variables
  const origOp = process.env.SATF_OPERATOR_PASSPHRASE;
  const origAdmin = process.env.SATF_ADMIN_PASSPHRASE;
  const origSecret = process.env.SATF_SESSION_SECRET;

  t.after(() => {
    process.env.SATF_OPERATOR_PASSPHRASE = origOp;
    process.env.SATF_ADMIN_PASSPHRASE = origAdmin;
    process.env.SATF_SESSION_SECRET = origSecret;
  });

  // Set distinct test passphrases
  const TEST_OP_PASS = "operator-secure-passphrase-testing-32c";
  const TEST_ADMIN_PASS = "admin-lead-coord-passphrase-test-32c";
  process.env.SATF_OPERATOR_PASSPHRASE = TEST_OP_PASS;
  process.env.SATF_ADMIN_PASSPHRASE = TEST_ADMIN_PASS;
  process.env.SATF_SESSION_SECRET = "satf-test-session-secret-for-local-unit-tests-only-min32";

  // Scenario 1: Operator credentials produce ONLY coordinator
  await t.test("Scenario 1: Operator credentials produce ONLY 'coordinator' role", async () => {
    const role = getPassphraseRole(TEST_OP_PASS);
    assert.strictEqual(role, "coordinator");

    const { POST: loginRoute } = await import("../app/api/auth/login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: TEST_OP_PASS, operatorName: "Duty Dispatcher" }),
    });
    const res = await loginRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.role, "coordinator");
  });

  // Scenario 2: Admin credentials produce lead_coordinator
  await t.test("Scenario 2: Admin credentials produce ONLY 'lead_coordinator' role", async () => {
    const role = getPassphraseRole(TEST_ADMIN_PASS);
    assert.strictEqual(role, "lead_coordinator");

    const { POST: loginRoute } = await import("../app/api/auth/login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: TEST_ADMIN_PASS, operatorName: "Lead Officer" }),
    });
    const res = await loginRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.role, "lead_coordinator");
  });

  // Scenario 3: Invalid credentials produce no session (HTTP 401)
  await t.test("Scenario 3: Invalid credentials return HTTP 401 without creating session", async () => {
    const role = getPassphraseRole("completely-wrong-passphrase-here");
    assert.strictEqual(role, null);

    const { POST: loginRoute } = await import("../app/api/auth/login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "invalid-passphrase" }),
    });
    const res = await loginRoute(req);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.error, /Invalid passphrase/);
  });

  // Scenario 4: Changing operatorName, role, or client fields cannot elevate privileges
  await t.test("Scenario 4: Client spoofing role or operatorName cannot elevate privileges", async () => {
    // 4A: Passing operatorName='Lead Coordinator' with operator passphrase
    const { POST: loginRoute } = await import("../app/api/auth/login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passphrase: TEST_OP_PASS,
        operatorName: "Lead Coordinator Administrator Boss",
        role: "lead_coordinator", // Client attempts to inject role
      }),
    });
    const res = await loginRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    // Role MUST remain coordinator regardless of client claim or operatorName
    assert.strictEqual(data.role, "coordinator");

    // 4B: createSessionToken with operatorName='Lead Coordinator' but role unspecified
    const session = createSessionToken("Lead Coordinator");
    assert.strictEqual(session.payload.role, "coordinator");

    // 4C: createSessionToken with untrusted role spoof
    const sessionSpoof = createSessionToken("Lead", { role: "superuser" });
    assert.strictEqual(sessionSpoof.payload.role, "coordinator");
  });

  // Scenario 5: Coordinator receives HTTP 403 for lead-only actions
  await t.test("Scenario 5: Coordinator receives HTTP 403 for lead-only actions", async () => {
    const coordSession = createSessionToken("Regular Coordinator", { role: "coordinator" });
    const req = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${coordSession.token}`,
        "x-csrf-token": coordSession.payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: { tours: [], ambiguities: [], duplicates: [], errors: [] } }),
    });

    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    assert.strictEqual(auth.authorized, false);
    assert.strictEqual(auth.status, 403);
    assert.match(auth.error || "", /Lead Coordinator/);
  });

  // Scenario 6: Lead coordinator can perform authorized lead-only actions
  await t.test("Scenario 6: Lead coordinator passes authorization for lead-only actions", async () => {
    const leadSession = createSessionToken("Head Coordinator", { role: "lead_coordinator" });
    const req = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${leadSession.token}`,
        "x-csrf-token": leadSession.payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    assert.strictEqual(auth.authorized, true);
    assert.strictEqual(auth.status, 200);
    assert.strictEqual(auth.payload.role, "lead_coordinator");
  });

  // Scenario 7: Missing or colliding credentials never grant elevated access (fails closed)
  await t.test("Scenario 7: Colliding or missing credentials fail closed to coordinator or null", async () => {
    // 7A: Colliding credentials (adminPass === opPass)
    process.env.SATF_OPERATOR_PASSPHRASE = "identical-collision-secret-32ch";
    process.env.SATF_ADMIN_PASSPHRASE = "identical-collision-secret-32ch";

    const collidedRole = getPassphraseRole("identical-collision-secret-32ch");
    // Under collision, MUST fail closed to "coordinator" and NEVER grant "lead_coordinator"
    assert.strictEqual(collidedRole, "coordinator");

    // 7B: Missing credentials
    delete process.env.SATF_OPERATOR_PASSPHRASE;
    delete process.env.SATF_ADMIN_PASSPHRASE;

    const missingRole = getPassphraseRole("any-passphrase");
    assert.strictEqual(missingRole, null);
  });

  // Scenario 8: Session revocation across instances
  await t.test("Scenario 8: Session revocation rejects logged out and revoked tokens", async () => {
    process.env.SATF_SESSION_SECRET = "satf-test-session-secret-for-local-unit-tests-only-min32";
    const session = createSessionToken("Test Coordinator", { role: "coordinator" });
    const jti = session.payload.jti;
    assert.ok(jti, "Session must contain jti");

    // 8A: Initially valid
    const preRevoke = verifySessionToken(session.token);
    assert.strictEqual(preRevoke.valid, true);

    // 8B: Revoke session
    await revokeSession(jti, session.payload.exp);

    // 8C: Synchronous verification rejects
    assert.strictEqual(isSessionRevoked(jti), true);
    const postRevokeSync = verifySessionToken(session.token);
    assert.strictEqual(postRevokeSync.valid, false);
    assert.match(postRevokeSync.error || "", /revoked/i);

    // 8D: Asynchronous cross-instance verification rejects
    const postRevokeAsync = await isSessionRevokedAsync(jti);
    assert.strictEqual(postRevokeAsync, true);

    // 8E: authenticateOperatorRequest rejects revoked session
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: { cookie: `${COOKIE_NAME}=${session.token}` },
    });
    const authResult = await authenticateOperatorRequestAsync(req);
    assert.strictEqual(authResult.authorized, false);
    assert.strictEqual(authResult.status, 401);
    assert.match(authResult.error || "", /revoked/i);
  });

  // Scenario 9: Reproducible concurrency test issuing multiple independent revocations
  await t.test("Scenario 9: Concurrent independent revocations preserve every revoked token without overwrite", async () => {
    const concurrentSessions = Array.from({ length: 8 }, (_, i) =>
      createSessionToken(`Coordinator ${i}`, { role: "coordinator" })
    );

    // Issue all revocations simultaneously in parallel
    await Promise.all(
      concurrentSessions.map((s) => {
        const jti = s.payload.jti;
        assert.ok(jti);
        return revokeSession(jti, s.payload.exp);
      })
    );

    // Verify every single token remains revoked (no overwrite from race conditions)
    for (const s of concurrentSessions) {
      const jti = s.payload.jti;
      assert.ok(jti);
      const isRev = await isSessionRevokedAsync(jti);
      assert.strictEqual(isRev, true, `Token ${jti} must remain revoked`);
      const verification = verifySessionToken(s.token);
      assert.strictEqual(verification.valid, false);
    }
  });

  // Scenario 10: Cross-instance verification in a separate isolated process (simulated serverless container)
  await t.test("Scenario 10: Revoked token is rejected in separate isolated execution context", async () => {
    const session = createSessionToken("Serverless User", { role: "coordinator" });
    const jti = session.payload.jti;
    assert.ok(jti);

    // Revoke token in current instance
    await revokeSession(jti, session.payload.exp);

    // Run verification in a completely separate Node.js process with clean memory
    const { execFileSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tmpDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join("data", ".test_isolated_instance.ts");

    fs.writeFileSync(
      tmpFile,
      `import { isSessionRevokedAsync, verifySessionToken } from "../lib/auth";
async function run() {
  const isRev = await isSessionRevokedAsync("${jti}");
  const ver = verifySessionToken("${session.token}");
  if (!isRev || ver.valid) {
    process.exit(1);
  }
  process.exit(0);
}
run().catch(() => process.exit(2));
`
    );

    try {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      assert.doesNotThrow(() => {
        execFileSync(npxCmd, ["tsx", `"${tmpFile}"`], {
          shell: true,
          cwd: process.cwd(),
          env: {
            ...process.env,
            SATF_SESSION_SECRET: "satf-test-session-secret-for-local-unit-tests-only-min32",
          },
        });
      }, "Isolated process must verify that the token is revoked");
    } finally {
      if (fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }
  });
});
