"use client";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseEmailFile, type ParsedEmail } from "./parse-email";
import { parseMsgFile } from "./parse-msg";

export type { ParsedEmail } from "./parse-email";

export interface ParsedTable {
  kind: "table";
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
  meta: {
    delimiter?: string;
    sheetName?: string;
    extraSheets?: string[];
  };
}

export interface ParsedFreeform {
  kind: "freeform";
  blocks: string[];
  warnings: string[];
}

export type ParseResult = ParsedTable | ParsedFreeform | ParsedEmail;

const TABULAR_EXT = /\.(csv|tsv|txt)$/i;
const EXCEL_EXT = /\.(xlsx|xls)$/i;
const EML_EXT = /\.eml$/i;
const MSG_EXT = /\.msg$/i;

export async function parseFile(file: File): Promise<ParseResult> {
  if (EXCEL_EXT.test(file.name)) return parseExcelFile(file);
  if (TABULAR_EXT.test(file.name)) return parseDelimitedFile(file);
  if (EML_EXT.test(file.name)) return parseEmailFile(file);
  if (MSG_EXT.test(file.name)) return parseMsgFile(file);
  throw new Error(
    "Unsupported file type. Upload a .csv, .tsv, .xlsx, .xls, .eml, or .msg file.",
  );
}

async function parseDelimitedFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  return parseDelimitedText(text);
}

function parseDelimitedText(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const warnings: string[] = [];
  if (result.errors.length > 0) {
    const first = result.errors[0];
    warnings.push(`Parser warning on row ${first.row ?? "?"}: ${first.message}`);
  }
  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new Error(
      "No column headers detected. The first row of your file must contain header names.",
    );
  }
  const rows = (result.data ?? []).filter((r) =>
    headers.some((h) => (r[h] ?? "").length > 0),
  );
  return {
    kind: "table",
    headers,
    rows,
    warnings,
    meta: { delimiter: result.meta.delimiter },
  };
}

async function parseExcelFile(file: File): Promise<ParsedTable> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new Error("The workbook has no sheets.");
  }
  const firstSheet = sheetNames[0];
  const sheet = wb.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (rawRows.length === 0) {
    throw new Error(`Sheet "${firstSheet}" is empty.`);
  }
  const headers = Object.keys(rawRows[0]).map((h) => h.trim()).filter(Boolean);
  const rows: Record<string, string>[] = rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = row[h];
      out[h] = v == null ? "" : String(v).trim();
    }
    return out;
  });
  const warnings: string[] = [];
  if (sheetNames.length > 1) {
    warnings.push(
      `Imported the first sheet ("${firstSheet}"). Other sheets ignored: ${sheetNames
        .slice(1)
        .join(", ")}`,
    );
  }
  return {
    kind: "table",
    headers,
    rows,
    warnings,
    meta: {
      sheetName: firstSheet,
      extraSheets: sheetNames.slice(1),
    },
  };
}

// Heuristic: try delimited first; fall back to free-form blocks if the
// pasted text doesn't look like a tabular structure.
export function parsePaste(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: "freeform", blocks: [], warnings: ["Nothing to import."] };
  }

  const looksTabular = looksLikeTable(trimmed);
  if (looksTabular) {
    try {
      const table = parseDelimitedText(trimmed);
      // Single-column tables aren't really tables; treat them as free-form.
      if (table.headers.length <= 1 && table.rows.length > 0) {
        return toFreeform(trimmed);
      }
      return table;
    } catch {
      return toFreeform(trimmed);
    }
  }
  return toFreeform(trimmed);
}

function looksLikeTable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const first = lines[0];
  const hasTab = first.includes("\t");
  const hasComma = first.includes(",");
  if (!hasTab && !hasComma) return false;

  const delim = hasTab ? "\t" : ",";
  const firstCount = first.split(delim).length;
  if (firstCount < 2) return false;
  // Require at least 60% of lines to have the same column count.
  const matching = lines.filter((l) => l.split(delim).length === firstCount).length;
  return matching / lines.length >= 0.6;
}

function toFreeform(text: string): ParsedFreeform {
  // Split on blank lines (>= 1 blank line between blocks).
  const blocks = text
    .split(/\r?\n\s*\r?\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return { kind: "freeform", blocks, warnings: [] };
}
