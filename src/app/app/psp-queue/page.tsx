"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  CheckCircle2,
  CornerUpLeft,
  MessageSquareText,
} from "lucide-react";
import {
  SOURCE_LABELS,
  useCompletePspItem,
  usePspQueue,
  useReturnFromPsp,
  type PspFilter,
  type Submission,
} from "@/lib/submissions";
import { useExecRedactions, applyRedactions } from "@/lib/decisions";
import { SubmissionDetailSheet } from "@/components/submissions/submission-detail-sheet";

export default function PspQueuePage() {
  const [filter, setFilter] = useState<PspFilter>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [answering, setAnswering] = useState<Submission | null>(null);

  const { data, isLoading, error } = usePspQueue(filter);
  const { data: redactions } = useExecRedactions();
  const redactionKeywords = useMemo(
    () => (redactions ?? []).map((r) => r.redacted_keyword),
    [redactions],
  );

  const returnToWorkflow = useReturnFromPsp();

  const handleReturn = (id: string) => {
    returnToWorkflow.mutate(id, {
      onSuccess: () => toast.success("Returned to main workflow"),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Return failed"),
    });
  };

  const rows = data ?? [];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            PSP queue
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Logistical questions PSP can answer directly. Mark complete when
            handled, or send back to the main workflow if the submission needs
            a fuller response.
          </p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as PspFilter)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="hidden md:block rounded-lg border bg-card">
        {error ? (
          <div className="p-8 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load PSP queue"}
          </div>
        ) : isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Routed</TableHead>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead className="w-[180px]">Submitter</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="w-[200px]">Why routed</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[260px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const isCompleted = !!s.psp_completed_at;
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => setOpenId(s.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {s.psp_routed_at
                        ? format(new Date(s.psp_routed_at), "d MMM, h:mm a")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {SOURCE_LABELS[s.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium text-foreground">
                        {s.submitter_name
                          ? applyRedactions(s.submitter_name, redactionKeywords)
                          : "Anonymous"}
                      </div>
                      {s.submitter_email && (
                        <div className="text-xs text-muted-foreground">
                          {applyRedactions(s.submitter_email, redactionKeywords)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {applyRedactions(s.content, redactionKeywords)}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-xs text-muted-foreground italic">
                        {s.psp_reason || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {isCompleted ? (
                        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Answered
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                          <HelpCircle className="h-3 w-3" />
                          Open
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isCompleted ? (
                        <span className="text-xs text-muted-foreground">
                          {s.psp_completed_at
                            ? `Closed ${format(new Date(s.psp_completed_at), "d MMM")}`
                            : ""}
                        </span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setAnswering(s)}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Answer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenId(s.id)}
                          >
                            <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                            Reply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReturn(s.id)}
                            disabled={returnToWorkflow.isPending}
                          >
                            <CornerUpLeft className="mr-1.5 h-3.5 w-3.5" />
                            Return
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {error ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load PSP queue"}
          </div>
        ) : isLoading ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState filter={filter} />
          </div>
        ) : (
          rows.map((s) => (
            <MobileCard
              key={s.id}
              submission={s}
              redactionKeywords={redactionKeywords}
              onOpen={() => setOpenId(s.id)}
              onAnswer={() => setAnswering(s)}
              onReturn={() => handleReturn(s.id)}
              busy={returnToWorkflow.isPending}
            />
          ))
        )}
      </div>

      <AnswerDialog
        submission={answering}
        onClose={() => setAnswering(null)}
      />

      <SubmissionDetailSheet
        submissionId={openId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function EmptyState({ filter }: { filter: PspFilter }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-3">
        <HelpCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">
        {filter === "open"
          ? "Nothing in the PSP queue"
          : filter === "completed"
            ? "No completed items yet"
            : "Queue is empty"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        When the AI classifier spots a logistical question (e.g. timing,
        process, document requests), it will appear here for PSP to answer.
      </p>
    </div>
  );
}

function MobileCard({
  submission: s,
  redactionKeywords,
  onOpen,
  onAnswer,
  onReturn,
  busy,
}: {
  submission: Submission;
  redactionKeywords: string[];
  onOpen: () => void;
  onAnswer: () => void;
  onReturn: () => void;
  busy: boolean;
}) {
  const isCompleted = !!s.psp_completed_at;
  return (
    <div className="rounded-lg border bg-card p-4">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left active:bg-muted/40 -m-1 p-1 rounded"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm text-foreground truncate">
              {s.submitter_name
                ? applyRedactions(s.submitter_name, redactionKeywords)
                : "Anonymous"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {s.psp_routed_at
                ? format(new Date(s.psp_routed_at), "d MMM, h:mm a")
                : ""}
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {SOURCE_LABELS[s.source]}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground mt-2">
          {applyRedactions(s.content, redactionKeywords)}
        </p>
        {s.psp_reason && (
          <p className="line-clamp-2 text-xs text-muted-foreground italic mt-1">
            {s.psp_reason}
          </p>
        )}
      </button>
      {!isCompleted && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="sm" variant="default" onClick={onAnswer}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Answer
          </Button>
          <Button size="sm" variant="outline" onClick={onOpen}>
            <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
            Reply
          </Button>
          <Button size="sm" variant="ghost" onClick={onReturn} disabled={busy}>
            <CornerUpLeft className="mr-1.5 h-3.5 w-3.5" />
            Return
          </Button>
        </div>
      )}
    </div>
  );
}

function AnswerDialog({
  submission,
  onClose,
}: {
  submission: Submission | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const complete = useCompletePspItem();

  const handleSubmit = () => {
    if (!submission) return;
    complete.mutate(
      { id: submission.id, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success("Marked as answered");
          setNote("");
          onClose();
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Failed to complete"),
      },
    );
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setNote("");
      onClose();
    }
  };

  return (
    <Dialog open={!!submission} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as answered</DialogTitle>
          <DialogDescription>
            Record an internal note describing how this was handled. The
            submission will be closed out and removed from the queue. Use
            &ldquo;Reply&rdquo; instead if you need to send a response to the
            submitter.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Answered by phone — confirmed town hall is 22 May."
          rows={5}
          maxLength={2000}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={complete.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {complete.isPending ? "Saving…" : "Mark answered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
