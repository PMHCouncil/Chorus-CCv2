"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sparkles, Save, CheckCircle2, Send, Copy, RotateCcw } from "lucide-react";
import {
  RESPONSE_STATUS_LABELS,
  useApproveResponse,
  useDraftResponse,
  useMarkResponseSent,
  useReopenResponse,
  useResponseForSubmission,
  useReviewResponse,
  useUpdateResponseDraft,
  type ResponseStatus,
} from "@/lib/responses";
import { hasAnyRole, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ResponseStatus, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  hr_reviewed: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  exec_approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  sent: "bg-primary/15 text-primary border-primary/30",
};

interface Props {
  submissionId: string;
}

export function ResponsePanel({ submissionId }: Props) {
  const { roles } = useAuth();
  // Mirrors the SECURITY DEFINER helpers on the database:
  //   is_content_editor   = hr, gm, gm_ea, director   (drafts + reviews)
  //   is_content_approver = gm, director, exec        (sets exec_approved)
  // Admin appears in the UI checks too so that admin operators can fix
  // things if needed (RLS still prevents them seeing content rows).
  const canDraft = hasAnyRole(roles, ["admin", "hr", "gm", "gm_ea", "director"]);
  const canApprove = hasAnyRole(roles, ["admin", "gm", "director", "exec"]);
  const canSend = hasAnyRole(roles, ["admin", "hr"]);

  const { data: response, isLoading } = useResponseForSubmission(submissionId);
  const draft = useDraftResponse();
  const update = useUpdateResponseDraft();
  const review = useReviewResponse();
  const approve = useApproveResponse();
  const send = useMarkResponseSent();
  const reopen = useReopenResponse();

  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [changeMade, setChangeMade] = useState(false);

  useEffect(() => {
    setText(response?.draft_text ?? "");
    setNotes(response?.notes ?? "");
    setChangeMade(response?.change_made ?? false);
    // Reset local form state only when the response row changes (or arrives).
    // We intentionally do NOT depend on the individual fields — if the user is
    // mid-edit, a refetch of the same row should not blow away their changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response?.id]);

  const isLocked = !!response && response.status !== "draft";
  const dirty =
    !!response &&
    (text !== response.draft_text ||
      (notes ?? "") !== (response.notes ?? "") ||
      changeMade !== response.change_made);

  const handleDraft = async () => {
    try {
      await draft.mutateAsync(submissionId);
      toast.success("Draft generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draft");
    }
  };

  const handleSave = async () => {
    if (!response) return;
    try {
      await update.mutateAsync({
        id: response.id,
        draft_text: text,
        notes: notes.trim() || null,
        change_made: changeMade,
      });
      toast.success("Draft saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleReview = async () => {
    if (!response) return;
    try {
      if (dirty) await update.mutateAsync({ id: response.id, draft_text: text, notes: notes.trim() || null, change_made: changeMade });
      await review.mutateAsync({ id: response.id });
      toast.success("Marked HR reviewed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleApprove = async () => {
    if (!response) return;
    try {
      await approve.mutateAsync({ id: response.id, submissionId });
      toast.success("Approved by exec");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleSend = async () => {
    if (!response) return;
    try {
      await send.mutateAsync({ id: response.id, submissionId });
      toast.success("Marked as sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleReopen = async () => {
    if (!response) return;
    try {
      await reopen.mutateAsync(response.id);
      toast.success("Reopened to draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Response draft
        </h4>
        <div className="flex items-center gap-2">
          {response && (
            <Badge variant="outline" className={cn("border", STATUS_TONE[response.status])}>
              {RESPONSE_STATUS_LABELS[response.status]}
            </Badge>
          )}
          {canDraft && (
            <Button
              size="sm"
              variant={response ? "outline" : "default"}
              onClick={handleDraft}
              disabled={draft.isPending || isLocked}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {draft.isPending ? "Drafting…" : response ? "Re-draft" : "Draft response"}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !response ? (
        <p className="text-sm text-muted-foreground">
          No draft yet.{" "}
          {canDraft ? "Click 'Draft response' to generate a personalised reply." : ""}
        </p>
      ) : (
        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            disabled={isLocked || !canDraft}
            className="text-sm leading-relaxed"
          />

          <div className="grid gap-2">
            <Label htmlFor="resp-notes" className="text-xs uppercase tracking-wide text-muted-foreground">
              Reviewer notes (internal)
            </Label>
            <Textarea
              id="resp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={isLocked || !canDraft}
              placeholder="Optional context for the next reviewer"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={changeMade}
              onCheckedChange={(v) => setChangeMade(!!v)}
              disabled={isLocked || !canDraft}
            />
            Edited the AI draft before approval
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>

            {response.status === "draft" && canDraft && (
              <>
                <Button size="sm" variant="outline" onClick={handleSave} disabled={!dirty || update.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {update.isPending ? "Saving…" : "Save draft"}
                </Button>
                <Button size="sm" onClick={handleReview} disabled={review.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {review.isPending ? "…" : "Mark HR reviewed"}
                </Button>
              </>
            )}

            {response.status === "hr_reviewed" && canApprove && (
              <Button size="sm" onClick={handleApprove} disabled={approve.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {approve.isPending ? "…" : "Exec approve"}
              </Button>
            )}

            {response.status === "exec_approved" && canSend && (
              <Button size="sm" onClick={handleSend} disabled={send.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {send.isPending ? "…" : "Mark as sent"}
              </Button>
            )}

            {response.status !== "draft" && response.status !== "sent" && canDraft && (
              <Button size="sm" variant="ghost" onClick={handleReopen} disabled={reopen.isPending}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reopen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
