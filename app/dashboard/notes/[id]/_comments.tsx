"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, MessageSquare } from "lucide-react";
import { addNoteCommentAction, deleteNoteCommentAction } from "./actions";

export type CommentItem = {
  id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function CommentsSection({
  noteId,
  comments,
  viewer,
}: {
  noteId: string;
  comments: CommentItem[];
  viewer: { id: string; name: string; role: string };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addNoteCommentAction({
        noteId,
        authorId: viewer.id,
        authorName: viewer.name,
        content: text,
      });
      if (result.ok) {
        setText("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove(commentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteNoteCommentAction({ noteId, commentId });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-bold text-slate-900">댓글</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {comments.length}
        </span>
      </div>

      {comments.length === 0 ? (
        <p className="rounded-xl bg-slate-50 py-8 text-center text-xs text-slate-400">
          아직 댓글이 없습니다. 첫 번째 댓글을 남겨주세요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {comments.map((c) => {
            const mine = c.author_id === viewer.id;
            return (
              <li key={c.id} className="flex items-start gap-3 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {c.author_name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800">{c.author_name}</p>
                    <span className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</span>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={isPending}
                        className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-rose-500 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {c.content}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
            {viewer.name.slice(0, 1)}
          </span>
          <p className="text-xs font-medium text-slate-700">{viewer.name}</p>
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
            {viewer.role === "teacher"
              ? "교사"
              : viewer.role === "parent"
                ? "학부모"
                : viewer.role === "director"
                  ? "원장"
                  : "관리자"}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="댓글을 남겨주세요"
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">{text.length} / 3000</span>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !text.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            <Send className="h-3.5 w-3.5" />
            전송
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-500">{error}</p>}
      </div>
    </section>
  );
}
