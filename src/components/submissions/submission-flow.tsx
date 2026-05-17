"use client";

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
  | "themed"
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
  { key: "new", label: "New", short: "New" },
  { key: "classified", label: "Classified", short: "Clsf" },
  { key: "themed", label: "Themed", short: "Theme" },
  { key: "draft", label: "Draft", short: "Draft" },
  { key: "hr_reviewed", label: "HR reviewed", short: "HR" },
  { key: "exec_approved", label: "Exec approved", short: "Exec" },
  { key: "sent", label: "Sent", short: "Sent" },
];

// Maps the current submission + response status onto the single 7-step
// pipeline. The response status, when present, always wins because once a
// response exists the submission has progressed past the intake stages.
export function resolveCurrentStep(
  submissionStatus: SubmissionStatus | null | undefined,
  responseStatus: ResponseStatus | null | undefined,
): FlowStep {
  if (responseStatus) return responseStatus;
  if (submissionStatus === "responded") return "exec_approved";
  if (submissionStatus === "sent") return "sent";
  if (submissionStatus === "themed") return "themed";
  if (submissionStatus === "classified") return "classified";
  return "new";
}

const TONE_DONE = "bg-emerald-500 border-emerald-500";
const TONE_CURRENT = "bg-primary border-primary ring-2 ring-primary/30";
const TONE_PENDING = "bg-muted border-border";

interface Props {
  submissionStatus?: SubmissionStatus | null;
  responseStatus?: ResponseStatus | null;
  variant?: "compact" | "full";
  className?: string;
}

export function SubmissionFlow({
  submissionStatus,
  responseStatus,
  variant = "compact",
  className,
}: Props) {
  const current = resolveCurrentStep(submissionStatus, responseStatus);
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn("flex items-center", className)}
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

          return (
            <div
              key={step.key}
              role="listitem"
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center"
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
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="text-xs">
                    {step.label}
                    {state === "current" && " — current"}
                    {state === "done" && " — done"}
                  </span>
                </TooltipContent>
              </Tooltip>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px transition-colors",
                    variant === "compact" ? "w-3" : "w-6",
                    connectorTone,
                  )}
                  // visually decorative; tooltips carry the meaning
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
