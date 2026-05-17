"use client";

import { useState, useEffect, useMemo, type KeyboardEvent } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Trash2, Sparkles, CheckCircle2, ShieldCheck, X, Plus, Wand2, Maximize2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  useDeleteSubmission,
  useSubmission,
  useUpdateSubmitter,
  useStaffMembers,
  useBulkAssign,
} from "@/lib/submissions";
import {
  useClassification,
  useClassifySubmission,
  useSubmissionThemes,
  useVerifyClassification,
  SENTIMENT_OPTIONS,
  DIVISION_OPTIONS,
  FEEDBACK_TYPE_OPTIONS,
  PRINCIPLE_TAG_OPTIONS,
  SENTIMENT_TONE,
  type Sentiment,
} from "@/lib/classify";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { applyRedactions, useExecRedactions } from "@/lib/decisions";
import { cn } from "@/lib/utils";
import { ResponsePanel } from "@/components/responses/response-panel";

interface Props {
  submissionId: string | null;
  onClose: () => void;
}

const NONE = "__none__";

export function SubmissionDetailSheet({ submissionId, onClose }: Props) {
  const { data } = useSubmission(submissionId);

  return (
    <Sheet open={!!submissionId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <div className="min-w-0">
              <SheetTitle>Submission detail</SheetTitle>
              <SheetDescription>
                {data ? format(new Date(data.submitted_at), "PPP 'at' p") : "Loading…"}
              </SheetDescription>
            </div>
            {submissionId && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="hidden md:inline-flex h-8 w-8 shrink-0"
                    >
                      <Link
                        href={`/app/submissions/${submissionId}`}
                        onClick={onClose}
                        aria-label="Open full page"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open full page</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6">
          <SubmissionDetailBody
            submissionId={submissionId}
            layout="sheet"
            onAfterDelete={onClose}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface BodyProps {
  submissionId: string | null;
  layout: "sheet" | "page";
  onAfterDelete?: () => void;
}

export function SubmissionDetailBody({ submissionId, layout, onAfterDelete }: BodyProps) {
  const { data, isLoading } = useSubmission(submissionId);
  const { data: classification } = useClassification(submissionId);
  const { data: themeLinks } = useSubmissionThemes(submissionId);
  const { data: redactions } = useExecRedactions();
  const redactionKeywords = useMemo(
    () => (redactions ?? []).map((r) => r.redacted_keyword),
    [redactions],
  );
  const del = useDeleteSubmission();
  const classify = useClassifySubmission();
  const verify = useVerifyClassification();
  const { roles } = useAuth();
  const canDelete = hasAnyRole(roles, ["admin"]);
  const canClassify = hasAnyRole(roles, ["admin", "hr"]);

  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [feedbackTypes, setFeedbackTypes] = useState<string[]>([]);
  const [principleTags, setPrincipleTags] = useState<string[]>([]);
  const [rolesAffected, setRolesAffected] = useState<string[]>([]);

  useEffect(() => {
    setSentiment(classification?.sentiment ?? null);
    setDivisions(classification?.divisions ?? []);
    setFeedbackTypes(classification?.feedback_types ?? []);
    setPrincipleTags(classification?.principle_tags ?? []);
    setRolesAffected(classification?.roles_affected ?? []);
    // Reset local form state only when the classification row changes (or
    // arrives). Depending on the individual fields would clobber a reviewer's
    // in-progress edits on every refetch of the same row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classification?.id]);

  const handleDelete = async () => {
    if (!submissionId) return;
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    try {
      await del.mutateAsync(submissionId);
      toast.success("Submission deleted");
      onAfterDelete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleClassify = async () => {
    if (!submissionId) return;
    try {
      await classify.mutateAsync(submissionId);
      toast.success("Classification complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Classification failed");
    }
  };

  const handleVerify = async () => {
    if (!classification) return;
    try {
      await verify.mutateAsync({
        classificationId: classification.id,
        patch: {
          sentiment,
          divisions,
          feedback_types: feedbackTypes,
          principle_tags: principleTags,
          roles_affected: rolesAffected,
        },
      });
      toast.success("Classification verified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    }
  };

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const badges = (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{SOURCE_LABELS[data.source]}</Badge>
      <Badge>{STATUS_LABELS[data.status]}</Badge>
      {classification?.human_verified && (
        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-3 w-3" /> Verified
        </Badge>
      )}
    </div>
  );

  const contentBlock = (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Content
      </h4>
      <div className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
        {applyRedactions(data.content, redactionKeywords)}
      </div>
    </div>
  );

  const classificationBlock = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI classification
        </h4>
        {canClassify && (
          <Button
            size="sm"
            variant={classification ? "outline" : "default"}
            onClick={handleClassify}
            disabled={classify.isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {classify.isPending
              ? "Classifying…"
              : classification
                ? "Re-run AI"
                : "Classify with AI"}
          </Button>
        )}
      </div>

      {!classification ? (
        <p className="text-sm text-muted-foreground">
          No classification yet. {canClassify ? "Click 'Classify with AI' to run analysis." : ""}
        </p>
      ) : (
        <div className="space-y-4">
          {classification.ai_confidence != null && (
            <div className="text-xs text-muted-foreground">
              AI confidence: {Math.round(classification.ai_confidence * 100)}%
            </div>
          )}

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sentiment
            </label>
            <Select
              value={sentiment ?? NONE}
              onValueChange={(v) =>
                setSentiment(v === NONE ? null : (v as Sentiment))
              }
              disabled={!canClassify}
            >
              <SelectTrigger
                className={cn("mt-1", sentiment && SENTIMENT_TONE[sentiment])}
              >
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {SENTIMENT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ChipMultiSelect
            label="Divisions"
            values={divisions}
            onChange={setDivisions}
            options={DIVISION_OPTIONS}
            disabled={!canClassify}
          />
          <ChipMultiSelect
            label="Feedback types"
            values={feedbackTypes}
            onChange={setFeedbackTypes}
            options={FEEDBACK_TYPE_OPTIONS}
            disabled={!canClassify}
          />
          <ChipMultiSelect
            label="Principle tags"
            values={principleTags}
            onChange={setPrincipleTags}
            options={PRINCIPLE_TAG_OPTIONS}
            disabled={!canClassify}
          />
          <ChipFreeText
            label="Roles affected"
            values={rolesAffected}
            onChange={setRolesAffected}
            placeholder="e.g. Manager Customer Experience"
            disabled={!canClassify}
          />

          {themeLinks && themeLinks.length > 0 && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Themes
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {themeLinks.map((t) => (
                  <Badge key={t.theme_id} variant="secondary">
                    {t.themes?.name ?? "None"}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {canClassify && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleVerify} disabled={verify.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save & mark verified
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const responseBlock = <ResponsePanel submissionId={data.id} />;

  const deleteBlock = canDelete ? (
    <div className="flex justify-end pt-4">
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={del.isPending}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>
    </div>
  ) : null;

  const assigneePicker = (
    <AssigneePicker submissionId={data.id} assignedTo={data.assigned_to} />
  );

  if (layout === "page") {
    return (
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          {badges}
          <SubmitterPanel submission={data} canEdit={canClassify} />
          {assigneePicker}
          <Separator />
          {contentBlock}
        </div>
        <div className="lg:col-span-2 space-y-6">
          {classificationBlock}
          <Separator />
          {responseBlock}
          {deleteBlock}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {badges}
      <SubmitterPanel submission={data} canEdit={canClassify} />
      {assigneePicker}
      <Separator />
      {contentBlock}
      <Separator />
      {classificationBlock}
      <Separator />
      {responseBlock}
      {deleteBlock}
    </div>
  );
}

function AssigneePicker({
  submissionId,
  assignedTo,
}: {
  submissionId: string;
  assignedTo: string | null;
}) {
  const { roles } = useAuth();
  const canAssign = hasAnyRole(roles, ["admin", "hr", "exec"]);
  const { data: staff = [] } = useStaffMembers();
  const assign = useBulkAssign();
  const current = assignedTo ? staff.find((s) => s.id === assignedTo) : null;

  const handleChange = (value: string) => {
    const next = value === NONE ? null : value;
    assign.mutate(
      { ids: [submissionId], assigneeId: next },
      {
        onSuccess: () =>
          toast.success(next ? "Assigned" : "Unassigned"),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Assign failed"),
      },
    );
  };

  const initials = (s: { display_name: string | null; email: string | null }) => {
    const src = (s.display_name || s.email || "?").trim();
    return src
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  };

  const roleBadgeFor = (s: { roles?: string[] }) => {
    const r = s.roles?.[0];
    return r ? <Badge variant="outline" className="text-[10px] uppercase">{r}</Badge> : null;
  };

  return (
    <div className="grid grid-cols-3 items-center gap-2 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Assigned to
      </span>
      <div className="col-span-2 flex items-center gap-2">
        {canAssign ? (
          <Select
            value={assignedTo ?? NONE}
            onValueChange={handleChange}
            disabled={assign.isPending}
          >
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Unassigned">
                {current ? (
                  <span className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-content-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {initials(current)}
                    </span>
                    <span>{current.display_name || current.email}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">Unassigned — Assign</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-content-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {initials(s)}
                    </span>
                    <span>{s.display_name || s.email || s.id.slice(0, 8)}</span>
                    {roleBadgeFor(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : current ? (
          <span className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-content-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
              {initials(current)}
            </span>
            <span>{current.display_name || current.email}</span>
          </span>
        ) : (
          <span className="text-muted-foreground italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function ChipMultiSelect({
  label,
  values,
  onChange,
  options,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  const remaining = options.filter((o) => !values.includes(o));
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border bg-card p-2 min-h-9">
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground px-1">None</span>
        )}
        {values.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className="gap-1 pr-1"
          >
            <span>{v}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-sm hover:bg-muted-foreground/10 p-0.5"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && remaining.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => v && onChange([...values, v])}
          >
            <SelectTrigger className="h-7 w-auto min-w-32 border-dashed text-xs">
              <SelectValue placeholder="Add…" />
            </SelectTrigger>
            <SelectContent>
              {remaining.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function ChipFreeText({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="mt-1 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {values.length === 0 && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              <span>{v}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="rounded-sm hover:bg-muted-foreground/10 p-0.5"
                  aria-label={`Remove ${v}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {!disabled && (
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="h-8 text-sm"
              maxLength={200}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={add}
              disabled={!draft.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmitterPanel({
  submission,
  canEdit,
}: {
  submission: NonNullable<ReturnType<typeof useSubmission>["data"]>;
  canEdit: boolean;
}) {
  const update = useUpdateSubmitter();
  const [name, setName] = useState(submission.submitter_name ?? "");
  const [email, setEmail] = useState(submission.submitter_email ?? "");
  const [role, setRole] = useState(submission.submitter_role ?? "");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    setName(submission.submitter_name ?? "");
    setEmail(submission.submitter_email ?? "");
    setRole(submission.submitter_role ?? "");
  }, [submission.id, submission.submitter_name, submission.submitter_email, submission.submitter_role]);

  const rawData = (submission.raw_data as Record<string, unknown> | null) ?? {};
  const enriched = new Set<string>(
    Array.isArray(rawData.enriched_sender_fields)
      ? (rawData.enriched_sender_fields as string[])
      : [],
  );
  const enrichedValues =
    rawData.enriched_sender_values && typeof rawData.enriched_sender_values === "object"
      ? (rawData.enriched_sender_values as Record<string, string>)
      : {};

  const isEnriched = (key: string, currentValue: string | null | undefined) => {
    if (!enriched.has(key)) return false;
    const stored = enrichedValues[key];
    if (!stored) return false;
    return (currentValue ?? "").trim() === stored.trim();
  };

  const save = async (field: "submitter_name" | "submitter_email" | "submitter_role", value: string) => {
    try {
      await update.mutateAsync({ id: submission.id, patch: { [field]: value } });
      toast.success("Submitter details updated");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const fields: Array<{
    key: "submitter_name" | "submitter_email" | "submitter_role";
    label: string;
    value: string;
    setValue: (v: string) => void;
    placeholder: string;
    type?: string;
  }> = [
    { key: "submitter_name", label: "Submitter", value: name, setValue: setName, placeholder: "Anonymous" },
    { key: "submitter_email", label: "Email", value: email, setValue: setEmail, placeholder: "None", type: "email" },
    { key: "submitter_role", label: "Role / Division", value: role, setValue: setRole, placeholder: "None" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3 text-sm">
        {fields.map((f) => {
          const showEnriched = isEnriched(
            f.key,
            f.key === "submitter_name"
              ? submission.submitter_name
              : f.key === "submitter_email"
                ? submission.submitter_email
                : submission.submitter_role,
          );
          const isEditing = editing === f.key;
          return (
            <div key={f.key} className="grid grid-cols-3 items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </span>
              <div className="col-span-2 flex items-center gap-2">
                {isEditing && canEdit ? (
                  <>
                    <Input
                      value={f.value}
                      type={f.type ?? "text"}
                      onChange={(e) => f.setValue(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => save(f.key, f.value)}
                      disabled={update.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null);
                        setName(submission.submitter_name ?? "");
                        setEmail(submission.submitter_email ?? "");
                        setRole(submission.submitter_role ?? "");
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => canEdit && setEditing(f.key)}
                      className={cn(
                        "flex-1 text-left text-foreground",
                        canEdit && "hover:underline cursor-text",
                      )}
                      disabled={!canEdit}
                    >
                      {f.value || <span className="text-muted-foreground">{f.placeholder}</span>}
                    </button>
                    {showEnriched && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
                          >
                            <Wand2 className="h-3 w-3" />
                            Extracted
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Auto-populated by the AI from the submission content. Edit if incorrect.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
