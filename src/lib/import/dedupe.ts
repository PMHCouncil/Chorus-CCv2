"use client";

import { supabase } from "@/integrations/supabase/client";
import type { NewSubmissionInput } from "@/lib/submissions";

// 90 days is wide enough to catch genuine resubmissions of the same
// feedback during a consultation cycle without scanning the whole table.
const LOOKBACK_DAYS = 90;
const HASH_CONTENT_PREFIX = 500;

function normaliseEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function normaliseContent(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, HASH_CONTENT_PREFIX);
}

export function hashRow(input: Pick<NewSubmissionInput, "content" | "submitter_email">): string {
  return `${normaliseEmail(input.submitter_email)}::${normaliseContent(input.content)}`;
}

export interface DuplicateCheckResult {
  existingHashes: Set<string>;
  scanned: number;
}

export async function fetchExistingDuplicateHashes(
  inputs: Pick<NewSubmissionInput, "content" | "submitter_email">[],
): Promise<DuplicateCheckResult> {
  if (inputs.length === 0) {
    return { existingHashes: new Set(), scanned: 0 };
  }

  const emails = Array.from(
    new Set(
      inputs
        .map((i) => normaliseEmail(i.submitter_email))
        .filter((e) => e.length > 0),
    ),
  );

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Two passes:
  //   1) all recent submissions (covers anonymous content matches),
  //   2) submissions from matching emails (covers older but same-sender hits).
  // We cap each query so very large tenants don't blow up the request.
  const recent = await supabase
    .from("submissions")
    .select("submitter_email, content")
    .gte("submitted_at", since)
    .is("archived_at", null)
    .limit(2000);
  if (recent.error) throw recent.error;

  const byEmail = emails.length > 0
    ? await supabase
        .from("submissions")
        .select("submitter_email, content")
        .in("submitter_email", emails)
        .is("archived_at", null)
        .limit(2000)
    : { data: [] as { submitter_email: string | null; content: string }[], error: null };
  if (byEmail.error) throw byEmail.error;

  const hashes = new Set<string>();
  const rows = [...(recent.data ?? []), ...(byEmail.data ?? [])];
  for (const row of rows) {
    hashes.add(
      hashRow({
        content: row.content as string,
        submitter_email: (row.submitter_email as string | null) ?? undefined,
      }),
    );
  }
  return { existingHashes: hashes, scanned: rows.length };
}
