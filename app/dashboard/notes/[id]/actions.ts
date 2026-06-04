"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addNoteCommentAction(args: {
  noteId: string;
  authorId: string;
  authorName: string;
  content: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const content = args.content.trim();
    if (!content) return { ok: false, error: "댓글 내용을 입력해주세요." };

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("note_comments")
      .insert({
        note_id: args.noteId,
        author_id: args.authorId,
        author_name: args.authorName,
        content,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/notes/${args.noteId}`);
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "댓글 등록 실패" };
  }
}

export async function deleteNoteCommentAction(args: {
  noteId: string;
  commentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("note_comments")
      .delete()
      .eq("id", args.commentId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/notes/${args.noteId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "댓글 삭제 실패" };
  }
}
