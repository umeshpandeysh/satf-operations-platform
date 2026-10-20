import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  getCanonicalDataset,
  hasCanonicalDataset,
  getCanonicalMode,
  setCanonicalMode,
  clearCanonicalDataset,
} from "@/lib/canonical-store";
import { authenticateOperatorRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: false });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const dataset = getCanonicalDataset();
    const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
    const stagedWorkbookAvailable = fs.existsSync(stagedPath);

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const database = {
      configured: Boolean(supabaseUrl && serviceKey),
      connected: false,
      liveToursCount: null as number | null,
      liveAuditCount: null as number | null,
    };

    if (supabaseUrl && serviceKey) {
      try {
        const [toursRes, auditRes] = await Promise.all([
          fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/satf_operational_tours?select=count`, {
            method: "HEAD",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: "count=exact",
            },
            signal: AbortSignal.timeout(2500),
          }),
          fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/satf_audit_log?select=count`, {
            method: "HEAD",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: "count=exact",
            },
            signal: AbortSignal.timeout(2500),
          }),
        ]);

        if (toursRes.ok) {
          database.connected = true;
          const range = toursRes.headers.get("content-range");
          if (range) database.liveToursCount = parseInt(range.split("/")[1], 10);
        }
        if (auditRes.ok) {
          const range = auditRes.headers.get("content-range");
          if (range) database.liveAuditCount = parseInt(range.split("/")[1], 10);
        }
      } catch {
        // network or timeout fallback
      }
    }

    return NextResponse.json({
      hasDataset: hasCanonicalDataset(),
      activeMode: getCanonicalMode(),
      importedAt: dataset?.importedAt ?? null,
      summary: dataset?.summary ?? null,
      toursCount: dataset?.tours.length ?? 0,
      ambiguitiesCount: dataset?.ambiguities.length ?? 0,
      duplicatesCount: dataset?.duplicates.length ?? 0,
      stagedWorkbookAvailable,
      database,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json().catch(() => ({}));

    if (body.action === "clear") {
      if (auth.payload.role !== "lead_coordinator") {
        return NextResponse.json(
          { success: false, error: "Forbidden: Clearing the canonical dataset requires Lead Coordinator privileges." },
          { status: 403 }
        );
      }
      const res = clearCanonicalDataset();
      return NextResponse.json(res);
    }

    if (body.mode === "operational" || body.mode === "demo") {
      const res = setCanonicalMode(body.mode);
      return NextResponse.json(res);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Expected { mode: 'operational' | 'demo' } or { action: 'clear' }" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
