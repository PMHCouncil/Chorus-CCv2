"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useBulkClassify } from "@/lib/submissions";
import { setAppSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Settings as SettingsIcon, ShieldCheck, Sparkles } from "lucide-react";
import { SettingsTabs } from "@/components/settings/settings-tabs";

const MODEL_OPTIONS: Array<{ value: string; label: string; provider: string }> = [
  { value: "claude-opus-4-7", label: "Claude Opus 4.7 (highest quality)", provider: "Anthropic" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (default)", provider: "Anthropic" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)", provider: "Anthropic" },
];

const KEYS = ["classifier_system_prompt", "classifier_model", "responder_system_prompt"] as const;

export default function SettingsPage() {
  const { roles, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !hasAnyRole(roles, ["admin"])) {
      router.replace("/app");
    }
  }, [loading, roles, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", KEYS as unknown as string[]);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<
        string,
        string
      >;
    },
  });

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [responderPrompt, setResponderPrompt] = useState("");

  useEffect(() => {
    if (data) {
      setPrompt(data.classifier_system_prompt ?? "");
      setModel(data.classifier_model ?? "claude-sonnet-4-6");
      setResponderPrompt(data.responder_system_prompt ?? "");
    }
  }, [data]);

  const [reclassifyScope, setReclassifyScope] = useState<"all" | "unclassified" | "classified">(
    "all",
  );
  const bulkClassify = useBulkClassify();
  const [reclassifyProgress, setReclassifyProgress] = useState<{
    total: number;
    done: number;
    failed: number;
  } | null>(null);

  const runReclassify = async () => {
    let q = supabase.from("submissions").select("id, status").is("archived_at", null);
    if (reclassifyScope === "unclassified") q = q.eq("status", "new");
    if (reclassifyScope === "classified") q = q.in("status", ["classified", "themed"]);
    const { data: rows, error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      toast.info("No submissions match this scope.");
      return;
    }
    setReclassifyProgress({ total: ids.length, done: 0, failed: 0 });
    const t = toast.loading(`Reclassifying 0 / ${ids.length}…`);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await bulkClassify.mutateAsync([id]);
        if (!res[0]?.ok) failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      setReclassifyProgress({ total: ids.length, done, failed });
      toast.loading(
        `Reclassifying ${done} / ${ids.length}${failed ? ` (${failed} failed)` : ""}…`,
        { id: t },
      );
    }
    toast.success(
      `Reclassified ${done - failed} of ${ids.length}${failed ? ` (${failed} failed)` : ""}`,
      { id: t },
    );
    setReclassifyProgress(null);
  };

  const save = useMutation({
    mutationFn: () =>
      // Server action: requireAdmin + key whitelist + audit row. Direct anon
      // upserts were removed by the 2026-05-18 hardening pass.
      setAppSettings({
        entries: [
          { key: "classifier_system_prompt", value: prompt },
          { key: "classifier_model", value: model },
          { key: "responder_system_prompt", value: responderPrompt },
        ],
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
  });

  if (!hasAnyRole(roles, ["admin"])) return null;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tune the AI classifier used in the Inbox. Changes apply immediately.
          </p>
        </div>
      </div>

      <SettingsTabs />

      <div className="rounded-lg border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Select value={model} onValueChange={setModel} disabled={isLoading}>
            <SelectTrigger id="model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex flex-col">
                    <span>{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.provider} · {m.value}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            All models call Anthropic directly using the <code>ANTHROPIC_API_KEY</code> server-side secret.
          </p>
          <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
            <span>
              The Anthropic API key is stored as an encrypted server-side env var and is
              never exposed to the browser. All Claude calls run inside an authenticated
              Server Action. Submission content is sent only to Anthropic over TLS and is
              not logged in the database.
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt">Classifier system prompt</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            rows={20}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            The model must return JSON matching the documented schema (sentiment plus the
            array fields divisions, feedback_types, principle_tags, roles_affected, themes,
            summary, confidence). Plural fields are arrays: include every value that
            applies, a single-element array if only one applies, or an empty array if none.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="responder-prompt">Response drafter system prompt</Label>
          <Textarea
            id="responder-prompt"
            value={responderPrompt}
            onChange={(e) => setResponderPrompt(e.target.value)}
            disabled={isLoading}
            rows={14}
            className="font-mono text-xs"
            placeholder="Leave blank to use the built-in default reply prompt."
          />
          <p className="text-xs text-muted-foreground">
            Used when HR clicks &ldquo;Draft response&rdquo; on a submission. Leave blank to use the
            built-in warm, plain-English template. Output is a plain-text reply body (no
            JSON, no markdown).
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Reclassify submissions</h2>
            <p className="text-sm text-muted-foreground">
              Re-run the AI classifier on existing submissions after changing the prompt or
              model. Existing classifications are overwritten; human-verified flags are
              reset.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="reclassify-scope">Scope</Label>
            <Select
              value={reclassifyScope}
              onValueChange={(v) => setReclassifyScope(v as typeof reclassifyScope)}
              disabled={bulkClassify.isPending}
            >
              <SelectTrigger id="reclassify-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active submissions</SelectItem>
                <SelectItem value="unclassified">Only unclassified (status: new)</SelectItem>
                <SelectItem value="classified">
                  Only already classified (re-run with new prompt)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={bulkClassify.isPending}>
                {bulkClassify.isPending
                  ? reclassifyProgress
                    ? `Running ${reclassifyProgress.done}/${reclassifyProgress.total}…`
                    : "Running…"
                  : "Run reclassification"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reclassify submissions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This calls the AI classifier on every submission in the selected scope.
                  It can take a while and will overwrite existing classifications, themes,
                  and the human-verified flag. An audit log entry is recorded for each.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void runReclassify()}>
                  Run now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
