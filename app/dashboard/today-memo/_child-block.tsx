"use client";

import { useState } from "react";
import { Camera, ChevronDown, X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MemoRow = {
  id: string;
  memo: string;
  time: string;
  tag: string | null;
};

export function ChildBlock({
  name,
  gender,
  memos,
  activityTitles,
}: {
  name: string;
  gender: "M" | "F" | null;
  memos: MemoRow[];
  activityTitles: string[];
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  const avatarTone =
    gender === "F"
      ? "bg-rose-100 text-rose-600"
      : "bg-emerald-100 text-emerald-700";

  // Mock AI 초안 생성: 활동 내역 + 원아 성향(임의) 반영
  function generateDraft() {
    setGenerating(true);
    setTimeout(() => {
      const activity = selectedActivity ?? activityTitles[0] ?? null;
      const traits = ["적극적으로", "차분하게", "친구와 함께", "스스로"];
      const trait = traits[name.length % traits.length];
      const draft = activity
        ? `${name}이(가) ${activity} 시간에 ${trait} 참여했어요.`
        : `${name}이(가) 오늘 ${trait} 활동에 참여했어요.`;
      setMemo(draft);
      setGenerating(false);
    }, 600);
  }

  function handleAdd() {
    if (memo.trim().length === 0) return;
    // TODO: 실제 저장 (server action)
    setMemo("");
    setHasPhoto(false);
    setSelectedActivity(null);
  }

  function attachPhotoAndRefine() {
    setHasPhoto(true);
    setGenerating(true);
    setTimeout(() => {
      setMemo((prev) =>
        prev
          ? `${prev} 사진 속에서 즐거워하는 표정이 인상적이었어요.`
          : `${name}의 활동 사진을 첨부했어요. 사진 분석 결과 즐거워하는 표정이 인상적이에요.`,
      );
      setGenerating(false);
    }, 600);
  }

  const canGenerate = activityTitles.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* 메인 row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 아바타 + 이름 */}
        <div className="flex w-24 shrink-0 items-center gap-2">
          <div
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold",
              avatarTone,
            )}
          >
            {name.charAt(0)}
          </div>
          <p className="truncate text-sm font-semibold text-slate-800">
            {name}
          </p>
        </div>

        {/* 입력 필드 + 추가 버튼 */}
        <div className="relative flex-1">
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={
              canGenerate
                ? "한 줄 메모 (Enter로 저장 · ✨ AI 초안 받기)"
                : "한 줄 메모 (Enter로 저장)"
            }
            className="h-10 w-full rounded-full bg-slate-50 pl-4 pr-16 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={memo.trim().length === 0}
            className={cn(
              "absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-full px-3 text-xs font-semibold transition-colors",
              memo.trim().length > 0
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-slate-200 text-slate-400",
            )}
          >
            추가
          </button>
        </div>

        {/* AI 초안 버튼 */}
        <button
          type="button"
          onClick={generateDraft}
          disabled={!canGenerate || generating}
          title={
            canGenerate
              ? "활동 내역 + 원아 성향을 반영해 초안 생성"
              : "오늘 등록된 활동이 없어요"
          }
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            canGenerate
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-slate-200 bg-slate-50 text-slate-400",
          )}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          AI 초안
        </button>

        {/* 사진 버튼 */}
        <button
          type="button"
          onClick={attachPhotoAndRefine}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            hasPhoto
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-200 text-slate-700 hover:bg-slate-50",
          )}
          title="사진 첨부 시 메모가 자동으로 수정돼요"
        >
          <Camera className="h-4 w-4" />
          {hasPhoto ? "사진 1" : "사진"}
        </button>

        {/* 오늘 N + 드롭다운 토글 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="오늘 메모 펼치기"
          className="flex h-10 items-center gap-1 rounded-full bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          오늘 {memos.length}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </div>

      {/* 활동 태그 칩 (선택형 — 어떤 활동에 해당하는 메모인지) */}
      {activityTitles.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2">
          <span className="text-[10px] font-medium text-slate-400">
            활동 내역
          </span>
          <div className="flex flex-wrap gap-1.5">
            {activityTitles.map((t) => {
              const active = selectedActivity === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setSelectedActivity((prev) => (prev === t ? null : t))
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                    active
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 펼친 메모 리스트 */}
      {open && memos.length > 0 && (
        <ul className="divide-y divide-emerald-100 border-t border-emerald-100 bg-emerald-50/50">
          {memos.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 px-6 py-2.5 text-sm"
            >
              <span className="w-12 shrink-0 text-xs text-slate-400">
                {m.time}
              </span>
              <span className="flex-1 text-slate-800">{m.memo}</span>
              {m.tag && (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {m.tag}
                </span>
              )}
              <button
                type="button"
                aria-label="삭제"
                className="text-slate-300 hover:text-rose-500"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && memos.length === 0 && (
        <p className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 text-xs text-slate-400">
          아직 오늘 작성된 메모가 없어요.
        </p>
      )}
    </div>
  );
}
