"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DailyRecordResult } from "@/lib/daily-record-prompt";

type Item = {
  id: string;
  file: File;
  previewUrl: string;
  label: string;
};

const MAX_IMAGES = 50;
const MAX_BYTES = 5 * 1024 * 1024;

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailyRecordPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [date, setDate] = useState<string>(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DailyRecordResult | null>(null);
  const [copied, setCopied] = useState<"obs" | "letter" | "json" | null>(null);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const remaining = MAX_IMAGES - items.length;
    if (remaining <= 0) {
      setError(`사진은 최대 ${MAX_IMAGES}장까지 추가할 수 있습니다.`);
      return;
    }
    const incoming = Array.from(files).slice(0, remaining);
    const next: Item[] = [];
    for (const f of incoming) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_BYTES) {
        setError(
          `${f.name}: 5MB를 초과합니다 (${(f.size / 1024 / 1024).toFixed(1)}MB)`
        );
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        label: "",
      });
    }
    setItems((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const updateLabel = (id: string, label: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)));
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setResult(null);
    setError(null);
  };

  const onSubmit = async () => {
    if (items.length === 0) {
      setError("사진을 1장 이상 업로드해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("date", date);
      for (const it of items) {
        fd.append("images", it.file);
        fd.append("labels", it.label);
      }
      const res = await fetch("/api/daily-record", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data.result as DailyRecordResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async (
    key: "obs" | "letter" | "json",
    text: string
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  const jsonString = useMemo(
    () => (result ? JSON.stringify(result, null, 2) : ""),
    [result]
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">또랑 · 매일 활동 기록</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          하루 활동 사진(1~50장)을 올리면 일과 흐름 + 관찰일지 + 알림장 초안을
          자동 생성합니다. 사진에는 개인 식별 묘사가 들어가지 않으며, 활동·놀이
          중심으로만 기술됩니다.
        </p>
      </header>

      {/* 날짜 */}
      <section className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">기록 날짜</label>
        <input
          type="date"
          className="rounded border px-3 py-1.5 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </section>

      {/* 업로드 */}
      <section className="mb-6 rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            사진 ({items.length}/{MAX_IMAGES})
          </h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              + 사진 추가
            </Button>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
              >
                전체 비우기
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed py-12 text-sm text-muted-foreground hover:bg-secondary/40"
          >
            클릭하여 사진 선택 (jpeg/png/gif/webp, 각 5MB 이하)
          </button>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((it, idx) => (
              <li
                key={it.id}
                className="flex gap-3 rounded-lg border p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.previewUrl}
                  alt={`사진 ${idx + 1}`}
                  className="h-20 w-20 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      제거
                    </button>
                  </div>
                  <input
                    type="text"
                    className="w-full rounded border px-2 py-1 text-xs"
                    placeholder='시간대/활동 라벨 (선택, 예: "09:00 블록활동")'
                    value={it.label}
                    onChange={(e) => updateLabel(it.id, e.target.value)}
                  />
                </div>
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

      {/* 제출 */}
      <div className="mb-8 flex items-center justify-end gap-3">
        {items.length === 0 && !submitting && (
          <span className="text-xs text-muted-foreground">
            사진을 1장 이상 추가하면 생성됩니다
          </span>
        )}
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting
            ? `분석 중... (${items.length}장, 시간이 걸릴 수 있어요)`
            : `초안 생성${items.length > 0 ? ` (${items.length}장)` : ""}`}
        </Button>
      </div>

      {/* 결과 */}
      {result && (
        <section className="space-y-6">
          <div className="rounded-xl border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">메타 정보</h2>
              <span className="text-xs text-muted-foreground">
                신뢰도 {(result.신뢰도 * 100).toFixed(0)}%
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">기록 날짜</dt>
                <dd>{result.기록_날짜}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">사진 수</dt>
                <dd>{result.총_사진수}장</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">근거</dt>
                <dd className="text-xs">{result.근거}</dd>
              </div>
            </dl>
            {result.주의 && (
              <p className="mt-3 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                ⚠️ {result.주의}
              </p>
            )}
          </div>

          {/* 일과 흐름 */}
          <div className="rounded-xl border p-5">
            <h2 className="mb-3 text-sm font-semibold">일과 흐름</h2>
            {result.일과_흐름.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                분류된 활동이 없습니다.
              </p>
            ) : (
              <ol className="space-y-3">
                {result.일과_흐름.map((row, i) => (
                  <li
                    key={i}
                    className="rounded-lg border bg-secondary/30 p-3"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">{row.시간대}</span>
                      <span className="rounded-full bg-background px-2 py-0.5">
                        {row.일과_구분}
                      </span>
                      {row.놀이_유형 && (
                        <span className="rounded-full bg-background px-2 py-0.5">
                          {row.놀이_유형}
                        </span>
                      )}
                      {row.누리과정_영역.map((a) => (
                        <span
                          key={a}
                          className="rounded-full border px-2 py-0.5"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm">{row.장면_요약}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* 관찰일지 + 알림장 */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">관찰일지 초안</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copy("obs", result.관찰일지_초안)}
                  disabled={!result.관찰일지_초안}
                >
                  {copied === "obs" ? "복사됨 ✓" : "복사"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {result.관찰일지_초안 || "(생성된 내용 없음)"}
              </p>
            </div>

            <div className="rounded-xl border p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">알림장 초안</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copy("letter", result.알림장_초안)}
                  disabled={!result.알림장_초안}
                >
                  {copied === "letter" ? "복사됨 ✓" : "복사"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {result.알림장_초안 || "(생성된 내용 없음)"}
              </p>
            </div>
          </div>

          {/* 2번 — 개별 기록으로 이어가기 */}
          <div className="rounded-xl border bg-secondary/30 p-5">
            <h2 className="mb-2 text-sm font-semibold">
              원아별 개별 기록으로 이어가기
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              이 공통 초안을 바탕으로 특정 원아의 관찰일지·알림장을 생성합니다.
              현재 관찰일지 초안이 자동으로 다음 화면에 전달됩니다.
            </p>
            <Link
              href="/individual-record"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.setItem(
                    "ttorang.commonDraft",
                    result.관찰일지_초안 || result.알림장_초안 || ""
                  );
                }
              }}
            >
              <Button type="button" variant="outline">
                개별 기록 생성 →
              </Button>
            </Link>
          </div>

          {/* 원본 JSON */}
          <details className="rounded-xl border p-5">
            <summary className="cursor-pointer text-sm font-semibold">
              원본 JSON (디버그용)
            </summary>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copy("json", jsonString)}
              >
                {copied === "json" ? "복사됨 ✓" : "JSON 복사"}
              </Button>
            </div>
            <pre className="mt-2 overflow-auto rounded bg-secondary/40 p-3 text-xs">
              {jsonString}
            </pre>
          </details>
        </section>
      )}
    </main>
  );
}
