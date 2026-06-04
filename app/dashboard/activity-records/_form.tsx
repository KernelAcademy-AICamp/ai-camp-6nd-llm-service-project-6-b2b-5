"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  Check,
  Sparkles,
  Loader2,
  ArrowLeft,
  ImageIcon,
  Pencil,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateChildActivityDraftAction,
  generateChildSummariesAction,
} from "../activities/new/actions";
import { saveActivityRecordAction } from "./actions";
import type { ChildOption } from "../activities/new/_form";

type ChildPhoto = { url: string; order_num: number };

export function ChildActivityRecordForm({
  childOptions: children,
  classroomName,
  backHref,
  todayMemoHref,
  dashboardHref,
  sessionId,
  sessionTitle,
  sessionAiContent,
  sessionKeywords,
  childPhotos,
}: {
  childOptions: ChildOption[];
  classroomName: string;
  backHref: string;
  todayMemoHref: string;
  dashboardHref: string;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionAiContent: string | null;
  sessionKeywords: string[];
  childPhotos: Record<string, ChildPhoto[]>;
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [teacherMemos, setTeacherMemos] = useState<Record<string, string>>({});
  const [aiContents, setAiContents] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [savingChildId, setSavingChildId] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();
  const [isDraftPending, startDraftTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();

  const childrenWithPhotosCount = useMemo(
    () =>
      children.filter((c) => (childPhotos[c.id]?.length ?? 0) > 0).length,
    [children, childPhotos],
  );

  useEffect(() => {
    if (selectedChildId && children.some((c) => c.id === selectedChildId)) return;
    if (children.length === 0) {
      setSelectedChildId(null);
      return;
    }
    const firstWithPhotos = children.find(
      (c) => (childPhotos[c.id]?.length ?? 0) > 0,
    );
    setSelectedChildId((firstWithPhotos ?? children[0]).id);
  }, [children, childPhotos, selectedChildId]);

  const today = new Date();
  const dateLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  function generateAllSummaries() {
    if (!sessionAiContent || !sessionTitle) {
      setError(
        "매일 활동 기록(1단계)이 없습니다. 1단계에서 활동 분석을 먼저 저장해 주세요.",
      );
      return;
    }
    if (children.length === 0) return;
    setError(null);
    const childPayload = children.map((c) => ({
      name: c.name,
      photoCount: childPhotos[c.id]?.length ?? 0,
      clusterDescription: null,
    }));
    startBulkTransition(async () => {
      const result = await generateChildSummariesAction({
        classroomName,
        activityTitle: sessionTitle,
        activityDescription: sessionAiContent,
        keywords: sessionKeywords,
        children: childPayload,
      });
      if (result.ok) {
        setAiContents((prev) => {
          const next = { ...prev };
          children.forEach((c, i) => {
            const s = result.summaries[i];
            if (s) next[c.id] = s.trim();
          });
          return next;
        });
        const ok = result.summaries.filter((s) => s && s.trim()).length;
        setSaveToast(`${ok}명 원아 AI 내용 일괄 생성 완료`);
        window.setTimeout(() => setSaveToast(null), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  function saveDraftForChild(childId: string) {
    const child = children.find((c) => c.id === childId);
    if (!child) return;
    if (!sessionId) {
      setError(
        "오늘 날짜의 활동 세션이 DB 에 없어서 저장할 수 없습니다. (mock 모드 또는 1단계 미저장)",
      );
      return;
    }
    const aiContent = (aiContents[childId] ?? "").trim();
    if (!aiContent) {
      setError("저장할 내용이 비어있습니다. AI 초안을 생성하거나 직접 입력해주세요.");
      return;
    }
    setError(null);
    setSavingChildId(childId);
    startSaveTransition(async () => {
      const result = await saveActivityRecordAction({
        sessionId,
        childId,
        aiContent,
      });
      setSavingChildId(null);
      if (result.ok) {
        setSavedAt((prev) => ({ ...prev, [childId]: result.aiGeneratedAt }));
        setSaveToast(`${child.name} 저장 완료`);
        window.setTimeout(() => setSaveToast(null), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  function generateDraftForChild(childId: string) {
    const child = children.find((c) => c.id === childId);
    if (!child) return;
    if (!sessionAiContent || !sessionTitle) {
      setError(
        "매일 활동 기록(1단계)이 없습니다. 1단계에서 활동 분석을 먼저 저장해 주세요.",
      );
      return;
    }
    setError(null);
    setPendingChildId(childId);
    const photoUrls = (childPhotos[childId] ?? [])
      .slice()
      .sort((a, b) => a.order_num - b.order_num)
      .slice(0, 2)
      .map((p) => p.url);
    startDraftTransition(async () => {
      const result = await generateChildActivityDraftAction({
        childName: child.name,
        teacherMemo: teacherMemos[childId] ?? "",
        sessionTitle,
        sessionAiContent,
        sessionKeywords,
        photoUrls,
      });
      setPendingChildId(null);
      if (result.ok) {
        setAiContents((prev) => ({ ...prev, [childId]: result.draft }));
        setSaveToast(`${child.name} 초안 생성 완료`);
        window.setTimeout(() => setSaveToast(null), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  const filledCount = Object.values(aiContents).filter(
    (v) => v.trim().length > 0,
  ).length;
  const hasSession = !!sessionAiContent && !!sessionTitle;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <section>
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"
            aria-label="뒤로"
          >
            <ChevronLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            원아 활동 기록
          </h1>
        </div>
        <p className="ml-10 mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {dateLabel} · {classroomName} · 원아별 활동 사진·교사 메모·AI 생성 내용
        </p>
      </section>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      {/* 활동 요약 (DB 의 activity_records.session_ai_content 에서 가져옴) */}
      {hasSession ? (
        <section className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-emerald-700/80">
                오늘의 활동
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {sessionTitle}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {sessionKeywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                  >
                    {k}
                  </span>
                ))}
                <span className="ml-1 text-[11px] text-emerald-700/80">
                  사진 매칭된 원아 {childrenWithPhotosCount}명
                </span>
              </div>
              {sessionAiContent && (
                <div className="mt-2.5 whitespace-pre-line rounded-lg border-l-4 border-emerald-300 bg-white/80 p-2.5 text-xs leading-relaxed text-slate-700">
                  {sessionAiContent}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
          <p className="text-xs text-slate-500">
            매일 활동 기록(1단계)이 없습니다.{" "}
            <Link
              href={backHref}
              className="font-medium text-emerald-700 underline"
            >
              1단계
            </Link>
            에서 활동 분석을 저장하거나, URL 에 <code className="rounded bg-slate-100 px-1">?mock=1</code> 을 붙여 mock 데이터를 확인하세요.
          </p>
        </section>
      )}

      {/* 원아별 활동 기록 — 칩 선택 + 상세 패널 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">원아별 활동 기록</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              아이를 선택하여 기질·활동 사진·교사 메모·AI 생성 내용을 작성·수정하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={generateAllSummaries}
            disabled={isBulkPending || !hasSession || children.length === 0}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              isBulkPending || !hasSession || children.length === 0
                ? "bg-slate-100 text-slate-400"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {isBulkPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                일괄 생성 중…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                전체 AI 일괄 생성
              </>
            )}
          </button>
        </div>

        <p className="mb-3 text-[11px] text-slate-500">
          작성 완료{" "}
          <strong className="text-slate-900">{filledCount}</strong> / 전체{" "}
          {children.length}
        </p>

        {children.length === 0 ? (
          <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
            등록된 원아가 없어요.
          </p>
        ) : (
          <>
            {/* 원아 칩 */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {children.map((c) => (
                <ChildChip
                  key={c.id}
                  child={c}
                  isSelected={selectedChildId === c.id}
                  isMatched={(childPhotos[c.id]?.length ?? 0) > 0}
                  isDone={(aiContents[c.id] ?? "").trim().length > 0}
                  onClick={() => setSelectedChildId(c.id)}
                />
              ))}
            </div>

            {/* 선택된 원아 상세 */}
            {(() => {
              const selected = children.find((c) => c.id === selectedChildId);
              if (!selected) {
                return (
                  <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                    위에서 원아를 선택해주세요.
                  </p>
                );
              }
              const photos = (childPhotos[selected.id] ?? [])
                .slice()
                .sort((a, b) => a.order_num - b.order_num);
              const memoValue = teacherMemos[selected.id] ?? "";
              const aiValue = aiContents[selected.id] ?? "";
              const isThisChildPending =
                isDraftPending && pendingChildId === selected.id;
              const isThisChildSaving =
                isSavePending && savingChildId === selected.id;
              const lastSavedAt = savedAt[selected.id];
              const canSave =
                !!sessionId && aiValue.trim().length > 0 && !isThisChildSaving;
              return (
                <div className="space-y-3">

                  <div className="space-y-3">
                    {/* 활동 사진 */}
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <ImageIcon className="h-3.5 w-3.5" />
                        활동 사진
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {photos.length === 0 ? (
                          <p className="text-[11px] text-slate-400">
                            매칭된 사진이 없습니다.
                          </p>
                        ) : (
                          photos.map((p, i) => (
                            <div
                              key={`${p.url}-${i}`}
                              className="h-16 w-16 overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-white"
                              title={`사진${i + 1}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.url}
                                alt={`사진${i + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 교사 메모 */}
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                        교사 메모
                      </p>
                      <textarea
                        value={memoValue}
                        onChange={(e) =>
                          setTeacherMemos((prev) => ({
                            ...prev,
                            [selected.id]: e.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="아이의 활동 중 관찰한 내용을 적어주세요."
                        className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    {/* {원아 이름}의 활동 분석 */}
                    <div className="rounded-xl bg-slate-100 p-3 shadow-sm ring-2 ring-slate-300">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                          <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                          {selected.name}의 활동 분석
                        </p>
                        <button
                          type="button"
                          onClick={() => generateDraftForChild(selected.id)}
                          disabled={
                            isThisChildPending || isBulkPending || !hasSession
                          }
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                            isThisChildPending || isBulkPending || !hasSession
                              ? "bg-slate-100 text-slate-400"
                              : "bg-emerald-600 text-white hover:bg-emerald-700",
                          )}
                        >
                          {isThisChildPending ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              생성 중…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              AI 초안 생성
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={aiValue}
                        onChange={(e) =>
                          setAiContents((prev) => ({
                            ...prev,
                            [selected.id]: e.target.value,
                          }))
                        }
                        rows={6}
                        placeholder="AI 초안 생성 버튼을 클릭하여 작성하세요."
                        className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500">
                          {lastSavedAt
                            ? `마지막 저장 · ${new Date(lastSavedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}`
                            : sessionId
                              ? "AI 초안을 검토·편집한 후 저장하세요."
                              : "오늘 DB 세션이 없어 저장할 수 없어요."}
                        </p>
                        <button
                          type="button"
                          onClick={() => saveDraftForChild(selected.id)}
                          disabled={!canSave}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                            canSave
                              ? "bg-slate-900 text-white hover:bg-slate-700"
                              : "bg-slate-100 text-slate-400",
                          )}
                        >
                          {isThisChildSaving ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              저장 중…
                            </>
                          ) : (
                            <>
                              <Save className="h-3 w-3" />
                              저장
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </section>

      {/* 단계 네비게이션 */}
      <section className="flex items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          이전 단계
        </Link>
        <Link
          href={dashboardHref}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          대시보드로
        </Link>
      </section>

      {/* 하단 안내 */}
      <section className="text-xs text-slate-500">
        <p>
          저장된 원아별 메모는{" "}
          <Link
            href={todayMemoHref}
            className="font-medium text-emerald-600 underline"
          >
            한줄기록
          </Link>
          과 알림장·관찰일지 작성에 자동으로 활용돼요.
        </p>
      </section>

      {saveToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {saveToast}
        </div>
      )}
    </div>
  );
}

function ChildChip({
  child,
  isSelected,
  isMatched,
  isDone,
  onClick,
}: {
  child: ChildOption;
  isSelected: boolean;
  isMatched: boolean;
  isDone: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        isSelected
          ? "bg-emerald-600 text-white shadow"
          : isMatched
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
            : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
          isSelected
            ? "bg-white/25 text-white"
            : child.gender === "F"
              ? "bg-rose-100 text-rose-600"
              : "bg-emerald-100 text-emerald-700",
        )}
      >
        {child.name.charAt(0)}
      </span>
      {child.name}
      {isDone && (
        <Check
          className={cn(
            "h-3 w-3",
            isSelected ? "text-white" : "text-emerald-600",
          )}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
