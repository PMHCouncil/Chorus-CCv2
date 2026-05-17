"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SubmissionStatus } from "@/lib/submissions";
import type { ResponseStatus } from "@/lib/responses";

export type FlowStep =
  | "new"
  | "classified"
  | "draft"
  | "hr_reviewed"
  | "exec_approved"
  | "sent";

interface StepDef {
  key: FlowStep;
  label: string;
  short: string;
}

const STEPS: StepDef[] = [
  { key: "new", label: "Logged", short: "Logged" },
  { key: "classified", label: "Classified", short: "Clsf" },
  { key: "draft", label: "Drafted", short: "Draft" },
  { key: "hr_reviewed", label: "HR reviewed", short: "HR" },
  { key: "exec_approved", label: "Exec approved", short: "Exec" },
  { key: "sent", label: "Sent", short: "Sent" },
];

export type FlowTimestamps = Partial<Record<FlowStep, string>>;

// Maps the submission + response status onto the 6-step pipeline. The
// classified and themed submission states collapse into one user-facing
// "Classified" step (the AI does both in the same pass). Response status,
// when present, always wins.
export function resolveCurrentStep(
  submissionStatus: SubmissionStatus | null | undefined,
  responseStatus: ResponseStatus | null | undefined,
): FlowStep {
  if (responseStatus) return responseStatus;
  if (submissionStatus === "responded") return "exec_approved";
  if (submissionStatus === "sent") return "sent";
  if (submissionStatus === "themed" || submissionStatus === "classified") {
    return "classified";
  }
  return "new";
}

const TONE_DONE = "bg-emerald-500 border-emerald-500";
const TONE_CURRENT = "bg-primary border-primary ring-2 ring-primary/30";
const TONE_PENDING = "bg-muted border-border";

interface Props {
  submissionStatus?: SubmissionStatus | null;
  responseStatus?: ResponseStatus | null;
  variant?: "compact" | "full";
  /** Shown under the current step in the `full` variant. */
  currentOwnerLabel?: string | null;
  /** Completion timestamps surfaced in the per-step tooltip. */
  timestamps?: FlowTimestamps;
  className?: string;
}

export function SubmissionFlow({
  submissionStatus,
  responseStatus,
  variant = "compact",
  currentOwnerLabel,
  timestamps,
  className,
}: Props) {
  const current = resolveCurrentStep(submissionStatus, responseStatus);
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn("flex items-start", className)}
        role="list"
        aria-label="Submission progress"
      >
        {STEPS.map((step, i) => {
          const state =
            i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
          const dotTone =
            state === "done"
              ? TONE_DONE
              : state === "current"
                ? TONE_CURRENT
                : TONE_PENDING;
          const connectorTone =
            i < currentIdx ? "bg-emerald-500" : "bg-border";
          const ts = timestamps?.[step.key];

          return (
            <div
              key={step.key}
              role="listitem"
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-start"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "rounded-full border transition-colors",
                        variant === "compact" ? "h-2.5 w-2.5" : "h-3 w-3",
                        dotTone,
                      )}
                    />
                    {variant === "full" && (
                      <>
                        <span
                          className={cn(
                            "text-[10px] leading-none",
                            state === "current"
                              ? "text-foreground font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          {step.short}
                        </span>
                        {state === "current" && currentOwnerLabel && (
                          <span className="text-[10px] leading-none text-primary font-medium max-w-[80px] text-center truncate">
                            {currentOwnerLabel}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="text-xs">
                    <div>
                      {step.label}
                      {state === "current" && " — current"}
                      {state === "done" && " — done"}
                    </div>
                    {ts && (
                      <div className="text-muted-foreground mt-0.5">
                        {format(new Date(ts), "d MMM yyyy, h:mma")}
                      </div>
                    )}
                    {state === "current" && currentOwnerLabel && (
                      <div className="text-muted-foreground mt-0.5">
                        With: {currentOwnerLabel}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px mt-1 transition-colors",
                    variant === "compact" ? "w-3" : "w-6",
                    connectorTone,
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
