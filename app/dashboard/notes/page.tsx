import Link from "next/link";
import { MessageSquare, FileText, CalendarDays, Search } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Note = {
  id: string;
  child_id: string;
  date: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

type ChildOpt = { id: string; name: string };
type ChildGroup = { childId: string; name: string; notes: Note[] };

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${y}년 ${Number(m)}월`;
}

async function loadData(classroomId: string, q?: string, childId?: string) {
  const supabase = createAdminClient();

  const [{ data: publishedRows }, { data: classChildren }] = await Promise.all([
    supabase
      .from("daily_notes")
      .select("id, child_id, date, content, is_read, created_at")
      .eq("classroom_id", classroomId)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase
      .from("children")
      .select("id, name")
      .eq("classroom_id", classroomId)
      .order("name"),
  ]);

  const all = (publishedRows ?? []) as Note[];
  const classroomChildren = (classChildren ?? []) as ChildOpt[];
  const childNameById = new Map(classroomChildren.map((c) => [c.id, c.name]));

  // 필터: 원아 선택 → 검색(이름/내용)
  const query = q?.trim().toLowerCase();
  const filtered = all.filter((n) => {
    if (childId && n.child_id !== childId) return false;
    if (query) {
      const name = (childNameById.get(n.child_id) ?? "").toLowerCase();
      if (!name.includes(query) && !(n.content ?? "").toLowerCase().includes(query))
        return false;
    }
    return true;
  });

  // 통계 (필터 반영)
  const totalSent = filtered.length;
  const totalRead = filtered.filter((n) => n.is_read).length;
  const readRate = totalSent ? Math.round((totalRead / totalSent) * 100) : 0;

  // 월별 통계
  const byMonth = new Map<string, { total: number; read: number }>();
  for (const n of filtered) {
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

  // 아이별 그룹
  const map = new Map<string, ChildGroup>();
  for (const n of filtered) {
    const g: ChildGroup =
      map.get(n.child_id) ?? {
        childId: n.child_id,
        name: childNameById.get(n.child_id) ?? "(원아 없음)",
        notes: [],
      };
    g.notes.push(n);
    map.set(n.child_id, g);
  }
  const groups = Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );

  return {
    groups,
    totalSent,
    unread: totalSent - totalRead,
    readRate,
    months,
    classroomChildren,
    hasAny: all.length > 0,
  };
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: {
    role?: string;
    user?: string;
    classroom?: string;
    q?: string;
    child?: string;
  };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const query = searchParams?.q?.trim();
  const childFilter = searchParams?.child?.trim();
  const {
    groups,
    totalSent,
    unread,
    readRate,
    months,
    classroomChildren,
    hasAny,
  } = active
    ? await loadData(active.id, query, childFilter)
    : {
        groups: [] as ChildGroup[],
        totalSent: 0,
        unread: 0,
        readRate: 0,
        months: [] as Array<{ month: string; total: number; read: number; rate: number }>,
        classroomChildren: [] as ChildOpt[],
        hasAny: false,
      };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;
  const filtering = Boolean(query || childFilter);

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-8">
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

      {/* 필터: 원아 선택 드롭다운 + 검색 */}
      <form
        action="/dashboard/notes"
        method="GET"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="role" value={searchParams?.role ?? "teacher"} />
        {searchParams?.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        {active && <input type="hidden" name="classroom" value={active.id} />}
        <select
          name="child"
          defaultValue={childFilter ?? ""}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">전체 원아</option>
          {classroomChildren.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={query ?? ""}
            placeholder="원아 이름 또는 내용 검색"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700"
        >
          검색
        </button>
        {filtering && (
          <Link
            href={`/dashboard/notes${qs}`}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50"
          >
            초기화
          </Link>
        )}
      </form>

      {/* 발송 통계 (간단 요약) */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          발송됨 <strong className="text-slate-700">{totalSent}건</strong>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          미열람 <strong className="text-amber-600">{unread}건</strong>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          열람률 <strong className="text-emerald-600">{readRate}%</strong>
        </span>
      </section>

      {/* 아이별 발송 알림장 */}
      {!hasAny ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <p className="py-10 text-center text-sm text-slate-500">
            아직 발송된 알림장이 없어요.
          </p>
        </section>
      ) : groups.length === 0 ? (
        <section className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-sm font-medium text-slate-700">검색 결과가 없어요.</p>
          <p className="mt-1 text-xs text-slate-500">
            조건과 일치하는 알림장을 찾지 못했어요.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section
              key={g.childId}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                  {g.name.slice(0, 1)}
                </span>
                <p className="text-sm font-bold">{g.name}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {g.notes.length}건
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
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
            </section>
          ))}
        </div>
      )}

      {/* 월별 발송 현황 */}
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

