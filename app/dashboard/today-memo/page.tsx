import Link from "next/link";
import { ChevronDown, Search, Camera } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import type { ChildRow } from "@/types";
import { ChildBlock, type MemoRow } from "./_child-block";

export const dynamic = "force-dynamic";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function loadData(classroomId: string) {
  const supabase = createAdminClient();
  const today = todayISO();

  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("classroom_id", classroomId)
    .eq("status", "active")
    .order("name");

  const { data: sessions } = await supabase
    .from("activity_sessions")
    .select("id, title")
    .eq("classroom_id", classroomId)
    .eq("date", today);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const titleById = new Map((sessions ?? []).map((s) => [s.id, s.title]));
  const activityTitles = Array.from(
    new Set((sessions ?? []).map((s) => s.title).filter((t): t is string => !!t)),
  );

  const { data: records } = sessionIds.length
    ? await supabase
        .from("activity_records")
        .select("id, child_id, memo, session_id, created_at")
        .in("session_id", sessionIds)
        .not("memo", "is", null)
        .order("created_at", { ascending: true })
    : { data: [] as Array<{ id: string; child_id: string; memo: string | null; session_id: string; created_at: string }> };

  const memosByChild = new Map<string, MemoRow[]>();
  for (const r of records ?? []) {
    if (!r.memo) continue;
    const arr = memosByChild.get(r.child_id) ?? [];
    arr.push({
      id: r.id,
      memo: r.memo,
      time: fmtTime(r.created_at),
      tag: titleById.get(r.session_id) ?? null,
    });
    memosByChild.set(r.child_id, arr);
  }

  return {
    children: (children ?? []) as ChildRow[],
    memosByChild,
    activityTitles,
  };
}

export default async function TodayMemoPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { children, memosByChild, activityTitles } = active
    ? await loadData(active.id)
    : { children: [] as ChildRow[], memosByChild: new Map<string, MemoRow[]>(), activityTitles: [] as string[] };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-10">
      <section className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">또랑 · 한줄기록</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            (기록) 한줄기록
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            순간 기록이 쌓여 자산이 됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
          <Link
            href={`/dashboard/activities/new${qs}`}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Camera className="h-4 w-4" />
            활동 기록 등록
          </Link>
        </div>
      </section>


      <section className="!mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-[200px_minmax(0,1fr)_240px] gap-3">
          {/* 원아 선택 */}
          <div className="relative">
            <select className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm focus:border-emerald-400 focus:outline-none">
              <option>전체 원아 ({children.length}명)</option>
              {children.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* 활동 선택 */}
          <div className="relative">
            <select
              defaultValue=""
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none"
            >
              <option value="">활동 선택 — 메모에 함께 기록 (선택)</option>
              {activityTitles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* 검색 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="메모 내용 검색 (이름도 가능)"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {children.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              등록된 원아가 없어요.
            </p>
          ) : (
            children.map((c) => (
              <ChildBlock
                key={c.id}
                name={c.name}
                gender={c.gender}
                memos={memosByChild.get(c.id) ?? []}
                activityTitles={activityTitles}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
