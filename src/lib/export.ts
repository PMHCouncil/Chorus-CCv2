import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  /** Optional column width hint (PDF only, in mm) */
  width?: number;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  return format(new Date(), "yyyy-MM-dd_HHmm");
}

export function exportCSV<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filenameBase: string,
) {
  const lines = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(c.accessor(row))).join(","));
  }
  // Add UTF-8 BOM so Excel detects encoding correctly
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${filenameBase}_${timestamp()}.csv`);
}

export interface PDFExportOptions {
  title: string;
  subtitle?: string;
  filters?: Array<{ label: string; value: string }>;
}

export function exportPDF<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filenameBase: string,
  opts: PDFExportOptions,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(opts.title, 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `Generated ${format(new Date(), "d MMM yyyy, h:mm a")} · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
    14,
    22,
  );

  let y = 28;
  if (opts.subtitle) {
    doc.text(opts.subtitle, 14, y);
    y += 5;
  }

  const activeFilters = (opts.filters ?? []).filter((f) => f.value && f.value.length > 0);
  if (activeFilters.length > 0) {
    const text = "Filters: " + activeFilters.map((f) => `${f.label}: ${f.value}`).join(" · ");
    const wrapped = doc.splitTextToSize(text, 270);
    doc.text(wrapped, 14, y);
    y += wrapped.length * 4 + 2;
  }

  doc.setTextColor(0);

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) =>
      columns.map((c) => {
        const v = c.accessor(row);
        return v === null || v === undefined ? "" : String(v);
      }),
    ),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(
      columns
        .map((c, i) => (c.width ? [i, { cellWidth: c.width }] : null))
        .filter((x): x is [number, { cellWidth: number }] => x !== null),
    ),
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filenameBase}_${timestamp()}.pdf`);
}
