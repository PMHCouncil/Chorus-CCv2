"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { Trash2, GitMerge, Save, Link2Off, FileText } from "lucide-react";
import {
  useTheme,
  useThemeMembers,
  useThemesWithBreakdown,
  useUpdateTheme,
  useDeleteTheme,
  useUnlinkThemeMember,
  useMergeThemes,
} from "@/lib/themes";
import { SENTIMENT_TONE } from "@/lib/classify";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Props {
  themeId: string | null;
  onClose: () => void;
  onOpenSubmission?: (id: string) => void;
}

export function ThemeDetailSheet({ themeId, onClose, onOpenSubmission }: Props) {
  const { roles } = useAuth();
  const canEdit = hasAnyRole(roles, ["admin", "hr"]);
  const { data: theme, isLoading } = useTheme(themeId);
  const { data: members = [] } = useThemeMembers(themeId);
  const { data: allThemes = [] } = useThemesWithBreakdown();

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [mergeTarget, setMergeTarget] = useState<string>("");

  useEffect(() => {
    if (theme) {
      setName(theme.name);
      setSummary(theme.summary ?? "");
      setDescription(theme.description ?? "");
      setMergeTarget("");
    }
  }, [theme]);

  const update = useUpdateTheme();
  const remove = useDeleteTheme();
  const unlink = useUnlinkThemeMember();
  const merge = useMergeThemes();

  const otherThemes = useMemo(
    () => allThemes.filter((t) => t.id !== themeId),
    [allThemes, themeId],
  );

  const dirty =
    !!theme &&
    (name !== theme.name ||
      summary !== (theme.summary ?? "") ||
      description !== (theme.description ?? ""));

  return (
    <Sheet open={!!themeId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !theme ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">{theme.name}</SheetTitle>
              <SheetDescription>
                {theme.submission_count} linked submission
                {theme.submission_count === 1 ? "" : "s"} · created{" "}
                {format(new Date(theme.created_at), "d MMM yyyy")}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Theme details</h3>
                <div className="space-y-2">
                  <Label htmlFor="theme-name">Name</Label>
                  <Input
                    id="theme-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="theme-summary">Short summary</Label>
                  <Input
                    id="theme-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="One-line summary shown in the inbox"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="theme-desc">Description / talking points</Label>
                  <Textarea
                    id="theme-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Notes for execs and response drafters"
                    disabled={!canEdit}
                  />
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() =>
                        update.mutate(
                          {
                            id: theme.id,
                            patch: {
                              name: name.trim(),
                              summary: summary.trim() || null,
                              description: description.trim() || null,
                            },
                          },
                          {
                            onSuccess: () => toast.success("Theme updated"),
                            onError: (e) =>
                              toast.error(e instanceof Error ? e.message : "Save failed"),
                          },
                        )
                      }
                      disabled={!dirty || !name.trim() || update.isPending}
                    >
                      <Save className="h-4 w-4 mr-1.5" />
                      {update.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Linked submissions ({members.length})
                  </h3>
                </div>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No submissions linked to this theme yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {members.map((m) => (
                      <li
                        key={m.submission_id}
                        className="rounded-md border p-3 text-sm space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">
                                {m.submission.submitter_name ?? "Anonymous"}
                              </span>
                              {m.submission.submitter_role && (
                                <span className="text-xs text-muted-foreground">
                                  {m.submission.submitter_role}
                                </span>
                              )}
                              {m.classification?.sentiment && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs",
                                    SENTIMENT_TONE[m.classification.sentiment],
                                  )}
                                >
                                  {m.classification.sentiment}
                                </Badge>
                              )}
                              {(m.classification?.divisions ?? []).map((d) => (
                                <Badge key={d} variant="secondary" className="text-xs">
                                  {d}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(m.submission.submitted_at), "d MMM yyyy")}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {onOpenSubmission && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onOpenSubmission(m.submission_id)}
                                title="Open submission"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  unlink.mutate(
                                    {
                                      themeId: theme.id,
                                      submissionId: m.submission_id,
                                    },
                                    {
                                      onSuccess: () => toast.success("Unlinked"),
                                      onError: (e) =>
                                        toast.error(
                                          e instanceof Error ? e.message : "Failed",
                                        ),
                                    },
                                  )
                                }
                                title="Unlink from theme"
                              >
                                <Link2Off className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {m.submission.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {canEdit && (
                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Merge into another theme</h3>
                    <p className="text-xs text-muted-foreground">
                      Moves all linked submissions to the target theme and deletes this
                      one. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Select value={mergeTarget} onValueChange={setMergeTarget}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a target theme" />
                        </SelectTrigger>
                        <SelectContent>
                          {otherThemes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name} ({t.submission_count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="secondary"
                            disabled={!mergeTarget || merge.isPending}
                          >
                            <GitMerge className="h-4 w-4 mr-1.5" />
                            Merge
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Merge themes?</AlertDialogTitle>
                            <AlertDialogDescription>
                              All {theme.submission_count} submission(s) linked to{" "}
                              <strong>{theme.name}</strong> will be moved to{" "}
                              <strong>
                                {otherThemes.find((t) => t.id === mergeTarget)?.name}
                              </strong>{" "}
                              and this theme will be deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                merge.mutate(
                                  { sourceId: theme.id, targetId: mergeTarget },
                                  {
                                    onSuccess: () => {
                                      toast.success("Themes merged");
                                      onClose();
                                    },
                                    onError: (e) =>
                                      toast.error(
                                        e instanceof Error ? e.message : "Merge failed",
                                      ),
                                  },
                                )
                              }
                            >
                              Merge themes
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <Separator className="my-4" />

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-1.5" />
                          Delete theme
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this theme?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All {theme.submission_count} link(s) will be removed. The
                            underlying submissions are not deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              remove.mutate(theme.id, {
                                onSuccess: () => {
                                  toast.success("Theme deleted");
                                  onClose();
                                },
                                onError: (e) =>
                                  toast.error(
                                    e instanceof Error ? e.message : "Delete failed",
                                  ),
                              })
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
