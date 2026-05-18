"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { NormalisedPreviewRow } from "./import-wizard";

interface Props {
  rows: NormalisedPreviewRow[];
  skipped: Set<number>;
  onToggleSkip: (index: number) => void;
}

const MAX_VISIBLE_ROWS = 100;

export function PreviewStep({ rows, skipped, onToggleSkip }: Props) {
  const visible = rows.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className="space-y-3">
      {hiddenCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Showing the first {MAX_VISIBLE_ROWS} of {rows.length} rows. All rows will be
            imported (or skipped) based on the toggles below.
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Skip</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[160px]">Submitter</TableHead>
              <TableHead>Content / issue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const isSkipped = skipped.has(row.index);
              const input = row.normalized?.ok ? row.normalized.input : null;
              return (
                <TableRow
                  key={row.index}
                  className={isSkipped ? "opacity-60" : ""}
                  data-state={isSkipped ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSkipped}
                      onCheckedChange={() => onToggleSkip(row.index)}
                      aria-label="Skip this row"
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {input?.submitter_name && (
                      <div className="font-medium text-foreground">
                        {input.submitter_name}
                      </div>
                    )}
                    {input?.submitter_email && (
                      <div className="text-muted-foreground truncate">
                        {input.submitter_email}
                      </div>
                    )}
                    {!input?.submitter_name && !input?.submitter_email && (
                      <span className="text-muted-foreground italic">Anonymous</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {input ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {input.content}
                      </p>
                    ) : (
                      <p className="text-xs text-destructive">{row.error}</p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: NormalisedPreviewRow }) {
  if (row.kind === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  if (row.kind === "duplicate-existing") {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
        Likely duplicate
      </Badge>
    );
  }
  if (row.kind === "duplicate-batch") {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
        Duplicate in file
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
      Ready
    </Badge>
  );
}
