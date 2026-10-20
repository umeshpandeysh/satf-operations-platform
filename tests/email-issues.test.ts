import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getEmailGatewayConfiguration,
  maskSecret,
  sanitizeHtmlToText,
  extractBookingReference,
  inferIssueCategory,
  inferIssuePriority,
  getMicrosoftGraphToken,
  testEmailGatewayConnection,
  fetchInboundIssues,
  EmailProviderCredentials,
} from "../lib/email-issues";

describe("SATF Client Email Integration — Mailbox Sync, Sanitization & Security", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.SATF_EMAIL_PROVIDER;
    delete process.env.SATF_EMAIL_USER;
    delete process.env.SATF_EMAIL_SECRET;
    delete process.env.SATF_M365_TENANT_ID;
    delete process.env.SATF_M365_CLIENT_ID;
    delete process.env.SATF_M365_CLIENT_SECRET;
    delete process.env.SATF_GWORKSPACE_CLIENT_ID;
    delete process.env.SATF_GWORKSPACE_CLIENT_SECRET;
    delete process.env.SATF_GWORKSPACE_REFRESH_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("unconfigured environment fails closed with honest disconnected status", () => {
    const config = getEmailGatewayConfiguration();
    assert.strictEqual(config.configured, false);
    assert.strictEqual(config.provider, "unconfigured");
    assert.strictEqual(config.connectionStatus, "disconnected");
    assert.ok(config.message?.includes("not configured"));
    assert.ok(config.instructions?.includes("SATF_EMAIL_PROVIDER"));
  });

  test("incomplete Microsoft 365 configuration returns disconnected with required fields", () => {
    process.env.SATF_EMAIL_PROVIDER = "microsoft_365";
    process.env.SATF_EMAIL_USER = "ops@southasiatravelfactory.com";
    // Missing tenant, client ID, secret

    const config = getEmailGatewayConfiguration();
    assert.strictEqual(config.configured, false);
    assert.strictEqual(config.provider, "microsoft_365");
    assert.strictEqual(config.connectionStatus, "disconnected");
    assert.ok(config.message?.includes("Tenant ID, Client ID, or Client Secret missing"));
  });

  test("maskSecret never leaks plain text secrets", () => {
    assert.strictEqual(maskSecret(""), "");
    assert.strictEqual(maskSecret("secret"), "******");
    assert.strictEqual(maskSecret("super_long_azure_client_secret_xyz123"), "sup...123");
  });

  test("sanitizeHtmlToText strips markup, scripts, and normalizes entities", () => {
    const rawHtml = `
      <div>
        <p>Dear SATF Team,</p>
        <script>alert('xss');</script>
        <p>Our flight &amp; transfer will be delayed by 2 hours. Arrival is <strong>14:30</strong> &nbsp; IST.</p>
        <style>body { color: red; }</style>
      </div>
    `;

    const cleaned = sanitizeHtmlToText(rawHtml);
    assert.ok(!cleaned.includes("<p>"), "Must strip <p> tags");
    assert.ok(!cleaned.includes("alert"), "Must strip <script> content");
    assert.ok(!cleaned.includes("color: red"), "Must strip <style> content");
    assert.ok(cleaned.includes("flight & transfer will be delayed by 2 hours"), "Must preserve unescaped ampersand");
    assert.ok(cleaned.includes("14:30 IST"), "Must decode non-breaking spaces");
  });

  test("extractBookingReference extracts valid SATF and numeric booking codes", () => {
    assert.strictEqual(
      extractBookingReference("Flight delay for tour SATF-2025-992"),
      "SATF-2025-992"
    );
    assert.strictEqual(
      extractBookingReference("Regarding reservation SATF9918 for Mr. Tanaka"),
      "SATF9918"
    );
    assert.strictEqual(
      extractBookingReference("Arrival transfer manifest 35687 Golden Triangle"),
      "35687"
    );
    assert.strictEqual(
      extractBookingReference("General inquiry about best season for Kerala"),
      undefined
    );
  });

  test("inferIssueCategory identifies appropriate operational category", () => {
    assert.strictEqual(
      inferIssueCategory("Flight AI-307 Delayed by 3 Hours", "Inbound landing delayed to terminal 3"),
      "flight_delay"
    );
    assert.strictEqual(
      inferIssueCategory("Room change request", "Client prefers twin beds at Trident Agra"),
      "hotel_change"
    );
    assert.strictEqual(
      inferIssueCategory("Japanese Speaking Guide Confirmation", "Need escort in Jaipur"),
      "guide_request"
    );
    assert.strictEqual(
      inferIssueCategory("Unhappy with AC", "Bus air conditioning broken, terrible experience"),
      "complaint"
    );
    assert.strictEqual(
      inferIssueCategory("Packing advice", "What should travelers wear in Varanasi?"),
      "general_inquiry"
    );
  });

  test("inferIssuePriority recognizes urgent, high, and normal priority keywords", () => {
    assert.strictEqual(
      inferIssuePriority("Emergency at hotel", "Guest injured, urgent assistance needed"),
      "urgent"
    );
    assert.strictEqual(
      inferIssuePriority("Flight Cancelled", "Flight cancelled for tomorrow"),
      "high"
    );
    assert.strictEqual(
      inferIssuePriority("Weather inquiry", "Will it rain next week?"),
      "low"
    );
  });

  test("getMicrosoftGraphToken handles 401/403 permission denial without leaking secrets", async () => {
    const creds: EmailProviderCredentials = {
      provider: "microsoft_365",
      mailbox: "ops@southasiatravelfactory.com",
      tenantId: "mock-tenant-id",
      clientId: "mock-client-id",
      clientSecret: "mock-client-secret",
    };

    const mockFetch: typeof fetch = async (url) => {
      assert.ok(url.toString().includes("login.microsoftonline.com"));
      return new Response(
        JSON.stringify({
          error: "unauthorized_client",
          error_description: "AADSTS700016: Application with identifier mock-client-id was not found.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await getMicrosoftGraphToken(creds, mockFetch);
    assert.strictEqual(result.status, "permission_denied");
    assert.ok(result.error?.includes("unauthorized_client") || result.error?.includes("AADSTS700016"));
    assert.ok(!result.error?.includes("mock-client-secret"), "Must not leak secret in error message");
  });

  test("fetchInboundIssues deduplicates messages and handles pagination with real Graph structure", async () => {
    process.env.SATF_EMAIL_PROVIDER = "microsoft_365";
    process.env.SATF_EMAIL_USER = "ops@southasiatravelfactory.com";
    process.env.SATF_M365_TENANT_ID = "00000000-0000-0000-0000-000000000001";
    process.env.SATF_M365_CLIENT_ID = "00000000-0000-0000-0000-000000000002";
    process.env.SATF_M365_CLIENT_SECRET = "super-secret-token-key";

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes("login.microsoftonline.com")) {
        return new Response(
          JSON.stringify({
            access_token: "mock_jwt_access_token_value",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("graph.microsoft.com")) {
        return new Response(
          JSON.stringify({
            "@odata.count": 2,
            value: [
              {
                id: "msg-001",
                internetMessageId: "<msg001@client.jp>",
                subject: "Urgent: Flight NH-837 delay update for SATF-2025-0102",
                bodyPreview: "Flight NH-837 will arrive 45 minutes late into DEL Terminal 3.",
                body: {
                  contentType: "text/html",
                  content: "<p>Flight NH-837 will arrive 45 minutes late into DEL Terminal 3.</p>",
                },
                from: {
                  emailAddress: {
                    name: "JTB Global Dispatch",
                    address: "dispatch@jtb.co.jp",
                  },
                },
                receivedDateTime: "2026-10-20T08:15:00Z",
                importance: "high",
              },
              // Duplicate ID test
              {
                id: "msg-001",
                subject: "Duplicate record should be filtered",
              },
              {
                id: "msg-002",
                internetMessageId: "<msg002@client.jp>",
                subject: "Hotel check-in confirmation Trident Agra booking 35687",
                bodyPreview: "Please confirm early check-in for group at Trident Agra.",
                from: {
                  emailAddress: {
                    name: "HIS Tours Japan",
                    address: "inbound@his-world.com",
                  },
                },
                receivedDateTime: "2026-10-20T07:30:00Z",
                importance: "normal",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    };

    const res = await fetchInboundIssues({ page: 1, pageSize: 10, fetchFn: mockFetch });

    assert.strictEqual(res.gateway.configured, true);
    assert.strictEqual(res.gateway.connectionStatus, "connected");
    assert.strictEqual(res.issues.length, 2, "Duplicate msg-001 must be deduplicated to 2 issues");

    const issue1 = res.issues[0];
    assert.strictEqual(issue1.id, "msg-001");
    assert.strictEqual(issue1.bookingReference, "SATF-2025-0102");
    assert.strictEqual(issue1.category, "flight_delay");
    assert.strictEqual(issue1.priority, "urgent");
    assert.strictEqual(issue1.senderName, "JTB Global Dispatch");

    const issue2 = res.issues[1];
    assert.strictEqual(issue2.id, "msg-002");
    assert.strictEqual(issue2.bookingReference, "35687");
    assert.strictEqual(issue2.category, "hotel_change");
    assert.strictEqual(issue2.priority, "medium");
  });
});
