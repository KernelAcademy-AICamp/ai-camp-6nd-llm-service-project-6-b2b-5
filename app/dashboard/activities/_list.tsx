"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Camera, Image as ImageIcon, Users, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SessionRow = {
  id: string;
  date: string; // YYYY-MM-DD
  classroomId: string;
  classroomName: string;
  title: string;
  keywords: string[];
  childCount: number;
  photoCount: number;
};

export type ChildRecordRow = {
  sessionId: string;
  childId: string;
  childName: string;
  date: string;
  classroomId: string;
  classroomName: string;
  title: string;
  memo: string;
  keywords: string[];
  photoCount: number;
};

type Tab = "all" | "child";
type Period = "7" | "30" | "all";

function withinPeriod(date: string, period: Period): boolean {
  if (period === "all") return true;
  const days = period === "7" ? 7 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(date) >= cutoff;
}

function withinRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}

export function ActivityListClient({
  sessions,
  childRecords,
  classrooms,
  writeHref,
  qs,
}: {
  sessions: SessionRow[];
  childRecords: ChildRecordRow[];
  classrooms: { id: string; name: string }[];
  writeHref: string;
  qs: string; // "?role=...&user=..."
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [classroomId, setClassroomId] = useState<string>("all");
  const [keyword, setKeyword] = useState<string>("all");
  // 기간 직접 입력(달력)
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  /** 세션 상세 링크 */
  const sessionHref = (id: string) => `/dashboard/activities/${id}${qs}`;
  const childHref = (sessionId: string, childId: string) =>
    `/dashboard/activities/${sessionId}${qs}${qs ? "&" : "?"}child=${childId}`;

  const hasAny = sessions.length > 0;

  // 현재 탭 데이터에서 키워드 후보 수집
  const keywordOptions = useMemo(() => {
    const set = new Set<string>();
    const src = tab === "all" ? sessions : childRecords;
    for (const r of src) for (const k of r.keywords) set.add(k);
    return Array.from(set).sort();
  }, [tab, sessions, childRecords]);

  const matchFilters = (row: {
    date: string;
    classroomId: string;
    keywords: string[];
  }) =>
    withinPeriod(row.date, period) &&
    withinRange(row.date, from, to) &&
    (classroomId === "all" || row.classroomId === classroomId) &&
    (keyword === "all" || row.keywords.includes(keyword));

  const filteredSessions = sessions.filter(matchFilters);
  const filteredChildRecords = childRecords.filter(matchFilters);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-1">교사 보기</p>
          <h1 className="text-3xl font-bold tracking-tight">활동 기록 목록</h1>
          <p className="text-muted-foreground mt-1">
            저장된 매일 활동 기록을 확인합니다. (작성 중인 문서는 표시되지 않아요)
          </p>
        </div>
        <Link href={writeHref}>
          <Button>
            <PlusCircle className="mr-1.5 h-4 w-4" />
            활동 기록 작성
          </Button>
        </Link>
      </div>

      {/* 보관 안내 */}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
        원아 사진은 재원 기간 및 졸업/퇴소 후 1년까지만 보관됩니다.
      </p>

      {!hasAny ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Camera className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              아직 작성한 활동 기록이 없어요
            </p>
            <Link href={writeHref}>
              <Button variant="outline" size="sm">
                <PlusCircle className="mr-1.5 h-4 w-4" />첫 활동 기록 작성하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 필터 바: 탭(좌) + 기간·반·키워드(우) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              {(["all", "child"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setKeyword("all");
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "all" ? "전체" : "원아별"}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* 기간 */}
              <div className="inline-flex rounded-lg border p-0.5">
                {(
                  [
                    ["7", "최근 7일"],
                    ["30", "30일"],
                    ["all", "전체"],
                  ] as [Period, string][]
                ).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      period === p
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* 기간 직접 입력 (달력) */}
              <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (e.target.value) setPeriod("all");
                  }}
                  className="h-8 rounded-lg border bg-background px-2"
                  aria-label="시작일"
                />
                <span>~</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => {
                    setTo(e.target.value);
                    if (e.target.value) setPeriod("all");
                  }}
                  className="h-8 rounded-lg border bg-background px-2"
                  aria-label="종료일"
                />
                {(from || to) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                    className="rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent"
                  >
                    초기화
                  </button>
                )}
              </div>
              {/* 반별 (담당 반 2개 이상일 때) */}
              {classrooms.length > 1 && (
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  className="h-8 rounded-lg border bg-background px-2 text-xs"
                >
                  <option value="all">전체 반</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {/* 키워드 */}
              {keywordOptions.length > 0 && (
                <select
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="h-8 rounded-lg border bg-background px-2 text-xs"
                >
                  <option value="all">전체 키워드</option>
                  {keywordOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* 목록 */}
          {tab === "all" ? (
            filteredSessions.length === 0 ? (
              <EmptyFilterNote />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredSessions.map((s) => (
                  <Link key={s.id} href={sessionHref(s.id)} className="block">
                  <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        <Badge variant="outline">{s.classroomName}</Badge>
                      </div>
                      <CardDescription>{formatDate(s.date)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {s.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.keywords.slice(0, 5).map((k) => (
                            <Badge key={k} variant="secondary">
                              {k}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          원아 {s.childCount}명
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" />
                          사진 {s.photoCount}장
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  </Link>
                ))}
              </div>
            )
          ) : filteredChildRecords.length === 0 ? (
            <EmptyFilterNote />
          ) : (
            <div className="space-y-2">
              {filteredChildRecords.map((r, i) => (
                <Link
                  key={`${r.childId}-${r.date}-${i}`}
                  href={childHref(r.sessionId, r.childId)}
                  className="block"
                >
                  <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
                  <CardContent className="flex items-start gap-3 py-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {r.childName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{r.childName}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(r.date)} · {r.classroomName} · {r.title}
                        </span>
                      </div>
                      {r.memo ? (
                        <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                          {r.memo}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          (작성된 메모 없음)
                        </p>
                      )}
                    </div>
                    {r.photoCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {r.photoCount}
                      </span>
                    )}
                  </CardContent>
                </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyFilterNote() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        조건에 맞는 활동 기록이 없어요.
      </CardContent>
    </Card>
  );
}
