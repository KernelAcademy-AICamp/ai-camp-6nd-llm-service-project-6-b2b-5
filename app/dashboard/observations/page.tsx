import Link from "next/link";
import { BookOpen, FileText, Plus, Sparkles, Search } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";

export const dynamic = "force-dynamic";

type Journal = {
  id: string;
  child_id: string;
  date: string;
  content: string;
  ai_generated_at: string | null;
  created_at: string;
};

type ChildOpt = { id: string; name: string };
type ChildGroup = { childId: string; name: string; journals: Journal[] };

async function loadData(classroomId: string, q?: string, childId?: string) {
  const supabase = createAdminClient();

  const [{ data: journals }, { data: classChildren }] = await Promise.all([
    supabase
      .from("observation_journals")
      .select("id, child_id, date, content, ai_generated_at, created_at")
      .eq("classroom_id", classroomId)
      .order("date", { ascending: false })
      .limit(200),
    supabase
      .from("children")
      .select("id, name")
      .eq("classroom_id", classroomId)
      .order("name"),
  ]);

  const rows = (journals ?? []) as Journal[];
  const classroomChildren = (classChildren ?? []) as ChildOpt[];
  const childNameById = new Map(classroomChildren.map((c) => [c.id, c.name]));

  // 필터: 원아 선택 → 검색(이름/내용)
  const query = q?.trim().toLowerCase();
  const filtered = rows.filter((j) => {
    if (childId && j.child_id !== childId) return false;
    if (query) {
      const name = (childNameById.get(j.child_id) ?? "").toLowerCase();
      if (!name.includes(query) && !(j.content ?? "").toLowerCase().includes(query))
        return false;
    }
    return true;
  });

  // 아이별 그룹
  const map = new Map<string, ChildGroup>();
  for (const j of filtered) {
    const g: ChildGroup =
      map.get(j.child_id) ?? {
        childId: j.child_id,
        name: childNameById.get(j.child_id) ?? "(원아 없음)",
        journals: [],
      };
    g.journals.push(j);
    map.set(j.child_id, g);
  }
  const groups = Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );

  return {
    groups,
    total: filtered.length,
    hasAny: rows.length > 0,
    classroomChildren,
  };
}

export default async function ObservationsPage({
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
  const { groups, total, hasAny, classroomChildren } = active
    ? await loadData(active.id, query, childFilter)
    : {
        groups: [] as ChildGroup[],
        total: 0,
        hasAny: false,
        classroomChildren: [] as ChildOpt[],
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
          <p className="text-xs text-slate-400">또랑 · 관찰일지</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-emerald-500" />
            관찰일지
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            누리과정 영역별 발달 관찰 기록 — 교사 전용
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
          <Link
            href={`/dashboard/observations/new${qs}`}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            관찰일지 작성
          </Link>
        </div>
      </section>

      {/* 필터: 원아 선택 드롭다운 + 검색 */}
      <form
        action="/dashboard/observations"
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
            href={`/dashboard/observations${qs}`}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50"
          >
            초기화
          </Link>
        )}
      </form>

      {!hasAny ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="py-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-500">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">
              아직 작성된 관찰일지가 없어요.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              원아의 활동 기록과 한 줄 메모를 바탕으로 초안을 만들 수 있어요.
            </p>
            <Link
              href={`/dashboard/observations/new${qs}`}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              첫 관찰일지 작성하기
            </Link>
          </div>
        </section>
      ) : groups.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-700">검색 결과가 없어요.</p>
          <p className="mt-1 text-xs text-slate-500">
            조건과 일치하는 관찰일지를 찾지 못했어요.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {filtering && (
            <p className="text-xs text-slate-500">
              결과 <strong className="text-slate-700">{total}건</strong>
            </p>
          )}
          {groups.map((g) => (
            <section
              key={g.childId}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                  {g.name.slice(0, 1)}
                </span>
                <p className="text-sm font-bold">{g.name}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {g.journals.length}건
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.journals.map((j) => (
                  <li key={j.id} className="flex items-start gap-3 py-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{j.date}</span>
                        {j.ai_generated_at && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            AI
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {j.content}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
