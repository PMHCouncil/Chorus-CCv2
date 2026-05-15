"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SubmissionDetailBody } from "@/components/submissions/submission-detail-sheet";

export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <Link
          href="/app/inbox"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Link>
      </div>

      <SubmissionDetailBody submissionId={id} layout="page" />
    </div>
  );
}
