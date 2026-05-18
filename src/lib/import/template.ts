"use client";

import Papa from "papaparse";
import * as XLSX from "xlsx";

export const TEMPLATE_HEADERS = [
  "content",
  "submitter_name",
  "submitter_email",
  "submitter_role",
  "source",
  "submitted_at",
] as const;

const TEMPLATE_ROWS: Record<(typeof TEMPLATE_HEADERS)[number], string>[] = [
  {
    content:
      "The proposed change is positive overall but the timeline is too short for community infrastructure teams.",
    submitter_name: "Alex Example",
    submitter_email: "alex@example.org",
    submitter_role: "Coordinator, Community Infrastructure",
    source: "email",
    submitted_at: "2026-05-12T09:30:00+10:00",
  },
  {
    content: "Anonymous feedback supporting the principle but asking for clearer wording.",
    submitter_name: "",
    submitter_email: "",
    submitter_role: "",
    source: "form",
    submitted_at: "",
  },
];

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Small delay so Firefox actually pulls the data before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const csv = Papa.unparse({
      fields: [...TEMPLATE_HEADERS],
      data: TEMPLATE_ROWS.map((r) => TEMPLATE_HEADERS.map((h) => r[h])),
    });
    triggerDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      "submissions-template.csv",
    );
    return;
  }
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS, {
    header: [...TEMPLATE_HEADERS],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Submissions");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  triggerDownload(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "submissions-template.xlsx",
  );
}
