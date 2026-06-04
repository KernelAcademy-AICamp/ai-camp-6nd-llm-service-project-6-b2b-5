"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CHILDREN_PROFILES,
  getProfileById,
  profileTraits,
} from "@/lib/children-profiles";
import { applyChildName } from "@/lib/korean-particles";
import type { IndividualRecordResult } from "@/lib/individual-record-prompt";

type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_IMAGES = 10;
const MAX_BYTES = 5 * 1024 * 1024;

export default function IndividualRecordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-6 py-10 text-sm text-muted-foreground">
          로딩 중...
        </main>
      }
    >
      <PageInner />
    </Suspense>
  );
}

function PageInner() {
  const sp = useSearchParams();
  const initialChildId = sp.get("child") ?? "";
  const initialCommonDraft = sp.get("commonDraft") ?? "";

  const [childId, setChildId] = useState<string>(initialChildId);
  const [commonDraft, setCommonDraft] = useState<string>(initialCommonDraft);
  const [teacherMemo, setTeacherMemo] = useState<string>("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IndividualRecordResult | null>(null);
  const [copied, setCopied] = useState<"obs" | "letter" | null>(null);

  const profile = useMemo(() => getProfileById(childId), [childId]);

  // 1번 페이지에서 sessionStorage 통해 전달된 공통 초안 자동 채움
  useEffect(() => {
    if (!commonDraft && typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem("ttorang.commonDraft");
      if (stored) setCommonDraft(stored);
    }
  }, [commonDraft]);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`사진은 최대 ${MAX_IMAGES}장까지 추가할 수 있습니다.`);
      return;
    }
    const incoming = Array.from(files).slice(0, remaining);
    const next: ImageItem[] = [];
    for (const f of incoming) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_BYTES) {
        setError(
          `${f.name}: 5MB 초과 (${(f.size / 1024 / 1024).toFixed(1)}MB)`
        );
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    setImages((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const t = prev.find((i) => i.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const onSubmit = async () => {
    if (!profile) {
      setError("원아를 선택해주세요.");
      return;
    }
    if (!commonDraft.trim() && !teacherMemo.trim()) {
      setError("[공통 초안] 또는 [교사 개별 메모] 중 하나는 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      // ⚠️ name은 절대 전송하지 않음. traits만 전송하여 AI가 누구인지 모르게 한다.
      fd.append("traits", profileTraits(profile).join(" / "));
      fd.append("commonDraft", commonDraft);
      fd.append("teacherMemo", teacherMemo);
      for (const it of images) fd.append("images", it.file);

      const res = await fetch("/api/individual-record", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.result as IndividualRecordResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async (key: "obs" | "letter", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  // {이름} → 실제 이름 + 조사 자동 치환 (클라이언트 후처리)
  const obsRendered = useMemo(
    () =>
      result && profile
        ? applyChildName(result.관찰일지_개별초안, profile.name)
        : "",
    [result, profile]
  );
  const letterRendered = useMemo(
    () =>
      result && profile
        ? applyChildName(result.알림장_개별초안, profile.name)
        : "",
    [result, profile]
  );

  const lowConfidence = result ? result.신뢰도 < 0.7 : false;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">또랑 · 개별 기록 생성</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            교사가 선택한 한 아이에 대해 관찰일지 · 알림장 초안을 생성합니다.
            <br />
            AI는 사진에서 누구인지 식별하지 않으며, 이름은 출력 후 화면에서
            치환됩니다.
          </p>
        </div>
        <Link
          href="/daily-record"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 1번 매일 활동 기록
        </Link>
      </header>

      {/* 원아 선택 */}
      <section className="mb-5 rounded-xl border p-5">
        <h2 className="text-sm font-semibold mb-2">원아 선택</h2>
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
        >
          <option value="">— 원아를 선택하세요 —</option>
          {CHILDREN_PROFILES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (만 {c.age}세) — {c.summary}
            </option>
          ))}
        </select>
        {profile && (
          <div className="mt-3 rounded-lg bg-secondary/40 p-3">
            <p className="mb-1 text-xs font-semibold">성향 프로필</p>
            <ul className="flex flex-wrap gap-1.5">
              {profileTraits(profile).map((t, i) => (
                <li
                  key={i}
                  className="rounded-full bg-background px-2 py-0.5 text-xs"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 공통 초안 */}
      <section className="mb-5 rounded-xl border p-5">
        <label className="block text-sm font-semibold mb-2">
          공통 초안 (1번 결과의 활동/문장)
        </label>
        <textarea
          className="w-full min-h-[100px] rounded border px-3 py-2 text-sm"
          placeholder={`예시:\n활동: 블록놀이 (사회관계, 자연탐구)\n"오늘 우리 반 친구들은 블록으로 높은 탑을 함께 쌓으며 즐거운 시간을 보냈어요."`}
          value={commonDraft}
          onChange={(e) => setCommonDraft(e.target.value)}
        />
      </section>

      {/* 교사 메모 */}
      <section className="mb-5 rounded-xl border p-5">
        <label className="block text-sm font-semibold mb-2">
          교사 개별 메모 (이 아이에게 있었던 개별 이벤트)
        </label>
        <textarea
          className="w-full min-h-[100px] rounded border px-3 py-2 text-sm"
          placeholder='예시: "탑을 쌓다가 친구에게 블록을 먼저 양보함"'
          value={teacherMemo}
          onChange={(e) => setTeacherMemo(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          비워두면 공통 활동 + 성향만으로 일반적 초안이 생성됩니다.
        </p>
      </section>

      {/* 사진 (선택) */}
      <section className="mb-5 rounded-xl border p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            (선택) 사진 ({images.length}/{MAX_IMAGES})
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            + 사진 추가
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            활동 맥락 참고용. AI는 사진에서 특정 아이를 식별하지 않습니다.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((it) => (
              <li key={it.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.previewUrl}
                  alt=""
                  className="h-20 w-full rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(it.id)}
                  className="absolute right-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-xs"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-8 flex items-center justify-end gap-3">
        {!profile && !submitting && (
          <span className="text-xs text-muted-foreground">
            원아를 먼저 선택하면 생성됩니다
          </span>
        )}
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "생성 중... (10~20초)" : "개별 초안 생성"}
        </Button>
      </div>

      {/* 결과 */}
      {result && profile && (
        <section className="space-y-5">
          {/* 메타 */}
          <div className="rounded-xl border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">메타</h2>
              <span
                className={`text-xs ${
                  lowConfidence ? "text-amber-700" : "text-muted-foreground"
                }`}
              >
                신뢰도 {(result.신뢰도 * 100).toFixed(0)}%{" "}
                {lowConfidence && "(낮음 — 교사 검토 권장)"}
              </span>
            </div>
            {result.반영한_성향.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-xs text-muted-foreground">반영한 성향</p>
                <ul className="flex flex-wrap gap-1.5">
                  {result.반영한_성향.map((t, i) => (
                    <li
                      key={i}
                      className="rounded-full border px-2 py-0.5 text-xs"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">근거: {result.근거}</p>
            {result.주의 && (
              <p className="mt-2 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                ⚠️ {result.주의}
              </p>
            )}
          </div>

          {/* 관찰일지 + 알림장 */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">관찰일지 개별 초안</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copy("obs", obsRendered)}
                  disabled={!obsRendered}
                >
                  {copied === "obs" ? "복사됨 ✓" : "복사"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {obsRendered || "(생성된 내용 없음)"}
              </p>
              {result.관찰일지_개별초안 !== obsRendered && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    원본 (자리표시자 보기)
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-secondary/40 p-2 text-xs">
                    {result.관찰일지_개별초안}
                  </pre>
                </details>
              )}
            </div>

            <div className="rounded-xl border p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">알림장 개별 초안</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copy("letter", letterRendered)}
                  disabled={!letterRendered}
                >
                  {copied === "letter" ? "복사됨 ✓" : "복사"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {letterRendered || "(생성된 내용 없음)"}
              </p>
              {result.알림장_개별초안 !== letterRendered && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    원본 (자리표시자 보기)
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-secondary/40 p-2 text-xs">
                    {result.알림장_개별초안}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
