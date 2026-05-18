"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, FileSpreadsheet, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseFile, type ParseResult } from "@/lib/import/parse";
import { downloadTemplate } from "@/lib/import/template";

interface Props {
  onParsed: (
    result: ParseResult,
    meta: { filename: string; importSource: "csv" | "xlsx" | "email" },
  ) => void;
}

export function FileUploadStep({ onParsed }: Props) {
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setWorking(true);
      try {
        const result = await parseFile(file);
        const name = file.name.toLowerCase();
        const importSource =
          name.endsWith(".xlsx") || name.endsWith(".xls")
            ? "xlsx"
            : name.endsWith(".eml") || name.endsWith(".msg")
              ? "email"
              : "csv";
        onParsed(result, { filename: file.name, importSource });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not read file");
      } finally {
        setWorking(false);
      }
    },
    [onParsed],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/20"
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background border">
          <FileUp className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="mt-3 text-sm font-medium">Drop a file here</div>
        <div className="text-xs text-muted-foreground mt-1">
          .csv, .tsv, .xlsx, .xls — or drag an <Mail className="inline h-3 w-3 mx-0.5 align-text-bottom" />.eml / .msg email file · parsed locally in your browser
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.eml,.msg"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={working}
          onClick={() => inputRef.current?.click()}
        >
          {working ? "Reading…" : "Choose a file"}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-sm font-medium">Not sure what columns to use?</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Download a template with the recommended headers and one example row.
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => downloadTemplate("csv")}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => downloadTemplate("xlsx")}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>
    </div>
  );
}
