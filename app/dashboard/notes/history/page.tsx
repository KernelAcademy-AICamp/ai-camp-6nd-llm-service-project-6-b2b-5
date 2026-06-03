import { CalendarDays, Mail, MailOpen, Percent } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { NotesTabs } from "../_tabs";

export const dynamic = "force-dynamic";

type MonthStat = {
  month: string; // YYYY-MM
  total: number;
  read: number;
  rate: number; // 0~100
};

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${y}년 ${Number(m)}월`;
}

async function loadData(classroomId: string) {
  const supabase = createAdminClient();

  // 발송된(=published) 알림장만 집계
  const { data: notes } = await supabase
    .from("daily_notes")
    .select("date, is_read")
    .eq("classroom_id", classroomId)
    .eq("status", "published")
    .order("date", { ascending: false });

  const rows = (notes ?? []) as Array<{ date: string; is_read: boolean }>;

  // 월별 집계
  const byMonth = new Map<string, { total: number; read: number }>();
  for (const n of rows) {
    const month = (n.date ?? "").slice(0, 7); // YYYY-MM
    if (!month) continue;
    const cur = byMonth.get(month) ?? { total: 0, read: 0 };
    cur.total += 1;
    if (n.is_read) cur.read += 1;
    byMonth.set(month, cur);
  }

  const months: MonthStat[] = Array.from(byMonth.entries())
    .map(([month, v]) => ({
      month,
      total: v.total,
      read: v.read,
      rate: v.total ? Math.round((v.read / v.total) * 100) : 0,
    }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  const totalSent = rows.length;
  const totalRead = rows.filter((n) => n.is_read).length;
  const overallRate = totalSent ? Math.round((totalRead / totalSent) * 100) : 0;

  return { months, totalSent, totalRead, overallRate };
}

export default async function NotesHistoryPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { months, totalSent, totalRead, overallRate } = active
    ? await loadData(active.id)
    : { months: [], totalSent: 0, totalRead: 0, overallRate: 0 };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">알림장 · 발송이력</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-emerald-500" />
            월별 발송 통계
          </h1>
        </div>
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </section>

      <NotesTabs active="history" qs={qs} />

      {/* 누적 통계 */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="총 발송건" value={`${totalSent}건`} icon={<Mail className="h-4 w-4" />} tone="slate" />
        <Stat label="열람" value={`${totalRead}건`} icon={<MailOpen className="h-4 w-4" />} tone="emerald" />
        <Stat label="열람률" value={`${overallRate}%`} icon={<Percent className="h-4 w-4" />} tone="amber" />
      </section>

      {/* 월별 표 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="mb-3 text-sm font-bold">월별 발송 현황</p>
        {months.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            아직 발송된 알림장이 없어요.
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
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "slate" | "emerald" | "amber";
}) {
  const toneMap = {
    slate: "text-slate-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}
