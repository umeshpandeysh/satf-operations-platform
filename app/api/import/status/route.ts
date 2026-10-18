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

export async function GET() {
  try {
    const dataset = getCanonicalDataset();
    const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
    const stagedWorkbookAvailable = fs.existsSync(stagedPath);

    return NextResponse.json({
      hasDataset: hasCanonicalDataset(),
      activeMode: getCanonicalMode(),
      importedAt: dataset?.importedAt ?? null,
      summary: dataset?.summary ?? null,
      toursCount: dataset?.tours.length ?? 0,
      ambiguitiesCount: dataset?.ambiguities.length ?? 0,
      duplicatesCount: dataset?.duplicates.length ?? 0,
      stagedWorkbookAvailable,
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
