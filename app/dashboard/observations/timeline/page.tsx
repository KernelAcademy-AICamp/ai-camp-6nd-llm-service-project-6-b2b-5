import { TrendingUp, BookOpen, Users, Sparkles } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { ObservationTabs } from "../_tabs";

export const dynamic = "force-dynamic";

type MonthCount = { month: string; count: number };
type ChildCount = { childId: string; name: string; count: number };

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${y}년 ${Number(m)}월`;
}

async function loadData(classroomId: string) {
  const supabase = createAdminClient();

  const { data: journals } = await supabase
    .from("observation_journals")
    .select("child_id, date, ai_generated_at")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: true });

  const rows = (journals ?? []) as Array<{
    child_id: string;
    date: string;
    ai_generated_at: string | null;
  }>;

  // 월별 작성 건수
  const byMonth = new Map<string, number>();
  for (const j of rows) {
    const month = (j.date ?? "").slice(0, 7);
    if (!month) continue;
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const months: MonthCount[] = Array.from(byMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  // 원아별 누적 작성 건수
  const byChild = new Map<string, number>();
  for (const j of rows) {
    byChild.set(j.child_id, (byChild.get(j.child_id) ?? 0) + 1);
  }
  const childIds = Array.from(byChild.keys());
  const { data: childrenRows } = childIds.length
    ? await supabase.from("children").select("id, name").in("id", childIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map((childrenRows ?? []).map((c) => [c.id, c.name]));
  const children: ChildCount[] = Array.from(byChild.entries())
    .map(([childId, count]) => ({
      childId,
      name: nameById.get(childId) ?? "(원아 없음)",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const total = rows.length;
  const aiCount = rows.filter((j) => j.ai_generated_at).length;
  const aiRate = total ? Math.round((aiCount / total) * 100) : 0;

  return { months, children, total, childCount: byChild.size, aiRate };
}

export default async function ObservationTimelinePage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { months, children, total, childCount, aiRate } = active
    ? await loadData(active.id)
    : { months: [], children: [], total: 0, childCount: 0, aiRate: 0 };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  const monthMax = Math.max(1, ...months.map((m) => m.count));
  const childMax = Math.max(1, ...children.map((c) => c.count));

  return (
    <main className="container mx-auto py-10 space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">또랑 · 관찰일지 · 발달타임라인</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight">
            <TrendingUp className="h-6 w-6 text-emerald-500" />
            발달타임라인
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            월별 관찰 기록 추이 — 누적 발달 데이터
          </p>
        </div>
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </section>

      <ObservationTabs active="timeline" qs={qs} />

      {/* 누적 통계 */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="총 관찰일지" value={`${total}건`} icon={<BookOpen className="h-4 w-4" />} />
        <Stat label="관찰 원아" value={`${childCount}명`} icon={<Users className="h-4 w-4" />} />
        <Stat label="AI 활용" value={`${aiRate}%`} icon={<Sparkles className="h-4 w-4" />} />
      </section>

      {/* 월별 작성 추이 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm font-bold">월별 작성 추이</p>
        {months.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            아직 작성된 관찰일지가 없어요.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {months.map((m) => (
              <li key={m.month} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-slate-600">
                  {monthLabel(m.month)}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-emerald-500 px-2 text-[10px] font-semibold text-white"
                    style={{ width: `${Math.round((m.count / monthMax) * 100)}%` }}
                  >
                    {m.count}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 원아별 누적 기록 (월별 비교용) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm font-bold">원아별 누적 기록</p>
        {children.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            아직 기록이 없어요.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {children.map((c) => (
              <li key={c.childId} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-xs font-medium text-slate-600">
                  {c.name}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-sky-400 px-2 text-[10px] font-semibold text-white"
                    style={{ width: `${Math.round((c.count / childMax) * 100)}%` }}
                  >
                    {c.count}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-400">
        * 영역별 강도 점수(1~5) 기반 발달 비교 차트는 스키마에 점수 컬럼 추가 시 제공할 수 있어요.
        현재는 작성 건수 기준 추이만 표시합니다.
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
