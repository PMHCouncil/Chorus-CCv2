"use client";

import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { BulkImportResult } from "@/lib/submissions";

interface Props {
  total: number;
  inserted: number;
  result: BulkImportResult | null;
  onStartOver: () => void;
}

export function ImportProgress({ total, inserted, result, onStartOver }: Props) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((inserted / total) * 100));

  if (!result) {
    return (
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <div className="text-sm font-medium">Importing submissions…</div>
          <div className="text-xs text-muted-foreground mt-1">
            Inserting {inserted} / {total}. Don&apos;t close this tab.
          </div>
        </div>
        <Progress value={pct} />
      </div>
    );
  }

  const ok = result.failed === 0;
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-600" />
        ) : (
          <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600" />
        )}
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {ok
              ? `Imported ${result.inserted} submission${result.inserted === 1 ? "" : "s"}`
              : `Imported ${result.inserted}, ${result.failed} failed`}
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  Batch starting at row {e.batchStart + 1}: {e.error}
                </li>
              ))}
              {result.errors.length > 5 && <li>+ {result.errors.length - 5} more</li>}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button asChild>
          <Link href="/app/inbox">Open inbox</Link>
        </Button>
        <Button variant="outline" onClick={onStartOver}>
          Import another batch
        </Button>
      </div>
    </div>
  );
}
