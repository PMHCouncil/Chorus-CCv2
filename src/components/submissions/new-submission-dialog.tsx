"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import {
  SOURCE_LABELS,
  submissionInputSchema,
  useCreateSubmission,
  type SubmissionSource,
} from "@/lib/submissions";

export function NewSubmissionDialog() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<SubmissionSource>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [content, setContent] = useState("");
  const create = useCreateSubmission();

  const reset = () => {
    setSource("form");
    setName("");
    setEmail("");
    setRole("");
    setContent("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = submissionInputSchema.safeParse({
      source,
      submitter_name: name || undefined,
      submitter_email: email || undefined,
      submitter_role: role || undefined,
      content,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success("Submission added to inbox");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save submission");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New submission
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Log a new submission</DialogTitle>
            <DialogDescription>
              Capture feedback received via email, CC, in-person, or any other channel. Submissions
              from the online form are added automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="source">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as SubmissionSource)}>
                <SelectTrigger id="source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Submitter name (optional)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Anonymous if blank"
                  maxLength={200}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Submitter email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@pmhc.nsw.gov.au"
                  maxLength={255}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Submitter role / division (optional)</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Coordinator, Community Infrastructure"
                maxLength={200}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content">Feedback content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the email body, transcript, or notes from the conversation…"
                rows={10}
                maxLength={20000}
                required
              />
              <p className="text-xs text-muted-foreground">{content.length} / 20,000 characters</p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save submission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
