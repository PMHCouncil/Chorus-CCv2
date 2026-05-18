"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { SOURCE_LABELS, type SubmissionSource } from "@/lib/submissions";
import {
  type ColumnMapping,
  type ImportDefaults,
  type SubmissionField,
} from "@/lib/import/normalize";

const FIELD_LABELS: Record<Exclude<SubmissionField, null>, string> = {
  content: "Feedback content (required)",
  submitter_name: "Submitter name",
  submitter_email: "Submitter email",
  submitter_role: "Submitter role / division",
  submitted_at: "Submitted date",
  source: "Source channel",
};

const FIELD_ORDER: Exclude<SubmissionField, null>[] = [
  "content",
  "submitter_name",
  "submitter_email",
  "submitter_role",
  "submitted_at",
  "source",
];

interface Props {
  headers: string[];
  sampleRow: Record<string, string> | null;
  mapping: ColumnMapping;
  onMappingChange: (next: ColumnMapping) => void;
  defaults: ImportDefaults;
  onDefaultsChange: (next: ImportDefaults) => void;
}

export function ColumnMappingStep({
  headers,
  sampleRow,
  mapping,
  onMappingChange,
  defaults,
  onDefaultsChange,
}: Props) {
  const usedFields = new Set(
    Object.values(mapping).filter((v): v is Exclude<SubmissionField, null> => v !== null),
  );
  const hasContent = usedFields.has("content");
  const hasSourceMapped = usedFields.has("source");

  const setMapping = (header: string, value: SubmissionField) => {
    onMappingChange({ ...mapping, [header]: value });
  };

  return (
    <div className="space-y-5">
      {!hasContent && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Map one column to <strong>Feedback content</strong> before continuing.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-3 border-b px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          <div>Column in your file</div>
          <div>Maps to</div>
          <div>Example value</div>
        </div>
        {headers.map((header) => {
          const current = mapping[header] ?? null;
          return (
            <div
              key={header}
              className="grid grid-cols-[1fr_1fr_1.5fr] gap-3 items-center border-b px-4 py-3 last:border-b-0"
            >
              <div className="text-sm font-medium truncate" title={header}>
                {header}
              </div>
              <Select
                value={current ?? "__ignore"}
                onValueChange={(v) =>
                  setMapping(header, v === "__ignore" ? null : (v as SubmissionField))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ignore">Ignore this column</SelectItem>
                  {FIELD_ORDER.map((f) => (
                    <SelectItem
                      key={f}
                      value={f}
                      disabled={usedFields.has(f) && current !== f}
                    >
                      {FIELD_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground truncate" title={sampleRow?.[header] ?? ""}>
                {sampleRow?.[header] || <span className="italic">empty</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="text-sm font-medium">Defaults for unmapped fields</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="default-source">Default source</Label>
            <Select
              value={defaults.source}
              onValueChange={(v) =>
                onDefaultsChange({ ...defaults, source: v as SubmissionSource })
              }
              disabled={hasSourceMapped}
            >
              <SelectTrigger id="default-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SOURCE_LABELS) as [SubmissionSource, string][]).map(
                  ([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {hasSourceMapped
                ? "Using mapped column. Falls back to this if a row's source value is empty or unrecognised."
                : "Applied to every imported row."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Submitted date</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {usedFields.has("submitted_at")
                ? "Using mapped column · falls back to now"
                : "Using time of import"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
