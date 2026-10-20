import fs from "node:fs";
import path from "node:path";
import type { Tour, ImportPreviewResult, ImportSummary, TourStatus } from "./types";
import { computeTourLifecycleStatus } from "./operations";
import { getIndiaTodayISO } from "./utils";

const DATA_DIR = path.resolve(process.cwd(), "data/imported");
const CANONICAL_FILE = path.join(DATA_DIR, "canonical_dataset.json");
const BACKUP_FILE = path.join(DATA_DIR, "canonical_dataset.backup.json");

/**
 * Architectural Note:
 * Atomic file replacement with pre-write backups protects local filesystem
 * integrity on a single server or workstation against crashes, incomplete writes,
 * and sudden power loss.
 *
 * It is NOT suitable for serverless or multi-instance cloud production (e.g. Vercel,
 * AWS Lambda, multi-container deployments) where local filesystems are ephemeral,
 * non-shared, or read-only. Multi-user production requires an ACID database
 * (PostgreSQL / Supabase) with transactional locking.
 */

export interface StoredCanonicalPayload {
  activeMode: "operational" | "demo";
  importedAt: string;
  summary: ImportSummary;
  tours: Tour[];
  ambiguities: ImportPreviewResult["ambiguities"];
  duplicates: ImportPreviewResult["duplicates"];
  errors: ImportPreviewResult["errors"];
}

let inMemoryCache: StoredCanonicalPayload | null = null;
let cacheMtime: number = 0;

const VALID_STATUSES: Set<TourStatus> = new Set([
  "upcoming",
  "active",
  "completed",
  "cancelled",
  "attention",
]);

/**
 * Validate incoming import preview result or raw payload structure before persistence.
 * Rejects malformed structures, missing required fields, and inconsistent summary counts.
 */
export function validateCanonicalPayload(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Payload must be a non-null object." };
  }

  const p = data as Partial<ImportPreviewResult>;

  // 1. Summary validation
  if (!p.summary || typeof p.summary !== "object") {
    return { valid: false, error: "Missing or invalid 'summary' metadata in payload." };
  }
  const s = p.summary;
  if (
    typeof s.canonicalToursCount !== "number" ||
    typeof s.totalTourBlocks !== "number" ||
    typeof s.totalSheetsFound !== "number"
  ) {
    return { valid: false, error: "Summary metadata is missing required numeric counts." };
  }

  // 2. Tours array validation
  if (!Array.isArray(p.tours)) {
    return { valid: false, error: "Payload 'tours' must be an array." };
  }

  if (p.tours.length === 0) {
    return { valid: false, error: "Cannot persist empty dataset: zero tours parsed." };
  }

  // Inconsistent count verification
  if (s.canonicalToursCount !== p.tours.length) {
    return {
      valid: false,
      error: `Inconsistent count: summary reports ${s.canonicalToursCount} tours, but payload contains ${p.tours.length} tours.`,
    };
  }

  // 3. Ambiguities & duplicates array validation
  if (!Array.isArray(p.ambiguities)) {
    return { valid: false, error: "Payload 'ambiguities' must be an array." };
  }
  if (s.dateAmbiguityCount !== undefined && s.dateAmbiguityCount !== p.ambiguities.length) {
    return {
      valid: false,
      error: `Inconsistent ambiguity count: summary reports ${s.dateAmbiguityCount}, but array contains ${p.ambiguities.length}.`,
    };
  }

  if (!Array.isArray(p.duplicates)) {
    return { valid: false, error: "Payload 'duplicates' must be an array." };
  }

  // 4. Structural validation of tour records
  for (let i = 0; i < p.tours.length; i++) {
    const t = p.tours[i];
    if (!t || typeof t !== "object") {
      return { valid: false, error: `Tour at index ${i} is not a valid object.` };
    }
    if (!t.id || typeof t.id !== "string" || !t.id.trim()) {
      return { valid: false, error: `Tour at index ${i} is missing a valid 'id'.` };
    }
    if (!t.bookingReference || typeof t.bookingReference !== "string" || !t.bookingReference.trim()) {
      return { valid: false, error: `Tour ${t.id} is missing a valid 'bookingReference'.` };
    }
    if (!t.status || !VALID_STATUSES.has(t.status)) {
      return { valid: false, error: `Tour ${t.id} has invalid status '${t.status}'.` };
    }
    if (!t.group || typeof t.group !== "object" || !t.group.groupName) {
      return { valid: false, error: `Tour ${t.id} is missing valid group information.` };
    }
    if (typeof t.group.adultCount !== "number" || t.group.adultCount < 0) {
      return { valid: false, error: `Tour ${t.id} has invalid adult pax count.` };
    }
  }

  return { valid: true };
}

/**
 * Perform an atomic write to disk with pre-write backup and disk flush.
 */
function writeAtomicFileSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Step 1: Pre-write backup of last known valid dataset
  if (fs.existsSync(targetPath)) {
    try {
      fs.copyFileSync(targetPath, BACKUP_FILE);
    } catch (err) {
      console.warn("Notice: unable to copy pre-write backup:", err);
    }
  }

  // Step 2: Write to temporary file with unique identifier
  const tempPath = path.join(
    dir,
    `.tmp_canonical_${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  );

  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeSync(fd, content, 0, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Step 3: Replace target atomically
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (renameErr) {
    // Windows fallback if rename cannot overwrite
    if (process.platform === "win32") {
      try {
        fs.copyFileSync(tempPath, targetPath);
        fs.unlinkSync(tempPath);
      } catch (winErr) {
        // If write failed, attempt recovery from backup
        if (fs.existsSync(BACKUP_FILE) && (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0)) {
          try {
            fs.copyFileSync(BACKUP_FILE, targetPath);
          } catch {}
        }
        throw winErr;
      }
    } else {
      throw renameErr;
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  }
}

/**
 * Read the stored canonical dataset from disk (with in-memory mtime cache).
 */
export function getCanonicalDataset(): StoredCanonicalPayload | null {
  try {
    if (!fs.existsSync(CANONICAL_FILE)) {
      return null;
    }
    const stat = fs.statSync(CANONICAL_FILE);
    if (inMemoryCache && cacheMtime === stat.mtimeMs) {
      return inMemoryCache;
    }
    const raw = fs.readFileSync(CANONICAL_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredCanonicalPayload;

    const validation = validateCanonicalPayload(parsed);
    if (!validation.valid) {
      console.error("Canonical dataset on disk failed validation:", validation.error);
      return null;
    }

    inMemoryCache = parsed;
    cacheMtime = stat.mtimeMs;
    return parsed;
  } catch (err) {
    console.error("Error reading canonical dataset from disk:", err);
    return null;
  }
}

/**
 * Check if a canonical operational dataset exists on disk.
 */
export function hasCanonicalDataset(): boolean {
  return fs.existsSync(CANONICAL_FILE);
}

/**
 * Check if a recoverable backup exists on disk.
 */
export function hasCanonicalBackup(): boolean {
  return fs.existsSync(BACKUP_FILE);
}

/**
 * Return current dataset active mode: 'operational' or 'demo'.
 */
export function getCanonicalMode(): "operational" | "demo" {
  const dataset = getCanonicalDataset();
  return dataset?.activeMode ?? "demo";
}

/**
 * Set active dataset mode: 'operational' or 'demo'.
 */
export function setCanonicalMode(mode: "operational" | "demo"): { success: boolean; error?: string } {
  try {
    const dataset = getCanonicalDataset();
    if (!dataset) {
      return { success: false, error: "No canonical dataset found to toggle mode." };
    }
    dataset.activeMode = mode;
    writeAtomicFileSync(CANONICAL_FILE, JSON.stringify(dataset, null, 2));
    inMemoryCache = dataset;
    cacheMtime = Date.now();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Persist an imported dataset to disk atomically after rigorous validation.
 */
export function saveCanonicalDataset(
  importResult: ImportPreviewResult,
  mode: "operational" | "demo" = "operational"
): { success: boolean; error?: string } {
  try {
    // 1. Strict validation before touching persistence
    const validation = validateCanonicalPayload(importResult);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.error}` };
    }

    const payload: StoredCanonicalPayload = {
      activeMode: mode,
      importedAt: new Date().toISOString(),
      summary: importResult.summary,
      tours: importResult.tours,
      ambiguities: importResult.ambiguities,
      duplicates: importResult.duplicates,
      errors: importResult.errors,
    };

    // 2. Atomic write with pre-write backup
    writeAtomicFileSync(CANONICAL_FILE, JSON.stringify(payload, null, 2));
    inMemoryCache = payload;
    cacheMtime = Date.now();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Retrieve canonical tours list if operational dataset is active.
 */
export function getCanonicalTours(referenceDate: string = getIndiaTodayISO()): Tour[] {
  const dataset = getCanonicalDataset();
  if (dataset && dataset.activeMode === "operational" && dataset.tours.length > 0) {
    return dataset.tours.map((t) => ({
      ...t,
      status: computeTourLifecycleStatus(t, referenceDate),
    }));
  }
  return [];
}

/**
 * Retrieve a specific tour by ID or booking reference from canonical dataset.
 * Priority: Exact primary tour ID first, exact sourceRecordId second, then booking reference.
 */
export function getCanonicalTourById(
  idOrRef: string,
  referenceDate: string = getIndiaTodayISO()
): Tour | undefined {
  const tours = getCanonicalTours(referenceDate);
  const clean = idOrRef.toLowerCase().trim();

  // 1. Strict primary ID match
  const byId = tours.find((t) => t.id.toLowerCase() === clean);
  if (byId) return byId;

  // 2. Strict source record ID match (e.g. 'OCT 23:R21:1222824')
  const bySource = tours.find((t) => t.sourceRecordId?.toLowerCase() === clean);
  if (bySource) return bySource;

  // 3. Fallback to booking reference or satf-{ref} prefix
  return tours.find(
    (t) =>
      t.bookingReference.toLowerCase() === clean ||
      `satf-${t.bookingReference.toLowerCase()}` === clean
  );
}

/**
 * Retrieve all canonical tours sharing a specific booking reference.
 */
export function getCanonicalToursByRef(
  bookingRef: string,
  referenceDate: string = getIndiaTodayISO()
): Tour[] {
  const tours = getCanonicalTours(referenceDate);
  const clean = bookingRef.toLowerCase().trim();
  return tours.filter(
    (t) =>
      t.bookingReference.toLowerCase() === clean ||
      `satf-${t.bookingReference.toLowerCase()}` === clean
  );
}

/**
 * Clear active canonical dataset with recoverable backup preservation.
 */
export function clearCanonicalDataset(): { success: boolean; error?: string; backupPreserved?: boolean } {
  try {
    let backupPreserved = false;
    if (fs.existsSync(CANONICAL_FILE)) {
      // Preserve backup before removing active file
      try {
        fs.copyFileSync(CANONICAL_FILE, BACKUP_FILE);
        backupPreserved = true;
      } catch (backupErr) {
        console.warn("Could not copy to backup before clearing:", backupErr);
      }
      fs.unlinkSync(CANONICAL_FILE);
    }
    inMemoryCache = null;
    cacheMtime = 0;
    return { success: true, backupPreserved };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Restore canonical dataset from the last valid backup if available.
 */
export function restoreCanonicalBackup(): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(BACKUP_FILE)) {
      return { success: false, error: "No backup file found to restore." };
    }
    const raw = fs.readFileSync(BACKUP_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const validation = validateCanonicalPayload(parsed);
    if (!validation.valid) {
      return { success: false, error: `Backup file is corrupted: ${validation.error}` };
    }
    writeAtomicFileSync(CANONICAL_FILE, raw);
    inMemoryCache = parsed;
    cacheMtime = Date.now();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
