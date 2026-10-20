import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  parseExcelWorkbook,
  validateExcelSignature,
  MAX_WORKBOOK_SIZE_BYTES,
} from "@/lib/excel-parser";
import { authenticateOperatorRequest } from "@/lib/auth";
import type { ImportPreviewResult, Tour } from "@/lib/types";
import { compareIncomingWithExisting } from "@/lib/operations";
import { getPersistentTours, getDatabaseConfigStatus } from "@/lib/operational-store";
import { getCanonicalDataset } from "@/lib/canonical-store";

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

    // 1. Early Content-Length validation prior to buffering multipart body
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const bytes = parseInt(contentLength, 10);
      if (!isNaN(bytes) && bytes > MAX_WORKBOOK_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `File size exceeds the maximum limit of 25 MB (received ${Math.round(
              bytes / (1024 * 1024)
            )} MB).`,
          },
          { status: 413 }
        );
      }
    }

    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer | null = null;
    let seasonFilter: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      seasonFilter = (formData.get("seasonFilter") as string) || undefined;

      if (!file || typeof file === "string") {
        return NextResponse.json(
          { success: false, error: "No file was uploaded." },
          { status: 400 }
        );
      }

      // 2. Validate file size
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: "The uploaded file is empty." },
          { status: 400 }
        );
      }

      if (file.size > MAX_WORKBOOK_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `File size exceeds the maximum limit of 25 MB (received ${Math.round(
              file.size / (1024 * 1024)
            )} MB).`,
          },
          { status: 413 }
        );
      }

      // 3. Validate file extension
      const fileName = (file.name || "").toLowerCase().trim();
      const isXls = fileName.endsWith(".xls");
      const isXlsx = fileName.endsWith(".xlsx");

      if (!isXls && !isXlsx) {
        return NextResponse.json(
          {
            success: false,
            error: "Unsupported file type. Only Excel workbooks (.xls and .xlsx) are accepted.",
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // 4. Validate file signature (magic bytes)
      const expectedFormat = isXls ? "xls" : "xlsx";
      if (!validateExcelSignature(buffer, expectedFormat)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid file signature: Content does not match a valid ${
              isXls ? ".xls (OLE2 Compound Document)" : ".xlsx (ZIP Archive)"
            } spreadsheet.`,
          },
          { status: 400 }
        );
      }
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

        const stat = fs.statSync(stagedPath);
        if (stat.size > MAX_WORKBOOK_SIZE_BYTES) {
          return NextResponse.json(
            { success: false, error: "Staged workbook exceeds the 25 MB limit." },
            { status: 413 }
          );
        }

        buffer = fs.readFileSync(stagedPath);
        if (!validateExcelSignature(buffer)) {
          return NextResponse.json(
            { success: false, error: "Staged workbook has an invalid or corrupted file signature." },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { success: false, error: "Invalid request payload. Expected file upload or { action: 'load_staged' }" },
          { status: 400 }
        );
      }
    }

    // 5. Safe Parsing with Graceful Error Trapping
    let preview: ImportPreviewResult;
    try {
      preview = parseExcelWorkbook(buffer, { seasonFilter });
    } catch (parseErr) {
      console.error("Workbook parsing error:", parseErr instanceof Error ? parseErr.message : parseErr);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to parse workbook: File content is corrupted or contains an invalid Excel internal structure.",
        },
        { status: 400 }
      );
    }

    // 6. Safe Read-Only Comparison with Current Operational Dataset (Zero Mutations)
    let existingTours: Tour[] = [];
    let comparedAgainst: "none" | "persistent_database" | "canonical_store" = "none";

    const dbStatus = getDatabaseConfigStatus();
    if (dbStatus.configured) {
      try {
        const dbRes = await getPersistentTours();
        if (dbRes.success && dbRes.data) {
          existingTours = dbRes.data;
          comparedAgainst = "persistent_database";
        }
      } catch (err) {
        console.warn("Notice: could not query persistent database for import preview comparison:", err);
      }
    }

    if (comparedAgainst === "none") {
      try {
        const canonical = getCanonicalDataset();
        if (canonical && Array.isArray(canonical.tours)) {
          existingTours = canonical.tours;
          comparedAgainst = "canonical_store";
        }
      } catch {
        // Safe degradation: comparison optional
      }
    }

    if (comparedAgainst !== "none") {
      const comparison = compareIncomingWithExisting(preview.tours, existingTours, comparedAgainst);
      preview.existingComparison = comparison;
      preview.summary.existingComparison = comparison;
    }

    return NextResponse.json(preview);
  } catch (err) {
    console.error("Import preview error:", err);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while processing the workbook preview." },
      { status: 500 }
    );
  }
}
