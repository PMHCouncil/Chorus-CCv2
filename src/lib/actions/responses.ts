"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth-server";

const DEFAULT_RESPONDER_PROMPT = `You are drafting a personal acknowledgement reply on behalf of the Project Director for organisational change feedback received from a council staff member.

Tone: warm, respectful, professional, plain English. No corporate jargon. Australian spelling. 120-220 words.

Structure:
1. Open with a sincere thank-you addressed to the submitter by first name (or "Hi there" if name unknown).
2. Briefly reflect back the SPECIFIC concerns / themes they raised (do not paraphrase generically).
3. Note how the feedback will be used (informs decisions, themes shared with execs).
4. Acknowledge any concerns honestly without making promises that can't be kept.
5. Close with an invitation to follow up via the project mailbox if they want to add more.

Do NOT invent decisions, dates, role outcomes, or commitments. Do NOT include the subject line or email signature block.

Return ONLY the body text of the reply. No preamble, no markdown, no JSON.`;

const InputSchema = z.object({ submissionId: z.string().uuid() });

export async function draftResponse(input: { submissionId: string }) {
  const { submissionId } = InputSchema.parse(input);
  const { supabase, userId } = await requireUser();

  const { data: submission, error: subErr } = await supabase
    .from("submissions")
    .select("id, content, submitter_name, submitter_role, submitter_email")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!submission) throw new Error("Submission not found");

  const { data: classification } = await supabase
    .from("classifications")
    .select("sentiment, divisions, feedback_types, principle_tags, roles_affected")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const { data: themeLinks } = await supabase
    .from("submission_themes")
    .select("themes(name, summary)")
    .eq("submission_id", submissionId);

  const themeNames =
    themeLinks
      ?.map((t) => (t.themes as { name?: string } | null)?.name)
      .filter((n): n is string => !!n) ?? [];

  const { data: settings } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["responder_system_prompt", "classifier_model"]);
  const settingsMap = Object.fromEntries(
    (settings ?? []).map((r) => [r.key, r.value]),
  );
  const systemPrompt =
    (settingsMap.responder_system_prompt as string | undefined)?.trim() ||
    DEFAULT_RESPONDER_PROMPT;
  const model =
    (settingsMap.classifier_model as string | undefined) ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-6";

  const joinList = (xs: string[] | null | undefined) =>
    xs && xs.length > 0 ? xs.join(", ") : null;

  const userMessage = [
    submission.submitter_name
      ? `Submitter name: ${submission.submitter_name}`
      : "Submitter name: (anonymous)",
    submission.submitter_role ? `Submitter role: ${submission.submitter_role}` : null,
    classification?.sentiment ? `Sentiment: ${classification.sentiment}` : null,
    joinList(classification?.feedback_types)
      ? `Feedback types: ${joinList(classification?.feedback_types)}`
      : null,
    joinList(classification?.divisions)
      ? `Divisions: ${joinList(classification?.divisions)}`
      : null,
    joinList(classification?.principle_tags)
      ? `Principles: ${joinList(classification?.principle_tags)}`
      : null,
    joinList(classification?.roles_affected)
      ? `Roles affected: ${joinList(classification?.roles_affected)}`
      : null,
    themeNames.length ? `Themes raised: ${themeNames.join(", ")}` : null,
    "",
    "Submission content:",
    submission.content,
  ]
    .filter(Boolean)
    .join("\n");

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set on the server. Add it to your .env.local (and to Amplify env vars in production).",
    );
  }
  const anthropicModel = model.replace(/^anthropic\//, "");

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!aiRes.ok) {
    const txt = await aiRes.text();
    if (aiRes.status === 401) throw new Error("Invalid ANTHROPIC_API_KEY.");
    if (aiRes.status === 429)
      throw new Error("Anthropic rate limit reached. Try again shortly.");
    throw new Error(`Anthropic error ${aiRes.status}: ${txt.slice(0, 200)}`);
  }
  const aiJson = (await aiRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const draftText = aiJson.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

  if (!draftText) throw new Error("AI returned an empty draft. Try again.");

  const { data: existing } = await supabase
    .from("responses")
    .select("id, status")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let responseId: string;
  if (existing && existing.status === "draft") {
    const { data: updated, error } = await supabase
      .from("responses")
      .update({ draft_text: draftText, reviewer: userId })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    responseId = updated.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("responses")
      .insert({
        submission_id: submissionId,
        draft_text: draftText,
        reviewer: userId,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    responseId = inserted.id;
  }

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "response.drafted",
    entity_type: "response",
    entity_id: responseId,
    details: { submission_id: submissionId, model: anthropicModel, length: draftText.length },
  });

  return { id: responseId, draft_text: draftText };
}
