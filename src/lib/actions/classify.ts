"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth-server";

const SENTIMENTS = ["Supportive", "Neutral", "Concerned", "Opposing"] as const;
const DIVISIONS = [
  "Corporate Services",
  "Community Planning & Environment",
  "Community Infrastructure",
  "Community Utilities",
  "Multiple",
  "N/A",
] as const;
const FEEDBACK_TYPES = [
  "Placement",
  "Role design",
  "Transition concern",
  "Principles",
  "FAQ-able question",
  "Other",
] as const;
const PRINCIPLE_TAGS = [
  "Customer focus",
  "Business sustainability",
  "Alignment with strategy",
  "Flexibility agility and balance",
  "Improving efficiency and reducing duplication",
  "Reducing risk",
  "Maintaining workforce engagement",
] as const;

const toArray = (v: unknown): unknown[] => {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
};

const ClassifySchema = z.object({
  sentiment: z.enum(SENTIMENTS).nullable().optional(),
  divisions: z.preprocess(toArray, z.array(z.enum(DIVISIONS))).default([]),
  feedback_types: z.preprocess(toArray, z.array(z.enum(FEEDBACK_TYPES))).default([]),
  principle_tags: z.preprocess(toArray, z.array(z.enum(PRINCIPLE_TAGS))).default([]),
  roles_affected: z.preprocess(toArray, z.array(z.string().min(1).max(200))).default([]),
  themes: z.array(z.string().min(1).max(120)).max(5).optional().default([]),
  summary: z.string().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  submitter_name: z.string().trim().min(1).max(200).nullable().optional(),
  submitter_email: z.string().trim().email().max(255).nullable().optional(),
  submitter_role: z.string().trim().min(1).max(200).nullable().optional(),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response did not contain JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

const InputSchema = z.object({ submissionId: z.string().uuid() });

export async function classifySubmission(input: { submissionId: string }) {
  const { submissionId } = InputSchema.parse(input);
  const { supabase, userId } = await requireUser();

  const { data: submission, error: subErr } = await supabase
    .from("submissions")
    .select("id, content, submitter_role, submitter_name, submitter_email, source, raw_data")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!submission) throw new Error("Submission not found");

  const rawData = (submission.raw_data ?? {}) as Record<string, unknown>;
  const isAnonymous =
    rawData.anonymous === true || (submission.source as string) === "anonymous";

  const { data: settings, error: settingsErr } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["classifier_system_prompt", "classifier_model"]);
  if (settingsErr) throw new Error(settingsErr.message);

  const settingsMap = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  const baseSystemPrompt = (settingsMap.classifier_system_prompt as string | undefined) ?? "";
  const DEFAULT_MODEL = "claude-sonnet-4-6";
  const configuredModel =
    (settingsMap.classifier_model as string | undefined) || process.env.ANTHROPIC_MODEL;
  // Anthropic API only accepts claude-* models. Older seed data (and a stale
  // ANTHROPIC_MODEL env var) can leave a non-Anthropic id here, in which
  // case the request would 4xx and the action would throw an opaque
  // "Server Components render" error in production.
  const model =
    configuredModel && /^claude-/.test(configuredModel.replace(/^anthropic\//, ""))
      ? configuredModel
      : DEFAULT_MODEL;

  const missingSenderFields = isAnonymous
    ? []
    : ([
        !submission.submitter_name ? "submitter_name" : null,
        !submission.submitter_email ? "submitter_email" : null,
        !submission.submitter_role ? "submitter_role" : null,
      ].filter(Boolean) as string[]);

  const senderExtractionInstruction =
    missingSenderFields.length > 0
      ? `\n\nSENDER EXTRACTION: The submission record is missing these fields: ${missingSenderFields.join(", ")}. Inspect the submission content for sender details (e.g. an email "From:" header, signature block, "Regards, <name>", a job title, or an email address embedded in the body). If you can confidently identify any of these from the content, include them in your JSON response as: submitter_name (string), submitter_email (valid email string), submitter_role (job title or division string). Only include a field if you are confident it represents the submitter — not someone they quote or mention. Omit or return null when unknown.`
      : "";

  const systemPrompt = `${baseSystemPrompt}${senderExtractionInstruction}`;

  const userMessage = [
    submission.submitter_role ? `Submitter role: ${submission.submitter_role}` : null,
    submission.submitter_name ? `Submitter name: ${submission.submitter_name}` : null,
    submission.submitter_email ? `Submitter email: ${submission.submitter_email}` : null,
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
      max_tokens: 1024,
      system: `${systemPrompt}\n\nReturn ONLY a single JSON object matching the documented schema. No prose, no markdown.`,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    if (aiRes.status === 401)
      throw new Error("Invalid ANTHROPIC_API_KEY. Check the value in env.");
    if (aiRes.status === 429)
      throw new Error("Anthropic rate limit reached. Try again shortly.");
    throw new Error(`Anthropic error ${aiRes.status}: ${txt.slice(0, 200)}`);
  }
  const aiJson = (await aiRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const raw = aiJson.content?.find((c) => c.type === "text")?.text ?? "";

  const parsed = ClassifySchema.parse(extractJson(raw));

  // Upsert classification (one per submission)
  const { data: existing } = await supabase
    .from("classifications")
    .select("id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const classificationPayload = {
    submission_id: submissionId,
    sentiment: parsed.sentiment ?? null,
    divisions: parsed.divisions ?? [],
    feedback_types: parsed.feedback_types ?? [],
    principle_tags: parsed.principle_tags ?? [],
    roles_affected: (parsed.roles_affected ?? []).map((r) => r.trim()).filter(Boolean),
    ai_confidence: parsed.confidence,
    human_verified: false,
  };

  if (existing) {
    const { error } = await supabase
      .from("classifications")
      .update(classificationPayload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("classifications").insert(classificationPayload);
    if (error) throw new Error(error.message);
  }

  // Themes: ensure rows exist, link them
  const themeNames = (parsed.themes ?? []).map((t) => t.trim()).filter(Boolean);
  const themeIds: string[] = [];
  for (const name of themeNames) {
    const { data: existingTheme } = await supabase
      .from("themes")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    if (existingTheme) {
      themeIds.push(existingTheme.id);
    } else {
      const { data: newTheme, error: themeErr } = await supabase
        .from("themes")
        .insert({ name, summary: parsed.summary ?? null })
        .select("id")
        .single();
      if (themeErr) throw new Error(themeErr.message);
      themeIds.push(newTheme.id);
    }
  }

  await supabase.from("submission_themes").delete().eq("submission_id", submissionId);
  if (themeIds.length > 0) {
    const links = themeIds.map((tid) => ({
      submission_id: submissionId,
      theme_id: tid,
      confidence: parsed.confidence,
    }));
    await supabase.from("submission_themes").insert(links);
  }

  // Backfill sender details on the submission if missing and AI extracted them.
  const senderUpdate: Record<string, string> = {};
  if (!isAnonymous) {
    if (!submission.submitter_name && parsed.submitter_name)
      senderUpdate.submitter_name = parsed.submitter_name;
    if (!submission.submitter_email && parsed.submitter_email)
      senderUpdate.submitter_email = parsed.submitter_email;
    if (!submission.submitter_role && parsed.submitter_role)
      senderUpdate.submitter_role = parsed.submitter_role;
  }
  const enrichedFields = Object.keys(senderUpdate);

  let nextRawData: Record<string, unknown> | undefined;
  if (enrichedFields.length > 0) {
    const prevEnriched = Array.isArray(rawData.enriched_sender_fields)
      ? (rawData.enriched_sender_fields as string[])
      : [];
    const prevValues =
      rawData.enriched_sender_values && typeof rawData.enriched_sender_values === "object"
        ? (rawData.enriched_sender_values as Record<string, string>)
        : {};
    nextRawData = {
      ...rawData,
      enriched_sender_fields: Array.from(new Set([...prevEnriched, ...enrichedFields])),
      enriched_sender_values: { ...prevValues, ...senderUpdate },
    };
  }

  await supabase
    .from("submissions")
    .update({
      status: themeIds.length > 0 ? "themed" : "classified",
      ...senderUpdate,
      ...(nextRawData ? { raw_data: nextRawData as never } : {}),
    })
    .eq("id", submissionId);

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "submission.classified",
    entity_type: "submission",
    entity_id: submissionId,
    details: {
      model: anthropicModel,
      sentiment: parsed.sentiment,
      divisions: parsed.divisions,
      feedback_types: parsed.feedback_types,
      principle_tags: parsed.principle_tags,
      themes: themeNames,
      confidence: parsed.confidence,
    },
  });

  if (enrichedFields.length > 0) {
    await supabase.from("audit_log").insert({
      user_id: userId,
      action: "sender_enriched",
      entity_type: "submission",
      entity_id: submissionId,
      details: {
        model: anthropicModel,
        fields_filled: enrichedFields,
        values: senderUpdate,
        source: "ai_content_extraction",
      },
    });
  }

  return {
    classification: classificationPayload,
    themes: themeNames,
    summary: parsed.summary ?? null,
  };
}
