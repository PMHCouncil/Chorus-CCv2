"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { parsePaste, type ParseResult } from "@/lib/import/parse";

interface Props {
  onParsed: (
    result: ParseResult,
    meta: { importSource: "paste-table" | "paste-blocks" },
  ) => void;
}

export function PasteStep({ onParsed }: Props) {
  const [text, setText] = useState("");

  const preview = useMemo<ParseResult | null>(() => {
    if (!text.trim()) return null;
    try {
      return parsePaste(text);
    } catch {
      return null;
    }
  }, [text]);

  const detection = (() => {
    if (!preview) return "Paste rows from Excel/Sheets, or one feedback body per paragraph (blank line between).";
    if (preview.kind === "table") {
      return `Detected ${preview.rows.length} row${preview.rows.length === 1 ? "" : "s"} across ${preview.headers.length} columns.`;
    }
    return preview.kind === "freeform"
      ? `Detected ${preview.blocks.length} free-form block${preview.blocks.length === 1 ? "" : "s"}. Each block becomes one submission.`
      : "Paste rows from Excel/Sheets, or one feedback body per paragraph (blank line between).";
  })();

  const canContinue = preview &&
    ((preview.kind === "table" && preview.rows.length > 0) ||
      (preview.kind === "freeform" && preview.blocks.length > 0));

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Tabular paste from Excel / Sheets / Notion:\n\ncontent\temail\tname\nThis is the first feedback.\tperson@example.com\tAlex\n\n…or paste free-form text — blank lines split it into separate submissions.`}
        rows={14}
        className="font-mono text-sm"
      />
      <div className="text-xs text-muted-foreground">{detection}</div>
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            if (!preview) return;
            onParsed(preview, {
              importSource: preview.kind === "table" ? "paste-table" : "paste-blocks",
            });
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
