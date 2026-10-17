import fs from "node:fs";
import path from "node:path";
import type { Tour, ImportPreviewResult, ImportSummary } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data/imported");
const CANONICAL_FILE = path.join(DATA_DIR, "canonical_dataset.json");

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
    fs.writeFileSync(CANONICAL_FILE, JSON.stringify(dataset, null, 2), "utf-8");
    inMemoryCache = dataset;
    cacheMtime = Date.now();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Persist an imported dataset to disk.
 */
export function saveCanonicalDataset(
  importResult: ImportPreviewResult,
  mode: "operational" | "demo" = "operational"
): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
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

    fs.writeFileSync(CANONICAL_FILE, JSON.stringify(payload, null, 2), "utf-8");
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
export function getCanonicalTours(): Tour[] {
  const dataset = getCanonicalDataset();
  if (dataset && dataset.activeMode === "operational" && dataset.tours.length > 0) {
    return dataset.tours;
  }
  return [];
}

/**
 * Retrieve a specific tour by ID or booking reference from canonical dataset.
 */
export function getCanonicalTourById(idOrRef: string): Tour | undefined {
  const tours = getCanonicalTours();
  const clean = idOrRef.toLowerCase().trim();
  return tours.find(
    (t) =>
      t.id.toLowerCase() === clean ||
      t.bookingReference.toLowerCase() === clean ||
      `satf-${t.bookingReference.toLowerCase()}` === clean
  );
}

/**
 * Clear or reset canonical dataset.
 */
export function clearCanonicalDataset(): { success: boolean; error?: string } {
  try {
    if (fs.existsSync(CANONICAL_FILE)) {
      fs.unlinkSync(CANONICAL_FILE);
    }
    inMemoryCache = null;
    cacheMtime = 0;
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
