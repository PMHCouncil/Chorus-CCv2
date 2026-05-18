"use client";

import {
  submissionInputSchema,
  type NewSubmissionInput,
  type SubmissionSource,
} from "@/lib/submissions";

export type SubmissionField =
  | "content"
  | "submitter_name"
  | "submitter_email"
  | "submitter_role"
  | "submitted_at"
  | "source"
  | null;

export interface ColumnMapping {
  // header (raw, as it appears in the file) → submission field, or null to ignore
  [header: string]: SubmissionField;
}

export interface ImportDefaults {
  source: SubmissionSource;
}

export interface NormalizeOk {
  ok: true;
  input: NewSubmissionInput;
}

export interface NormalizeErr {
  ok: false;
  error: string;
}

export type NormalizeResult = NormalizeOk | NormalizeErr;

const HEADER_HINTS: Record<Exclude<SubmissionField, null>, string[]> = {
  content: [
    "content",
    "body",
    "feedback",
    "message",
    "comment",
    "comments",
    "text",
    "submission",
    "response",
    "notes",
  ],
  submitter_name: [
    "name",
    "submitter",
    "submitter name",
    "from",
    "author",
    "full name",
  ],
  submitter_email: [
    "email",
    "submitter email",
    "from email",
    "e-mail",
    "email address",
  ],
  submitter_role: [
    "role",
    "division",
    "team",
    "department",
    "position",
    "title",
    "job title",
  ],
  submitted_at: [
    "date",
    "submitted",
    "submitted at",
    "received",
    "received at",
    "timestamp",
    "created",
    "created at",
  ],
  source: ["source", "channel", "via", "submission source"],
};

const ALL_FIELDS: Exclude<SubmissionField, null>[] = [
  "content",
  "submitter_name",
  "submitter_email",
  "submitter_role",
  "submitted_at",
  "source",
];

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-]/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<Exclude<SubmissionField, null>>();
  for (const header of headers) {
    const norm = normaliseHeader(header);
    let match: SubmissionField = null;
    for (const field of ALL_FIELDS) {
      if (used.has(field)) continue;
      if (HEADER_HINTS[field].some((hint) => hint === norm)) {
        match = field;
        break;
      }
    }
    if (!match) {
      for (const field of ALL_FIELDS) {
        if (used.has(field)) continue;
        if (HEADER_HINTS[field].some((hint) => norm.includes(hint))) {
          match = field;
          break;
        }
      }
    }
    mapping[header] = match;
    if (match) used.add(match);
  }
  return mapping;
}

function coerceSource(raw: string | undefined, fallback: SubmissionSource): SubmissionSource {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "form" || v === "email" || v === "cc" || v === "other") return v;
  if (v === "online form" || v === "web form" || v === "webform") return "form";
  if (v === "forward" || v === "forwarded" || v === "cc/forward") return "cc";
  return fallback;
}

function coerceDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function pick(
  row: Record<string, string>,
  mapping: ColumnMapping,
  field: Exclude<SubmissionField, null>,
): string | undefined {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === field) {
      const v = row[header];
      if (v && v.length > 0) return v;
    }
  }
  return undefined;
}

export function normaliseTableRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  defaults: ImportDefaults,
): NormalizeResult {
  const candidate = {
    content: pick(row, mapping, "content") ?? "",
    submitter_name: pick(row, mapping, "submitter_name"),
    submitter_email: pick(row, mapping, "submitter_email"),
    submitter_role: pick(row, mapping, "submitter_role"),
    submitted_at: coerceDate(pick(row, mapping, "submitted_at")),
    source: coerceSource(pick(row, mapping, "source"), defaults.source),
  };
  const parsed = submissionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".") || "row";
    return { ok: false, error: `${path}: ${issue.message}` };
  }
  return { ok: true, input: parsed.data as NewSubmissionInput };
}

export function normaliseFreeformBlock(
  block: string,
  defaults: ImportDefaults,
): NormalizeResult {
  const candidate = {
    content: block,
    source: defaults.source,
  };
  const parsed = submissionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message };
  }
  return { ok: true, input: parsed.data as NewSubmissionInput };
}

export function mappingHasContent(mapping: ColumnMapping): boolean {
  return Object.values(mapping).some((f) => f === "content");
}
