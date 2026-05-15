"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth-server";

const InputSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

export async function mergeThemes(input: { sourceId: string; targetId: string }) {
  const { sourceId, targetId } = InputSchema.parse(input);
  const { supabase, userId } = await requireUser();

  const { data: pair, error: fetchErr } = await supabase
    .from("themes")
    .select("id, name")
    .in("id", [sourceId, targetId]);
  if (fetchErr) throw new Error(fetchErr.message);
  if (!pair || pair.length !== 2) throw new Error("Themes not found");

  const source = pair.find((t) => t.id === sourceId);
  const target = pair.find((t) => t.id === targetId);
  if (!source || !target) throw new Error("Themes not found");

  const { error: rpcErr } = await supabase.rpc("merge_themes", {
    _source_id: sourceId,
    _target_id: targetId,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  await supabase.from("audit_log").insert({
    user_id: userId,
    action: "theme.merged",
    entity_type: "theme",
    entity_id: targetId,
    details: {
      merged_from: { id: source.id, name: source.name },
      merged_into: { id: target.id, name: target.name },
    },
  });

  return { ok: true as const };
}
