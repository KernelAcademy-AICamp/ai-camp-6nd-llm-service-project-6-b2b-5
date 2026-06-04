"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TEACHER_ID } from "@/lib/teacher-context";

export async function saveActivityRecordAction(args: {
  sessionId: string;
  childId: string;
  aiContent: string;
  updatedBy?: string;
}): Promise<
  | { ok: true; aiGeneratedAt: string }
  | { ok: false; error: string }
> {
  try {
    if (!args.sessionId || !args.childId) {
      return { ok: false, error: "세션 또는 원아 정보가 없습니다." };
    }
    if (!args.aiContent.trim()) {
      return { ok: false, error: "저장할 내용이 비어있습니다." };
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const userId = args.updatedBy ?? DEFAULT_TEACHER_ID;

    const { error } = await supabase
      .from("activity_records")
      .upsert(
        {
          session_id: args.sessionId,
          child_id: args.childId,
          ai_content: args.aiContent,
          ai_generated_at: now,
          updated_by: userId,
        },
        { onConflict: "session_id,child_id" },
      );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/dashboard/activity-records");
    return { ok: true, aiGeneratedAt: now };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "저장 실패",
    };
  }
}
