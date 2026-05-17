"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAddRedaction,
  useExecRedactions,
  useRemoveRedaction,
} from "@/lib/decisions";

/**
 * Standalone, self-contained editor for the current viewer's personal
 * redaction list. Renders the keyword list plus add/remove controls.
 * Can be embedded on a settings/preferences page or inside a drawer.
 */
export function RedactionsManager() {
  const [value, setValue] = useState("");
  const { data: keywords = [], isLoading } = useExecRedactions();
  const add = useAddRedaction();
  const remove = useRemoveRedaction();

  const handleAdd = async () => {
    const k = value.trim();
    if (!k) return;
    if (k.length < 2) {
      toast.error("Keyword must be at least 2 characters");
      return;
    }
    try {
      await add.mutateAsync(k);
      setValue("");
      toast.success("Redaction added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Redaction removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a name, role, or project codename"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          disabled={add.isPending}
        />
        <Button
          onClick={() => void handleAdd()}
          disabled={add.isPending || !value.trim()}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add</span>
        </Button>
      </div>

      <div className="space-y-1.5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No keywords yet. Add a word or phrase above and it will be masked
            wherever submission content is shown to you.
          </p>
        ) : (
          keywords.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
            >
              <span className="text-sm font-mono">{k.redacted_keyword}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleRemove(k.id)}
                disabled={remove.isPending}
                aria-label={`Remove redaction "${k.redacted_keyword}"`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
