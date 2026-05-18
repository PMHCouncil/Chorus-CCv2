"use client";

import { Mail, Info } from "lucide-react";
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
import type { ParsedEmail } from "@/lib/import/parse";
import type { SubmissionSource } from "@/lib/submissions";

export interface EmailDraft {
  submitter_name: string;
  submitter_email: string;
  submitted_at: string;
  content: string;
  source: SubmissionSource;
}

interface Props {
  email: ParsedEmail;
  draft: EmailDraft;
  onDraftChange: (draft: EmailDraft) => void;
}

const SOURCES: { value: SubmissionSource; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "cc", label: "CC / forwarded" },
  { value: "form", label: "Online form" },
  { value: "other", label: "Other" },
];

export function EmailReviewStep({ email, draft, onDraftChange }: Props) {
  const isForwarded = email.originalFrom !== null;
  const set = <K extends keyof EmailDraft>(key: K, value: EmailDraft[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
        <div className="rounded-full bg-background border p-2 shrink-0">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-sm font-medium">Email detected</div>
          {isForwarded ? (
            <div className="text-xs text-muted-foreground mt-0.5">
              Forwarded by{" "}
              <span className="font-medium">
                {email.outerFrom?.name ?? email.outerFrom?.email ?? "unknown"}
              </span>
              {" "}— original sender shown below.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5">
              Sender details and content extracted from the .eml file. Review and edit before importing.
            </div>
          )}
        </div>
      </div>

      {/* Subject (read-only info) */}
      {email.originalSubject && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Subject: <span className="text-foreground font-medium">{email.originalSubject}</span></span>
        </div>
      )}

      {/* Sender fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="er-name">
            {isForwarded ? "Original sender name" : "Sender name"}
          </Label>
          <Input
            id="er-name"
            value={draft.submitter_name}
            onChange={(e) => set("submitter_name", e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="er-email">
            {isForwarded ? "Original sender email" : "Sender email"}
          </Label>
          <Input
            id="er-email"
            type="email"
            value={draft.submitter_email}
            onChange={(e) => set("submitter_email", e.target.value)}
            placeholder="email@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="er-date">Date sent</Label>
          <Input
            id="er-date"
            type="datetime-local"
            value={draft.submitted_at}
            onChange={(e) => set("submitted_at", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="er-source">Source</Label>
          <Select
            value={draft.source}
            onValueChange={(v) => set("source", v as SubmissionSource)}
          >
            <SelectTrigger id="er-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="er-content">Content</Label>
        <Textarea
          id="er-content"
          value={draft.content}
          onChange={(e) => set("content", e.target.value)}
          rows={10}
          className="font-mono text-xs resize-y"
          placeholder="Email body content…"
        />
      </div>

      {email.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-0.5">
          {email.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
