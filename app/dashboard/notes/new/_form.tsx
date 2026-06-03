"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronRight,
  Pencil,
  Send,
  Loader2,
  ChevronDown,
  Plus,
  X,
  HelpCircle,
  FileText,
  Wand2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateNoteDraftAction,
  saveNoteAction,
  refineNoteAction,
  addNoteParagraphAction,
  type RefineMode,
  type SourceMemo,
} from "./actions";

export type ChildOption = { id: string; name: string };

const PRESET_KEYWORDS = [
  "또래상호작용",
  "자율성",
  "도전",
  "진전",
  "표현력",
  "협동",
];

function isoMinusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Step = 1 | 2 | 3 | 4;

export function NoteForm({
  childOptions: children,
  qs,
  teacherId,
  classroomId,
}: {
  childOptions: ChildOption[];
  qs: string;
  teacherId: string;
  classroomId: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [childId, setChildId] = useState<string>(children[0]?.id ?? "");
  const [startDate, setStartDate] = useState(isoMinusDays(13));
  const [endDate, setEndDate] = useState(todayISO());
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [sources, setSources] = useState<SourceMemo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [refining, setRefining] = useState<RefineMode | null>(null);
  const [showSources, setShowSources] = useState(true);

  const childName = children.find((c) => c.id === childId)?.name ?? "";

  function toggleKeyword(k: string) {
    setSelectedKeywords((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function generate() {
    setError(null);
    setStep(2);
    startTransition(async () => {
      const result = await generateNoteDraftAction({
        childId,
        classroomId,
        startDate,
        endDate,
        activities: [],
        keywords: selectedKeywords,
      });
      if (result.ok) {
        setDraft(result.draft);
        setSources(result.sources);
        setStep(3);
      } else {
        setError(result.error);
        setStep(1);
      }
    });
  }

  function refine(mode: RefineMode) {
    if (!draft.trim()) return;
    setError(null);
    setRefining(mode);
    startTransition(async () => {
      const result = await refineNoteAction({ content: draft, mode });
      setRefining(null);
      if (result.ok) setDraft(result.draft);
      else setError(result.error);
    });
  }

  function addParagraph() {
    setError(null);
    startTransition(async () => {
      const result = await addNoteParagraphAction({ content: draft });
      if (result.ok) {
        setDraft((prev) => (prev ? `${prev}\n\n${result.paragraph}` : result.paragraph));
      } else setError(result.error);
    });
  }

  function removeLastParagraph() {
    setDraft((prev) => {
      const parts = prev.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      if (parts.length <= 1) return "";
      parts.pop();
      return parts.join("\n\n");
    });
  }

  function save(status: "draft" | "published") {
    setError(null);
    startTransition(async () => {
      const result = await saveNoteAction({
        childId,
        classroomId,
        teacherId,
        endDate,
        content: draft,
        status,
      });
      if (result.ok) {
        setStep(4);
        // 저장 후 알림장 목록 또는 임시보관함으로 보내기
        setTimeout(() => {
          router.push(status === "draft" ? `/dashboard/notes/drafts${qs}` : `/dashboard/notes${qs}`);
        }, 1200);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <section className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">알림장 &gt; 알림장 생성</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            알림장 생성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            기록을 기반으로 알림장 초안을 생성합니다.
          </p>
        </div>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          이용 가이드
        </button>
      </section>

      {/* 단계 표시 */}
      <StepIndicator step={step} />

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* 좌측 필터 */}
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          {/* 아이 선택 */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">아이 선택</p>
            <div className="relative">
              <select
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm focus:border-emerald-400 focus:outline-none"
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* 기간 선택 */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">기간 선택</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-emerald-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400">~</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayISO()}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {/* 반영 키워드 */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              반영 키워드 (선택)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_KEYWORDS.map((k) => {
                const active = selectedKeywords.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKeyword(k)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                    )}
                  >
                    {k}
                    {active && (
                      <X className="ml-0.5 inline-block h-2.5 w-2.5" />
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] text-slate-500 hover:border-emerald-300 hover:text-emerald-600"
              >
                <Plus className="h-3 w-3" />
                키워드 추가
              </button>
            </div>
          </div>

          {/* 초안 생성 버튼 */}
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className={cn(
              "mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
              isPending
                ? "bg-emerald-300 text-white"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {isPending && step === 2 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                초안 생성 중…
              </>
            ) : (
              <>
                초안 생성하기
                <Sparkles className="h-4 w-4" />
              </>
            )}
          </button>
        </section>

        {/* 우측 초안 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">알림장 초안</p>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              disabled={!draft}
              className={cn(
                "flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium",
                draft
                  ? editMode
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  : "border-slate-100 text-slate-300",
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editMode ? "보기" : "편집하기"}
            </button>
          </div>

          {!draft ? (
            <div className="grid h-72 place-items-center rounded-xl bg-slate-50 text-center">
              <div className="text-slate-400">
                <Sparkles className="mx-auto h-8 w-8 text-emerald-200" />
                <p className="mt-2 text-sm">
                  좌측에서 필터를 선택하고 <strong>초안 생성하기</strong>를 눌러주세요.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs">
                <p className="font-semibold text-slate-800">
                  {childName}의 알림장
                </p>
                <span className="text-slate-400">
                  {startDate} ~ {endDate}
                </span>
              </div>

              {editMode ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={14}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                />
              ) : (
                <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                  {draft}
                </div>
              )}

              {/* 표현 수정 AI + 추가/삭제 */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <p className="mr-1 text-[11px] font-medium text-slate-500">
                  <Wand2 className="mr-0.5 inline-block h-3 w-3" /> 표현 수정
                </p>
                <RefineBtn label="다듬기" mode="polish" busy={refining} onClick={refine} />
                <RefineBtn label="짧게" mode="shorten" busy={refining} onClick={refine} />
                <RefineBtn label="따뜻하게" mode="warmer" busy={refining} onClick={refine} />
                <RefineBtn label="공식적으로" mode="formal" busy={refining} onClick={refine} />
                <span className="mx-1.5 h-4 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={addParagraph}
                  disabled={isPending}
                  className="flex h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  AI로 단락 추가
                </button>
                <button
                  type="button"
                  onClick={removeLastParagraph}
                  className="flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                  마지막 단락 삭제
                </button>
              </div>

              <p className="mt-3 text-[11px] text-slate-400">
                * 위 내용은 기간 내{" "}
                <strong className="text-slate-600">{sources.length}건</strong>의 메모를
                기반으로 생성되었습니다.
              </p>

              {/* 생성 근거 표시 */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-slate-700"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    근거 기록 ({sources.length}건)
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      showSources ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
                {showSources && (
                  sources.length === 0 ? (
                    <p className="mt-2 text-[11px] text-slate-400">
                      기간 내 한 줄 메모가 없어요. 일반적인 톤으로 작성된 초안이에요.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {sources.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-slate-400">
                            {s.date}
                          </span>
                          <span className="flex-1 text-slate-700">{s.text}</span>
                          {s.tag && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              {s.tag}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* 하단 액션 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (step === 3) setStep(1);
          }}
          disabled={step !== 3}
          className={cn(
            "h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium",
            step === 3
              ? "text-slate-700 hover:bg-slate-50"
              : "text-slate-300",
          )}
        >
          이전 단계
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={!draft || isPending}
            className={cn(
              "h-10 rounded-lg border px-4 text-sm font-medium",
              draft && !isPending
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "border-slate-100 text-slate-300",
            )}
          >
            임시저장
          </button>
          <button
            type="button"
            onClick={() => save("published")}
            disabled={!draft || isPending}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors",
              draft && !isPending
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-emerald-300 text-white",
            )}
          >
            발송
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {step === 4 && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
          ✅ 저장되었어요. 알림장 목록으로 이동합니다…
        </div>
      )}

    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "정보 선택" },
    { n: 2, label: "초안 생성" },
    { n: 3, label: "검수 및 수정" },
    { n: 4, label: "저장 및 발송" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <li
            key={s.n}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1",
              active
                ? "bg-emerald-600 text-white ring-emerald-600"
                : done
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-white text-slate-500 ring-slate-200",
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold",
                active
                  ? "bg-white text-emerald-700"
                  : done
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500",
              )}
            >
              {s.n}
            </span>
            <span className="font-semibold">{s.label}</span>
            {i < steps.length - 1 && (
              <ChevronRight className="ml-1 h-3 w-3 text-slate-300" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RefineBtn({
  label,
  mode,
  busy,
  onClick,
}: {
  label: string;
  mode: RefineMode;
  busy: RefineMode | null;
  onClick: (m: RefineMode) => void;
}) {
  const active = busy === mode;
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      disabled={!!busy}
      className={cn(
        "flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
        active
          ? "border-emerald-400 bg-emerald-100 text-emerald-800"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        busy && !active ? "opacity-50" : "",
      )}
    >
      {active ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Wand2 className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

