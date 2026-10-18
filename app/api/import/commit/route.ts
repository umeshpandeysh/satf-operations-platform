import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "@/lib/excel-parser";
import { saveCanonicalDataset, validateCanonicalPayload } from "@/lib/canonical-store";
import { authenticateOperatorRequest } from "@/lib/auth";
import type { ImportPreviewResult } from "@/lib/types";

export const dynamic = "force-dynamic";

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
    let result: ImportPreviewResult;

    if (body.action === "commit_staged") {
      const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
      if (!fs.existsSync(stagedPath)) {
        return NextResponse.json(
          { success: false, error: "Staged workbook not found at data/source/NEW CHART 2025-2026 (1).xls" },
          { status: 404 }
        );
      }
      const buffer = fs.readFileSync(stagedPath);
      result = parseExcelWorkbook(buffer, { seasonFilter: body.seasonFilter });
    } else if (body.payload) {
      const validation = validateCanonicalPayload(body.payload);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: `Invalid payload structure: ${validation.error}` },
          { status: 400 }
        );
      }
      result = body.payload as ImportPreviewResult;
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid commit request. Provide { action: 'commit_staged' } or { payload: previewResult }" },
        { status: 400 }
      );
    }

    const saveRes = saveCanonicalDataset(result, "operational");
    if (!saveRes.success) {
      const isValidationError = saveRes.error?.startsWith("Validation failed:");
      return NextResponse.json(
        { success: false, error: saveRes.error || "Failed to persist canonical dataset" },
        { status: isValidationError ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully committed ${result.tours.length} canonical tours from operational workbook.`,
      summary: result.summary,
      count: result.tours.length,
    });
  } catch (err) {
    console.error("Import commit error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
