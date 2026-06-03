"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  Upload,
  Check,
  X,
  Sparkles,
  Loader2,
  Tag,
  Users,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  analyzePhotosAction,
  clusterPhotosAction,
  generateChildSummariesAction,
  type PhotoAnalysis,
} from "./actions";
import {
  DAILY_ACTIVITY_STORAGE_KEY,
  loadHandoff,
  type DailyActivityHandoff,
} from "@/lib/activity-handoff";

export type ChildOption = {
  id: string;
  name: string;
  gender: "M" | "F" | null;
  privacy_agreed_at: string | null;
  status: "active" | "inactive" | "graduated";
};

type UploadedImage = {
  id: string;
  dataUrl: string;
  name: string;
};

type PhotoClusterUI = {
  description: string;
  photoIds: string[];
};

export type StepNumber = 1 | 2;

const STEP_META: Record<StepNumber, { label: string; sub: string }> = {
  1: { label: "매일 활동 기록", sub: "사진 업로드 + AI 분석 + 사진 분류" },
  2: { label: "원아 활동 기록", sub: "원아별 한 줄 메모" },
};

const MAX_IMAGE_DIM = 1280;
const IMAGE_QUALITY = 0.82;

async function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(
          MAX_IMAGE_DIM / img.width,
          MAX_IMAGE_DIM / img.height,
          1,
        );
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 컨텍스트 실패"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error("이미지 로드 실패"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

export function ActivityRecordForm({
  childOptions: children,
  classroomName,
  todayMemoHref,
  backHref,
  initialStep,
}: {
  childOptions: ChildOption[];
  classroomName: string;
  todayMemoHref: string;
  backHref: string;
  initialStep: StepNumber;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<StepNumber>(initialStep);

  // step 1 — 사진 + AI 분석
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 사진 분류 (팝업) — 그룹핑 + 매칭
  const [clusters, setClusters] = useState<PhotoClusterUI[]>([]);
  const [clusterMatches, setClusterMatches] = useState<Record<string, string>>(
    {},
  );
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [showClusterModal, setShowClusterModal] = useState(false);

  // step 3 — 원아별 한 줄 메모 (전체 리스트 인라인 편집)
  const [savedMemos, setSavedMemos] = useState<Record<string, string>>({});
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // 공용
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydratedRef = useRef(false);

  // 마운트 시 sessionStorage 핸드오프 복원 (단계 직접 진입 시 유용)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const handoff = loadHandoff();
    if (!handoff) return;
    const restoredImages: UploadedImage[] = [];
    const restoredClusters: PhotoClusterUI[] = [];
    const restoredMatches: Record<string, string> = {};
    for (const cluster of handoff.clusters) {
      const photoIds: string[] = [];
      for (const photo of cluster.photos) {
        restoredImages.push({
          id: photo.id,
          dataUrl: photo.dataUrl,
          name: photo.id,
        });
        photoIds.push(photo.id);
      }
      restoredClusters.push({ description: cluster.description, photoIds });
      if (cluster.childId) restoredMatches[cluster.description] = cluster.childId;
    }
    const uniqueImages = Array.from(
      new Map(restoredImages.map((p) => [p.id, p])).values(),
    );
    if (uniqueImages.length > 0) {
      setImages(uniqueImages);
      setSelectedPhotoIds(new Set(uniqueImages.map((p) => p.id)));
    }
    if (restoredClusters.length > 0) setClusters(restoredClusters);
    if (Object.keys(restoredMatches).length > 0) setClusterMatches(restoredMatches);
    if (handoff.analysis) setAnalysis(handoff.analysis);
  }, []);

  const today = new Date();
  const dateLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  function runAnalysis(allImages: UploadedImage[]) {
    if (allImages.length === 0) return;
    setError(null);
    const dataUrls = allImages.map((p) => p.dataUrl);
    startTransition(async () => {
      const [analysisResult, clusterResult] = await Promise.all([
        analyzePhotosAction({ imageDataUrls: dataUrls }),
        clusterPhotosAction({ imageDataUrls: dataUrls }),
      ]);
      if (analysisResult.ok) setAnalysis(analysisResult.analysis);
      else setError(analysisResult.error);

      if (clusterResult.ok) {
        const nextClusters: PhotoClusterUI[] = clusterResult.clusters
          .map((c) => ({
            description: c.description,
            photoIds: c.photo_indices
              .filter((i) => i >= 0 && i < allImages.length)
              .map((i) => allImages[i].id),
          }))
          .filter((c) => c.photoIds.length > 0);
        setClusters(nextClusters);
      }
    });
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploads: UploadedImage[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList.item(i);
        if (!file || !file.type.startsWith("image/")) continue;
        const dataUrl = await fileToCompressedDataUrl(file);
        uploads.push({
          id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          name: file.name,
        });
      }
      const next = [...images, ...uploads];
      setImages(next);
      // 새로 업로드된 사진은 자동으로 선택 상태
      if (uploads.length > 0) {
        setSelectedPhotoIds((prev) => {
          const out = new Set(prev);
          for (const u of uploads) out.add(u.id);
          return out;
        });
        runAnalysis(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((p) => p.id !== id));
    setClusters((prev) =>
      prev
        .map((c) => ({
          ...c,
          photoIds: c.photoIds.filter((x) => x !== id),
        }))
        .filter((c) => c.photoIds.length > 0),
    );
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function togglePhotoSelection(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setMatch(description: string, childId: string) {
    setClusterMatches((prev) => {
      const next = { ...prev };
      if (childId) next[description] = childId;
      else delete next[description];
      return next;
    });
  }

  const imageById = useMemo(
    () => new Map(images.map((p) => [p.id, p])),
    [images],
  );
  const clusteredIds = new Set(clusters.flatMap((c) => c.photoIds));
  const unclustered = images.filter((p) => !clusteredIds.has(p.id));
  const usedChildIds = new Set(Object.values(clusterMatches).filter(Boolean));
  const matchedCount = clusters.filter(
    (c) => clusterMatches[c.description],
  ).length;

  // step gating
  const canGoStep2 = !!analysis && images.length > 0;
  const canGoStep3 = canGoStep2 && matchedCount > 0;

  // sessionStorage 자동 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!analysis && clusters.length === 0) {
      window.sessionStorage.removeItem(DAILY_ACTIVITY_STORAGE_KEY);
      return;
    }
    const now = new Date();
    const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const lookup = new Map(images.map((p) => [p.id, p]));
    const payload: DailyActivityHandoff = {
      classroomName,
      date: isoDate,
      savedAt: Date.now(),
      analysis,
      clusters: clusters.map((c) => ({
        description: c.description,
        childId: clusterMatches[c.description] || null,
        photos: c.photoIds
          .map((pid) => lookup.get(pid))
          .filter((p): p is UploadedImage => !!p)
          .map((p) => ({ id: p.id, dataUrl: p.dataUrl })),
      })),
    };
    try {
      window.sessionStorage.setItem(
        DAILY_ACTIVITY_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // 용량 초과 시 무시
    }
  }, [analysis, clusters, clusterMatches, classroomName, images]);

  // step 3 — 원아 매칭 헬퍼
  const matchedChildIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of clusters) {
      const cid = clusterMatches[c.description];
      if (cid) ids.add(cid);
    }
    return ids;
  }, [clusters, clusterMatches]);

  function generateAllSummaries() {
    if (!analysis) {
      setError("1단계에서 AI 활동 분석이 먼저 완료되어야 해요.");
      return;
    }
    if (children.length === 0) return;
    setError(null);
    const childPayload = children.map((c) => {
      const matchedCluster = clusters.find(
        (cl) => clusterMatches[cl.description] === c.id,
      );
      return {
        name: c.name,
        photoCount: matchedCluster?.photoIds.length ?? 0,
        clusterDescription: matchedCluster?.description ?? null,
      };
    });
    startTransition(async () => {
      const result = await generateChildSummariesAction({
        classroomName,
        activityTitle: analysis.activity_title,
        activityDescription: analysis.activity_description,
        keywords: analysis.keywords,
        children: childPayload,
      });
      if (result.ok) {
        setSavedMemos((prev) => {
          const next = { ...prev };
          children.forEach((c, i) => {
            const s = result.summaries[i];
            if (s) next[c.id] = s.trim();
          });
          return next;
        });
        const ok = result.summaries.filter((s) => s && s.trim()).length;
        setSaveToast(`${ok}명 원아 한 줄 메모 일괄 생성 완료`);
        window.setTimeout(() => setSaveToast(null), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  function tryGoStep(target: StepNumber) {
    setError(null);
    setStep(target);
  }

  const matchedChildren = children.filter((c) => matchedChildIds.has(c.id));
  const otherChildren = children.filter((c) => !matchedChildIds.has(c.id));

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
            매일 활동 기록 · {step}단계 — {STEP_META[step].label}
          </h1>
        </div>
        <p className="ml-10 mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {dateLabel} · {classroomName} · {STEP_META[step].sub}
        </p>
      </section>

      {/* 스테퍼 */}
      <section>
        <ol className="flex items-center gap-1.5">
          {([1, 2] as StepNumber[]).map((n, idx) => {
            const isActive = n === step;
            const isDone =
              (n === 1 && !!analysis) ||
              (n === 2 && Object.keys(savedMemos).length > 0);
            const isReachable = true;
            return (
              <li key={n} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => tryGoStep(n)}
                  disabled={!isReachable}
                  title={STEP_META[n].sub}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-emerald-600 text-white"
                      : isReachable
                        ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-slate-50 text-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                      isActive
                        ? "bg-white/25 text-white"
                        : isDone
                          ? "bg-emerald-500 text-white"
                          : "bg-white text-slate-500 ring-1 ring-slate-200",
                    )}
                  >
                    {isDone && !isActive ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    ) : (
                      n
                    )}
                  </span>
                  {STEP_META[n].label}
                </button>
                {idx < 1 && (
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      {/* STEP 1 — 매일 활동 기록 */}
      {step === 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">
              사진 업로드 + AI 활동 분석
            </p>
            {isPending && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI 분석 중…
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              {uploading ? (
                <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
              ) : (
                <Upload className="h-7 w-7 text-slate-400" />
              )}
              <p className="text-sm text-slate-600">
                {uploading
                  ? "이미지 변환 중…"
                  : "사진을 클릭해서 업로드 (여러 장 가능)"}
              </p>
            </button>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-slate-500">
                  사진 · {images.length}장 ·{" "}
                  <span className="text-emerald-700">
                    {selectedPhotoIds.size}장 선택됨
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  {uploading && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      추가 중…
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPhotoIds.size === images.length) {
                        setSelectedPhotoIds(new Set());
                      } else {
                        setSelectedPhotoIds(new Set(images.map((p) => p.id)));
                      }
                    }}
                    className="text-[11px] font-medium text-slate-600 underline hover:text-slate-800"
                  >
                    {selectedPhotoIds.size === images.length
                      ? "전체 해제"
                      : "전체 선택"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {images.map((p) => {
                  const selected = selectedPhotoIds.has(p.id);
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => togglePhotoSelection(p.id)}
                        className={cn(
                          "block aspect-square w-full overflow-hidden rounded-lg ring-1 transition-all",
                          selected
                            ? "ring-2 ring-emerald-500 ring-offset-1"
                            : "opacity-60 ring-slate-200 hover:opacity-100",
                        )}
                        aria-pressed={selected}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.dataUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      {selected && (
                        <span className="pointer-events-none absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white shadow">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(p.id)}
                        className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                        aria-label="삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="grid aspect-square w-full place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-500"
                  aria-label="사진 추가"
                >
                  <Upload className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* 선택된 사진 액션 바 */}
          {images.length > 0 && selectedPhotoIds.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-xs text-slate-600">
                <strong className="text-slate-900">
                  {selectedPhotoIds.size}장
                </strong>{" "}
                선택됨 · 다음 작업을 선택하세요
              </p>
              <button
                type="button"
                onClick={() => setShowClusterModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Users className="h-3.5 w-3.5" />
                아이 사진 분류
              </button>
            </div>
          )}

          <div className="mt-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                  <Sparkles className="h-4 w-4" />
                  AI 활동 분석
                </p>
                {analysis && (
                  <button
                    type="button"
                    onClick={() => setEditingAnalysis((v) => !v)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                      editingAnalysis
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {editingAnalysis ? "보기" : "편집"}
                  </button>
                )}
              </div>

              {!analysis ? (
                <div className="grid place-items-center py-6 text-center">
                  <div className="text-slate-400">
                    {isPending ? (
                      <>
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" />
                        <p className="mt-2 text-xs">사진을 분석하고 있어요…</p>
                      </>
                    ) : (
                      <>
                        <Sparkles className="mx-auto h-6 w-6 text-emerald-200" />
                        <p className="mt-2 text-xs">
                          사진을 업로드하면 자동으로 활동 내역을 분석해드려요.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      활동 제목
                    </p>
                    {editingAnalysis ? (
                      <input
                        value={analysis.activity_title}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            activity_title: e.target.value,
                          })
                        }
                        className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 focus:border-emerald-400 focus:outline-none"
                      />
                    ) : (
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {analysis.activity_title}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      활동 내역
                    </p>
                    {editingAnalysis ? (
                      <textarea
                        value={analysis.activity_description}
                        onChange={(e) =>
                          setAnalysis({
                            ...analysis,
                            activity_description: e.target.value,
                          })
                        }
                        rows={5}
                        className="mt-1 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                      />
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {analysis.activity_description}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-700/80">
                      <Tag className="h-2.5 w-2.5" />
                      활동 키워드
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {analysis.keywords.map((k) => (
                        <span
                          key={k}
                          className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Users className="h-3 w-3 text-slate-400" />
                    추정 참여 원아 약{" "}
                    <strong className="text-slate-900">
                      {analysis.estimated_children}
                    </strong>
                    명
                  </div>

                  <div className="rounded-lg bg-white p-2 ring-1 ring-emerald-100">
                    <p className="text-[10px] font-medium text-emerald-700/80">
                      💡 활용 추천
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      {analysis.suggestion}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 아이 사진 분류 — 팝업 */}
      {showClusterModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6"
          onClick={() => setShowClusterModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  아이 사진 분류
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  같은 옷·외형으로 묶인 사진 그룹에 원아를 선택해 매칭하세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  매칭 {matchedCount}/{clusters.length}
                </span>
                <button
                  type="button"
                  onClick={() => setShowClusterModal(false)}
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {clusters.length === 0 ? (
                <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">
                  {isPending
                    ? "AI가 사진을 그룹핑하고 있어요…"
                    : "그룹핑 결과가 없어요. 1단계에서 사진을 업로드해 주세요."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {clusters.map((cluster, idx) => {
                    const matchedId = clusterMatches[cluster.description] ?? "";
                    const matched = children.find((c) => c.id === matchedId);
                    return (
                      <li
                        key={cluster.description}
                        className={cn(
                          "rounded-xl p-3 ring-1 transition-colors",
                          matched
                            ? "bg-emerald-50/60 ring-emerald-200"
                            : "bg-slate-50 ring-slate-100",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                              {idx + 1}
                            </span>
                            <p className="truncate text-xs font-medium text-slate-700">
                              {cluster.description}
                              <span className="ml-1 text-slate-400">
                                · {cluster.photoIds.length}장
                              </span>
                            </p>
                          </div>
                          <select
                            value={matchedId}
                            onChange={(e) =>
                              setMatch(cluster.description, e.target.value)
                            }
                            className={cn(
                              "h-8 max-w-[140px] rounded-lg border bg-white px-2 text-xs focus:outline-none",
                              matched
                                ? "border-emerald-300 text-emerald-700 focus:border-emerald-400"
                                : "border-slate-200 text-slate-700 focus:border-emerald-400",
                            )}
                          >
                            <option value="">원아 선택…</option>
                            {children.map((c) => {
                              const isUsedElsewhere =
                                usedChildIds.has(c.id) && matchedId !== c.id;
                              return (
                                <option
                                  key={c.id}
                                  value={c.id}
                                  disabled={isUsedElsewhere}
                                >
                                  {c.name}
                                  {isUsedElsewhere ? " (다른 그룹)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {cluster.photoIds.map((pid) => {
                            const p = imageById.get(pid);
                            if (!p) return null;
                            return (
                              <div
                                key={pid}
                                className={cn(
                                  "h-14 w-14 overflow-hidden rounded-lg ring-1",
                                  matched
                                    ? "ring-emerald-300"
                                    : "ring-slate-200",
                                )}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.dataUrl}
                                  alt={p.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {matched && (
                          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            <Check className="h-3 w-3" strokeWidth={3} />
                            <span>{matched.name}</span>으로 매칭됨
                          </p>
                        )}
                      </li>
                    );
                  })}

                  {unclustered.length > 0 && (
                    <li className="rounded-xl border border-dashed border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-medium text-slate-500">
                        그룹에 속하지 않는 사진 · {unclustered.length}장
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {unclustered.map((p) => (
                          <div
                            key={p.id}
                            className="h-14 w-14 overflow-hidden rounded-lg ring-1 ring-slate-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.dataUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setShowClusterModal(false)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — 원아 활동 기록 */}
      {step === 2 && (
        <>
          {/* 활동 요약 (1단계에서 가져옴) */}
          {analysis && (
            <section className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-emerald-700/80">
                    오늘의 활동
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {analysis.activity_title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {analysis.keywords.map((k) => (
                      <span
                        key={k}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                      >
                        {k}
                      </span>
                    ))}
                    <span className="ml-1 text-[11px] text-emerald-700/80">
                      매칭 원아 {matchedChildIds.size}명
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 원아별 한 줄 메모 리스트 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  원아별 활동 한 줄 메모
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  전체 원아의 활동 메모를 한 번에 검토·수정하세요. 빈 칸은 AI 일괄 생성으로 한 번에 채울 수 있어요.
                </p>
              </div>
              <button
                type="button"
                onClick={generateAllSummaries}
                disabled={isPending || !analysis || children.length === 0}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  isPending || !analysis || children.length === 0
                    ? "bg-slate-100 text-slate-400"
                    : "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                {isPending ? (
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
              <strong className="text-slate-900">
                {
                  Object.values(savedMemos).filter((v) => v.trim().length > 0)
                    .length
                }
              </strong>{" "}
              / 전체 {children.length}
            </p>

            {children.length === 0 ? (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                등록된 원아가 없어요.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                {children.map((c) => {
                  const matchedCluster = clusters.find(
                    (cl) => clusterMatches[cl.description] === c.id,
                  );
                  const photos = (matchedCluster?.photoIds ?? [])
                    .map((pid) => imageById.get(pid))
                    .filter((p): p is UploadedImage => !!p);
                  const value = savedMemos[c.id] ?? "";
                  const filled = value.trim().length > 0;
                  return (
                    <li key={c.id} className="flex gap-3 bg-white px-3 py-3">
                      <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                        <div
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-full text-xs font-bold",
                            c.gender === "F"
                              ? "bg-rose-100 text-rose-600"
                              : "bg-emerald-100 text-emerald-700",
                          )}
                        >
                          {c.name.charAt(0)}
                        </div>
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          {c.name}
                        </p>
                        {c.privacy_agreed_at === null && (
                          <span
                            className="rounded-sm bg-rose-100 px-1 py-px text-[9px] font-medium text-rose-700"
                            title="개인정보 미동의 — 사진·기록 외부 공유 시 주의"
                          >
                            미동의
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {photos.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap gap-1">
                            {photos.slice(0, 6).map((p) => (
                              <div
                                key={p.id}
                                className="h-9 w-9 overflow-hidden rounded ring-1 ring-slate-200"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.dataUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ))}
                            {photos.length > 6 && (
                              <span className="grid h-9 place-items-center rounded bg-slate-100 px-2 text-[10px] font-medium text-slate-500">
                                +{photos.length - 6}
                              </span>
                            )}
                          </div>
                        )}
                        <textarea
                          value={value}
                          onChange={(e) =>
                            setSavedMemos((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          rows={2}
                          placeholder={
                            photos.length > 0
                              ? `${c.name} 한 줄 메모…`
                              : "수동으로 한 줄 메모 작성"
                          }
                          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs leading-relaxed text-slate-800 focus:border-emerald-400 focus:outline-none"
                        />
                      </div>
                      <div className="flex w-5 shrink-0 items-start pt-1">
                        {filled && (
                          <Check
                            className="h-4 w-4 text-emerald-600"
                            strokeWidth={3}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 단계 네비게이션 */}
      <section className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => tryGoStep((step - 1) as StepNumber)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            이전 단계
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button
            type="button"
            onClick={() => tryGoStep((step + 1) as StepNumber)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            다음 단계 — {STEP_META[(step + 1) as StepNumber].label}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-xs text-slate-400">마지막 단계</span>
        )}
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
