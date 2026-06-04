"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deleteObservationAction(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("observation_journals")
      .delete()
      .eq("id", args.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/observations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "삭제 실패" };
  }
}

export async function updateObservationMetaAction(args: {
  id: string;
  childId: string;
  date: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!args.childId) return { ok: false, error: "원아를 선택해주세요." };
    if (!args.date) return { ok: false, error: "날짜를 입력해주세요." };
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("observation_journals")
      .update({ child_id: args.childId, date: args.date })
      .eq("id", args.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/observations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "수정 실패" };
  }
}
