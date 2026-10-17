import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "@/lib/excel-parser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer | null = null;
    let seasonFilter: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      seasonFilter = (formData.get("seasonFilter") as string) || undefined;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No file was uploaded." },
          { status: 400 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const body = await req.json().catch(() => ({}));
      seasonFilter = body.seasonFilter;

      if (body.action === "load_staged") {
        const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
        if (!fs.existsSync(stagedPath)) {
          return NextResponse.json(
            { success: false, error: "Staged workbook not found at data/source/NEW CHART 2025-2026 (1).xls" },
            { status: 404 }
          );
        }
        buffer = fs.readFileSync(stagedPath);
      } else {
        return NextResponse.json(
          { success: false, error: "Invalid request payload. Expected file upload or { action: 'load_staged' }" },
          { status: 400 }
        );
      }
    }

    const preview = parseExcelWorkbook(buffer, { seasonFilter });
    return NextResponse.json(preview);
  } catch (err) {
    console.error("Import preview error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
