import { MessageSquare, FileText, CalendarDays } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${y}년 ${Number(m)}월`;
}

async function loadData(classroomId: string) {
  const supabase = createAdminClient();

  // 발행된 전체 (통계 집계용)
  const { data: publishedRows } = await supabase
    .from("daily_notes")
    .select("id, child_id, date, content, is_read, created_at")
    .eq("classroom_id", classroomId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { count: draftCount } = await supabase
    .from("daily_notes")
    .select("*", { count: "exact", head: true })
    .eq("classroom_id", classroomId)
    .eq("status", "draft");

  const published = publishedRows ?? [];
  const recent = published.slice(0, 20);

  // 월별 발송·열람 통계 (발송이력 병합)
  const byMonth = new Map<string, { total: number; read: number }>();
  for (const n of published) {
    const m = (n.date ?? "").slice(0, 7);
    if (!m) continue;
    const cur = byMonth.get(m) ?? { total: 0, read: 0 };
    cur.total += 1;
    if (n.is_read) cur.read += 1;
    byMonth.set(m, cur);
  }
  const months = Array.from(byMonth.entries())
    .map(([month, v]) => ({
      month,
      total: v.total,
      read: v.read,
      rate: v.total ? Math.round((v.read / v.total) * 100) : 0,
    }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  const totalSent = published.length;
  const totalRead = published.filter((n) => n.is_read).length;
  const readRate = totalSent ? Math.round((totalRead / totalSent) * 100) : 0;

  const childIds = Array.from(new Set(recent.map((n) => n.child_id)));
  const { data: childrenRows } = childIds.length
    ? await supabase.from("children").select("id, name").in("id", childIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const childNameById = new Map((childrenRows ?? []).map((c) => [c.id, c.name]));

  return {
    recent,
    draftCount: draftCount ?? 0,
    totalSent,
    unread: totalSent - totalRead,
    readRate,
    months,
    childNameById,
  };
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { recent, totalSent, unread, readRate, months, childNameById } = active
    ? await loadData(active.id)
    : {
        recent: [],
        totalSent: 0,
        unread: 0,
        readRate: 0,
        months: [] as Array<{ month: string; total: number; read: number; rate: number }>,
        childNameById: new Map<string, string>(),
      };

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">알림장 · 목록</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            우리 반 알림장
          </h1>
        </div>
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </section>

      {/* 발송 통계 (발송됨 + 발송이력 병합) */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="발송됨" value={`${totalSent}건`} tone="emerald" />
        <Stat label="미열람" value={`${unread}건`} tone="amber" />
        <Stat label="열람률" value={`${readRate}%`} tone="slate" />
      </section>

      {/* 최근 발송 알림장 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="mb-3 text-sm font-bold">최근 발송 알림장</p>
        {recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            아직 발송된 알림장이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {childNameById.get(n.child_id) ?? "(원아 없음)"}
                    </p>
                    <span className="text-xs text-slate-400">{n.date}</span>
                    {n.is_read ? (
                      <Badge variant="success" className="text-[10px]">읽음</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">미열람</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {n.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 월별 발송 현황 (발송이력 병합) */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
          <CalendarDays className="h-4 w-4 text-emerald-500" />
          월별 발송 현황
        </p>
        {months.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            집계할 발송 내역이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {months.map((m) => (
              <li key={m.month} className="flex items-center gap-4 py-3">
                <span className="w-24 shrink-0 text-sm font-semibold text-slate-800">
                  {monthLabel(m.month)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      발송 {m.total}건 · 열람 {m.read}건
                    </span>
                    <span className="font-semibold text-emerald-600">
                      열람률 {m.rate}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${m.rate}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "slate";
}) {
  const toneMap = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}
