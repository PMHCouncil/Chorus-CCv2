"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import {
  submissionInputSchema,
  useBulkCreateSubmissions,
  type NewSubmissionInput,
  type BulkImportResult,
} from "@/lib/submissions";
import type { ParseResult, ParsedTable, ParsedFreeform, ParsedEmail } from "@/lib/import/parse";
import {
  mappingHasContent,
  normaliseFreeformBlock,
  normaliseTableRow,
  suggestMapping,
  type ColumnMapping,
  type ImportDefaults,
  type NormalizeResult,
} from "@/lib/import/normalize";
import {
  fetchExistingDuplicateHashes,
  hashRow,
} from "@/lib/import/dedupe";
import { FileUploadStep } from "./file-upload-step";
import { PasteStep } from "./paste-step";
import { ColumnMappingStep } from "./column-mapping-step";
import { PreviewStep } from "./preview-step";
import { ImportProgress } from "./import-progress";
import { EmailReviewStep, type EmailDraft } from "./email-review-step";

type Step = "source" | "map" | "preview" | "running" | "email-review";
type ImportSource = "csv" | "xlsx" | "paste-table" | "paste-blocks" | "email";

export interface NormalisedPreviewRow {
  index: number;
  normalized: NormalizeResult | null;
  kind: "ready" | "error" | "duplicate-existing" | "duplicate-batch";
  error?: string;
}

function makeBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("source");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsedMeta, setParsedMeta] = useState<{
    importSource: ImportSource;
    filename?: string;
  } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaults, setDefaults] = useState<ImportDefaults>({ source: "other" });
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ inserted: 0, total: 0 });
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [dedupeChecking, setDedupeChecking] = useState(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({
    submitter_name: "",
    submitter_email: "",
    submitted_at: "",
    content: "",
    source: "email",
  });

  const bulkCreate = useBulkCreateSubmissions();

  const reset = () => {
    setStep("source");
    setParsed(null);
    setParsedMeta(null);
    setMapping({});
    setDefaults({ source: "other" });
    setSkipped(new Set());
    setExistingHashes(new Set());
    setProgress({ inserted: 0, total: 0 });
    setResult(null);
    setEmailDraft({ submitter_name: "", submitter_email: "", submitted_at: "", content: "", source: "email" });
  };

  const handleFileParsed = (
    p: ParseResult,
    meta: { filename: string; importSource: "csv" | "xlsx" | "email" },
  ) => {
    setParsed(p);
    setParsedMeta(meta);

    if (p.kind === "email") {
      const preferred = p.originalFrom ?? p.outerFrom;
      const rawDate = p.originalDate ?? p.outerDate;
      const localDate = rawDate
        ? new Date(rawDate).toISOString().slice(0, 16)
        : "";
      setEmailDraft({
        submitter_name: preferred?.name ?? "",
        submitter_email: preferred?.email ?? "",
        submitted_at: localDate,
        content: p.body,
        source: "email",
      });
      setStep("email-review");
      for (const w of p.warnings) toast.message(w);
      return;
    }

    if (p.kind === "table") {
      setMapping(suggestMapping(p.headers));
      setStep("map");
    } else {
      void runDedupeAndPreview(p, { importSource: meta.importSource });
    }
    for (const w of p.warnings) toast.message(w);
  };

  const handleEmailImport = async () => {
    if (!parsedMeta) return;
    const candidate = {
      source: emailDraft.source,
      submitter_name: emailDraft.submitter_name || undefined,
      submitter_email: emailDraft.submitter_email || undefined,
      submitted_at: emailDraft.submitted_at
        ? new Date(emailDraft.submitted_at).toISOString()
        : undefined,
      content: emailDraft.content,
    };

    const parsed = submissionInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error(issue?.message ?? "Please fix the highlighted fields before importing.");
      return;
    }

    const input = parsed.data as NewSubmissionInput;
    const batchId = makeBatchId();
    setStep("running");
    setProgress({ inserted: 0, total: 1 });
    setResult(null);

    try {
      const res = await bulkCreate.mutateAsync({
        rows: [input],
        batchId,
        importSource: "email",
        filename: parsedMeta.filename,
        onProgress: (inserted, total) => setProgress({ inserted, total }),
      });
      setResult(res);
      if (res.failed === 0) {
        toast.success("Imported 1 submission from email");
      } else {
        toast.warning("Import failed. See the summary below.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStep("email-review");
    }
  };

  const handlePasteParsed = (
    p: ParseResult,
    meta: { importSource: "paste-table" | "paste-blocks" },
  ) => {
    setParsed(p);
    setParsedMeta(meta);
    if (p.kind === "table") {
      setMapping(suggestMapping(p.headers));
      setStep("map");
    } else {
      void runDedupeAndPreview(p, meta);
    }
  };

  const normalisedRows = useMemo<NormalisedPreviewRow[]>(() => {
    if (!parsed) return [];
    const out: NormalisedPreviewRow[] = [];
    const seenHashes = new Set<string>();

    if (parsed.kind === "table") {
      const t = parsed as ParsedTable;
      t.rows.forEach((row, index) => {
        const norm = normaliseTableRow(row, mapping, defaults);
        if (!norm.ok) {
          out.push({ index, normalized: norm, kind: "error", error: norm.error });
          return;
        }
        const h = hashRow(norm.input);
        if (existingHashes.has(h)) {
          out.push({ index, normalized: norm, kind: "duplicate-existing" });
        } else if (seenHashes.has(h)) {
          out.push({ index, normalized: norm, kind: "duplicate-batch" });
        } else {
          out.push({ index, normalized: norm, kind: "ready" });
        }
        seenHashes.add(h);
      });
    } else if (parsed.kind === "freeform") {
      const f = parsed as ParsedFreeform;
      f.blocks.forEach((block, index) => {
        const norm = normaliseFreeformBlock(block, defaults);
        if (!norm.ok) {
          out.push({ index, normalized: norm, kind: "error", error: norm.error });
          return;
        }
        const h = hashRow(norm.input);
        if (existingHashes.has(h)) {
          out.push({ index, normalized: norm, kind: "duplicate-existing" });
        } else if (seenHashes.has(h)) {
          out.push({ index, normalized: norm, kind: "duplicate-batch" });
        } else {
          out.push({ index, normalized: norm, kind: "ready" });
        }
        seenHashes.add(h);
      });
    }
    return out;
  }, [parsed, mapping, defaults, existingHashes]);

  const stats = useMemo(() => {
    let ready = 0;
    let error = 0;
    let duplicate = 0;
    let willImport = 0;
    for (const r of normalisedRows) {
      if (r.kind === "error") error++;
      else if (r.kind === "duplicate-existing" || r.kind === "duplicate-batch") duplicate++;
      else ready++;
      if (
        r.kind !== "error" &&
        !skipped.has(r.index) &&
        r.normalized?.ok
      ) {
        willImport++;
      }
    }
    return { ready, error, duplicate, willImport };
  }, [normalisedRows, skipped]);

  const runDedupeAndPreview = async (
    parsedResult: ParseResult,
    meta: { importSource: ImportSource; filename?: string },
  ) => {
    setDedupeChecking(true);
    try {
      const tempInputs: { content: string; submitter_email?: string }[] = [];
      const initialSkip = new Set<number>();
      const seen = new Set<string>();

      if (parsedResult.kind === "table") {
        const tempMapping =
          Object.keys(mapping).length > 0
            ? mapping
            : suggestMapping(parsedResult.headers);
        parsedResult.rows.forEach((row) => {
          const n = normaliseTableRow(row, tempMapping, defaults);
          if (n.ok) {
            tempInputs.push({
              content: n.input.content,
              submitter_email: n.input.submitter_email,
            });
          }
        });
      } else if (parsedResult.kind === "freeform") {
        parsedResult.blocks.forEach((block) => {
          const n = normaliseFreeformBlock(block, defaults);
          if (n.ok) tempInputs.push({ content: n.input.content });
        });
      }

      const { existingHashes: hashes } = await fetchExistingDuplicateHashes(tempInputs);
      setExistingHashes(hashes);
      setParsedMeta(meta);

      // Pre-mark within-batch + existing duplicates as skipped by default.
      const freeformItems =
        parsedResult.kind === "freeform"
          ? parsedResult.blocks.map((block) => normaliseFreeformBlock(block, defaults))
          : [];
      const items =
        parsedResult.kind === "table"
          ? parsedResult.rows.map((row) => normaliseTableRow(row, mapping, defaults))
          : freeformItems;
      items.forEach((n, idx) => {
        if (!n.ok) return;
        const h = hashRow(n.input);
        if (hashes.has(h) || seen.has(h)) initialSkip.add(idx);
        seen.add(h);
      });
      setSkipped(initialSkip);
      setStep("preview");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not check for existing duplicates",
      );
      setStep("preview");
    } finally {
      setDedupeChecking(false);
    }
  };

  const goToPreviewFromMap = () => {
    if (!parsed || parsed.kind !== "table" || !parsedMeta) return;
    if (!mappingHasContent(mapping)) return;
    void runDedupeAndPreview(parsed, parsedMeta);
  };

  const toggleSkip = (index: number) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleImport = async () => {
    if (!parsedMeta) return;
    const rows: NewSubmissionInput[] = [];
    for (const r of normalisedRows) {
      if (skipped.has(r.index)) continue;
      if (!r.normalized?.ok) continue;
      rows.push(r.normalized.input);
    }
    if (rows.length === 0) {
      toast.error("Nothing to import — every row is skipped or errored.");
      return;
    }

    const batchId = makeBatchId();
    setStep("running");
    setProgress({ inserted: 0, total: rows.length });
    setResult(null);

    try {
      const res = await bulkCreate.mutateAsync({
        rows,
        batchId,
        importSource: parsedMeta.importSource,
        filename: parsedMeta.filename,
        onProgress: (inserted, total) => setProgress({ inserted, total }),
      });
      setResult(res);
      if (res.failed === 0) {
        toast.success(`Imported ${res.inserted} submission${res.inserted === 1 ? "" : "s"}`);
      } else {
        toast.warning(
          `Imported ${res.inserted}, ${res.failed} failed. See the summary below.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStep("preview");
    }
  };

  if (step === "running") {
    return (
      <ImportProgress
        total={progress.total}
        inserted={progress.inserted}
        result={result}
        onStartOver={reset}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === "source" && (
        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="upload">Upload file</TabsTrigger>
            <TabsTrigger value="paste">Paste</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <FileUploadStep onParsed={handleFileParsed} />
          </TabsContent>
          <TabsContent value="paste" className="mt-4">
            <PasteStep onParsed={handlePasteParsed} />
          </TabsContent>
        </Tabs>
      )}

      {step === "map" && parsed?.kind === "table" && (
        <>
          <ColumnMappingStep
            headers={parsed.headers}
            sampleRow={parsed.rows[0] ?? null}
            mapping={mapping}
            onMappingChange={setMapping}
            defaults={defaults}
            onDefaultsChange={setDefaults}
          />
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("source")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={goToPreviewFromMap}
              disabled={!mappingHasContent(mapping) || dedupeChecking}
            >
              {dedupeChecking ? "Checking duplicates…" : "Preview"}
            </Button>
          </div>
        </>
      )}

      {step === "email-review" && parsed?.kind === "email" && (
        <>
          <EmailReviewStep
            email={parsed as ParsedEmail}
            draft={emailDraft}
            onDraftChange={setEmailDraft}
          />
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("source")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={handleEmailImport}
              disabled={!emailDraft.content.trim() || bulkCreate.isPending}
            >
              {bulkCreate.isPending ? "Importing…" : "Import this email"}
            </Button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <PreviewStats stats={stats} />
          <PreviewStep
            rows={normalisedRows}
            skipped={skipped}
            onToggleSkip={toggleSkip}
          />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(parsed?.kind === "table" ? "map" : "source")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleImport} disabled={stats.willImport === 0 || bulkCreate.isPending}>
              {bulkCreate.isPending
                ? "Importing…"
                : `Import ${stats.willImport} submission${stats.willImport === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] =
    step === "email-review"
      ? [
          { id: "source", label: "Source" },
          { id: "email-review", label: "Review email" },
        ]
      : [
          { id: "source", label: "Source" },
          { id: "map", label: "Map columns" },
          { id: "preview", label: "Preview" },
        ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const active = i === activeIdx;
        const done = i < activeIdx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-content-center rounded-full text-[10px] font-semibold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`uppercase tracking-wide ${
                active ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="h-px w-6 bg-muted-foreground/30" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PreviewStats({
  stats,
}: {
  stats: { ready: number; error: number; duplicate: number; willImport: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Stat label="Will import" value={stats.willImport} tone="emerald" />
      <Stat label="Likely duplicates" value={stats.duplicate} tone="amber" />
      <Stat label="Errors" value={stats.error} tone="rose" />
      {stats.error > 0 && (
        <Alert className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 max-w-sm">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            Rows with errors are excluded automatically.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const colour =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "amber"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";
  return (
    <div className="rounded-md border bg-card px-3 py-1.5 text-xs flex items-center gap-2">
      <span className={`px-1.5 py-0.5 rounded font-semibold tabular-nums ${colour}`}>
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
