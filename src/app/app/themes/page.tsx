"use client";

import { useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useThemesWithBreakdown, type ThemeWithSentiment } from "@/lib/themes";
import { ThemeDetailSheet } from "@/components/themes/theme-detail-sheet";
import { SubmissionDetailSheet } from "@/components/submissions/submission-detail-sheet";
import { ExportMenu } from "@/components/export-menu";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

const SENTIMENT_BAR: Record<string, string> = {
  Supportive: "bg-emerald-500",
  Neutral: "bg-slate-400",
  Concerned: "bg-amber-500",
  Opposing: "bg-rose-500",
  Unclassified: "bg-muted-foreground/40",
};

export default function ThemesPage() {
  const { data: themes = [], isLoading, error } = useThemesWithBreakdown();
  const [search, setSearch] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.summary ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [themes, search]);

  const totalSubmissions = themes.reduce((sum, t) => sum + t.submission_count, 0);

  const exportColumns: ExportColumn<ThemeWithSentiment>[] = [
    { header: "Theme", accessor: (t) => t.name, width: 50 },
    { header: "Submissions", accessor: (t) => t.submission_count },
    { header: "Supportive", accessor: (t) => t.sentiment_breakdown.Supportive },
    { header: "Neutral", accessor: (t) => t.sentiment_breakdown.Neutral },
    { header: "Concerned", accessor: (t) => t.sentiment_breakdown.Concerned },
    { header: "Opposing", accessor: (t) => t.sentiment_breakdown.Opposing },
    { header: "Unclassified", accessor: (t) => t.sentiment_breakdown.Unclassified },
    { header: "Summary", accessor: (t) => t.summary ?? "", width: 110 },
  ];

  const filterSummary = [{ label: "Search", value: search }];

  const handleExportCSV = () => {
    exportCSV(filtered, exportColumns, "themes");
    toast.success(`Exported ${filtered.length} themes to CSV`);
  };
  const handleExportPDF = () => {
    exportPDF(filtered, exportColumns, "themes", {
      title: "Themes",
      filters: filterSummary,
    });
    toast.success(`Exported ${filtered.length} themes to PDF`);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Themes</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {themes.length} theme{themes.length === 1 ? "" : "s"} ·{" "}
              {totalSubmissions} linked submission{totalSubmissions === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            disabled={filtered.length === 0}
            count={filtered.length}
          />
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search themes…"
              className="pl-9 h-11 md:h-10"
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load themes: {error instanceof Error ? error.message : "Unknown"}
        </div>
      ) : isLoading ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading themes…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-medium">
            {themes.length === 0 ? "No themes yet" : "No matches"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {themes.length === 0
              ? "Themes are created automatically when you classify submissions in the Inbox."
              : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => {
            const total = Math.max(t.submission_count, 1);
            const segments: Array<[string, number]> = [
              ["Supportive", t.sentiment_breakdown.Supportive],
              ["Neutral", t.sentiment_breakdown.Neutral],
              ["Concerned", t.sentiment_breakdown.Concerned],
              ["Opposing", t.sentiment_breakdown.Opposing],
              ["Unclassified", t.sentiment_breakdown.Unclassified],
            ];
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTheme(t.id)}
                className="text-left rounded-lg border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-snug">{t.name}</h3>
                  <Badge variant="secondary" className="shrink-0">
                    {t.submission_count}
                  </Badge>
                </div>
                {t.summary && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {t.summary}
                  </p>
                )}
                {t.submission_count > 0 && (
                  <>
                    <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      {segments.map(([label, count]) =>
                        count > 0 ? (
                          <div
                            key={label}
                            className={cn("h-full", SENTIMENT_BAR[label])}
                            style={{ width: `${(count / total) * 100}%` }}
                            title={`${label}: ${count}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {segments.map(([label, count]) =>
                        count > 0 ? (
                          <span key={label} className="flex items-center gap-1">
                            <span
                              className={cn(
                                "inline-block h-2 w-2 rounded-full",
                                SENTIMENT_BAR[label],
                              )}
                            />
                            {label} {count}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ThemeDetailSheet
        themeId={selectedTheme}
        onClose={() => setSelectedTheme(null)}
        onOpenSubmission={(id) => {
          setSelectedTheme(null);
          setSelectedSubmission(id);
        }}
      />
      <SubmissionDetailSheet
        submissionId={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
      />
    </div>
  );
}
