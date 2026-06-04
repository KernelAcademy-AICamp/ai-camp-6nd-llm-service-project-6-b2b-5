import Link from "next/link";
import {
  Camera,
  PencilLine,
  Search,
  Printer,
  Sparkles,
  HelpCircle,
  Calendar,
  RotateCcw,
  ImageIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";

export const dynamic = "force-dynamic";

type RecordRow = {
  id: string;
  child_id: string;
  session_id: string;
  memo: string | null;
  ai_content: string | null;
  session_ai_content: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  date: string;
  title: string | null;
};

type ChildRow = {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
};

type RecordEntry = RecordRow & {
  date: string;
  sessionTitle: string | null;
  preview: string;
  photoCount: number;
};

type ChildWithCount = ChildRow & { count: number; latest: string | null };

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return `만 ${age}세`;
}

function formatBirth(birthDate: string | null): string {
  if (!birthDate) return "";
  return birthDate.replace(/-/g, ". ") + ".";
}

function formatDotDate(d: string): string {
  return d.replace(/-/g, ". ") + ".";
}

function buildPreview(r: RecordRow): string {
  // 1순위 ai_content → 2순위 session_ai_content → 3순위 memo
  const raw = r.ai_content?.trim() || r.session_ai_content?.trim() || r.memo?.trim() || "";
  return raw.replace(/\s+/g, " ").slice(0, 280);
}

async function loadData(
  classroomId: string,
  search: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<{
  children: ChildWithCount[];
  records: RecordRow[];
  sessionById: Map<string, SessionRow>;
  photoCountByRecord: Map<string, number>;
}> {
  const supabase = createAdminClient();

  // 1) classroom sessions (date 범위 필터)
  let sessionQ = supabase
    .from("activity_sessions")
    .select("id, date, title")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(500);
  if (startDate) sessionQ = sessionQ.gte("date", startDate);
  if (endDate) sessionQ = sessionQ.lte("date", endDate);

  const [{ data: childRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("children")
      .select("id, name, birth_date, gender")
      .eq("classroom_id", classroomId)
      .order("name"),
    sessionQ,
  ]);

  const allChildren = (childRows ?? []) as ChildRow[];
  const sessions = (sessionRows ?? []) as SessionRow[];
  const sessionById = new Map(sessions.map((s) => [s.id, s] as const));

  if (sessions.length === 0) {
    return {
      children: allChildren.map((c) => ({ ...c, count: 0, latest: null })),
      records: [],
      sessionById,
      photoCountByRecord: new Map(),
    };
  }

  const sessionIds = sessions.map((s) => s.id);
  const { data: recordRows } = await supabase
    .from("activity_records")
    .select(
      "id, child_id, session_id, memo, ai_content, session_ai_content, created_at, updated_at",
    )
    .in("session_id", sessionIds);

  let allRecords = (recordRows ?? []) as RecordRow[];

  // 검색: memo / ai_content / session_ai_content / 원아 이름 매칭
  const term = search?.toLowerCase().trim();
  const childIdsByContent = new Set<string>();
  if (term) {
    const matched: RecordRow[] = [];
    for (const r of allRecords) {
      const haystack = `${r.memo ?? ""} ${r.ai_content ?? ""} ${r.session_ai_content ?? ""}`.toLowerCase();
      if (haystack.includes(term)) {
        matched.push(r);
        childIdsByContent.add(r.child_id);
      }
    }
    allRecords = matched;
  }

  const childsForList = term
    ? allChildren.filter(
        (c) =>
          c.name.toLowerCase().includes(term) || childIdsByContent.has(c.id),
      )
    : allChildren;

  // 사이드 카운트 / 최신 날짜
  const countByChild = new Map<string, { count: number; latest: string | null }>();
  for (const r of allRecords) {
    const s = sessionById.get(r.session_id);
    const cur = countByChild.get(r.child_id) ?? { count: 0, latest: null };
    cur.count++;
    if (s?.date && (!cur.latest || s.date > cur.latest)) cur.latest = s.date;
    countByChild.set(r.child_id, cur);
  }

  const children = childsForList.map((c) => ({
    ...c,
    count: countByChild.get(c.id)?.count ?? 0,
    latest: countByChild.get(c.id)?.latest ?? null,
  }));

  // 사진 수 집계
  const recordIds = allRecords.map((r) => r.id);
  let photoCountByRecord = new Map<string, number>();
  if (recordIds.length > 0) {
    // child_activity_photos 는 session_id+child_id 단위 → record 단위로 매핑
    const { data: photos } = await supabase
      .from("child_activity_photos")
      .select("child_id, session_id")
      .in("session_id", sessionIds);
    const photoCountBySessionChild = new Map<string, number>();
    for (const p of (photos ?? []) as { child_id: string; session_id: string }[]) {
      const k = `${p.session_id}::${p.child_id}`;
      photoCountBySessionChild.set(k, (photoCountBySessionChild.get(k) ?? 0) + 1);
    }
    photoCountByRecord = new Map(
      allRecords.map((r) => [
        r.id,
        photoCountBySessionChild.get(`${r.session_id}::${r.child_id}`) ?? 0,
      ]),
    );
  }

  return { children, records: allRecords, sessionById, photoCountByRecord };
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: {
    role?: string;
    user?: string;
    classroom?: string;
    child?: string;
    q?: string;
    from?: string;
    to?: string;
  };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const search = searchParams?.q?.trim();
  const fromDate = searchParams?.from?.trim();
  const toDate = searchParams?.to?.trim();

  const { children, records, sessionById, photoCountByRecord } = active
    ? await loadData(active.id, search, fromDate, toDate)
    : {
        children: [] as ChildWithCount[],
        records: [] as RecordRow[],
        sessionById: new Map<string, SessionRow>(),
        photoCountByRecord: new Map<string, number>(),
      };

  const selectedChildId =
    searchParams?.child && children.some((c) => c.id === searchParams.child)
      ? searchParams.child
      : children[0]?.id;
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? null;

  const childRecords: RecordEntry[] = selectedChild
    ? records
        .filter((r) => r.child_id === selectedChild.id)
        .map((r) => {
          const s = sessionById.get(r.session_id);
          return {
            ...r,
            date: s?.date ?? r.created_at.slice(0, 10),
            sessionTitle: s?.title ?? null,
            preview: buildPreview(r),
            photoCount: photoCountByRecord.get(r.id) ?? 0,
          };
        })
        .sort((a, b) => (a.date > b.date ? -1 : 1))
    : [];

  const role = searchParams?.role ?? "teacher";
  const baseParams = new URLSearchParams();
  baseParams.set("role", role);
  if (searchParams?.user) baseParams.set("user", searchParams.user);
  if (active) baseParams.set("classroom", active.id);
  const qsBase = baseParams.toString();

  return (
    <main className="container mx-auto pt-8 pb-24 space-y-5">
      {/* 헤더 */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Camera className="h-6 w-6 text-emerald-500" />
            활동 기록
          </h1>
          <HelpCircle className="h-4 w-4 text-slate-300" />
        </div>
        <Link
          href={`/dashboard/activities/new?${qsBase}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <PencilLine className="h-4 w-4" />
          작성하기
        </Link>
      </section>

      {/* 상단 필터 */}
      <form
        action="/dashboard/activities"
        method="GET"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="role" value={role} />
        {searchParams?.user && <input type="hidden" name="user" value={searchParams.user} />}
        {active && <input type="hidden" name="classroom" value={active.id} />}
        {selectedChild && <input type="hidden" name="child" value={selectedChild.id} />}

        <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-sm">
          <Calendar className="h-4 w-4 text-slate-400" />
          <input
            type="date"
            name="from"
            defaultValue={fromDate ?? ""}
            className="h-8 border-0 bg-transparent text-xs focus:outline-none"
          />
          <span className="text-slate-300">~</span>
          <input
            type="date"
            name="to"
            defaultValue={toDate ?? ""}
            className="h-8 border-0 bg-transparent text-xs focus:outline-none"
          />
        </div>

        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />

        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="원아 이름 또는 내용 검색"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
        >
          조회
        </button>

        {(fromDate || toDate || search) && (
          <Link
            href={`/dashboard/activities?${qsBase}${selectedChildId ? `&child=${selectedChildId}` : ""}`}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            초기화
          </Link>
        )}
      </form>

      {/* 본문: 좌 원아 / 우 활동 기록 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* 좌측 원아 리스트 */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-slate-500">
            원아 <strong className="text-slate-900">{children.length}명</strong>
          </p>
          <ul className="mt-2 space-y-0.5">
            {children.length === 0 ? (
              <li className="rounded-md bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
                원아가 없어요
              </li>
            ) : (
              children.map((c) => {
                const selected = c.id === selectedChildId;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/activities?${qsBase}&child=${c.id}${search ? `&q=${encodeURIComponent(search)}` : ""}${fromDate ? `&from=${fromDate}` : ""}${toDate ? `&to=${toDate}` : ""}`}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                        selected
                          ? "bg-sky-50 ring-1 ring-sky-200"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          selected
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.name.slice(0, 1)}
                      </span>
                      <span
                        className={`flex-1 truncate text-sm ${
                          selected ? "font-bold text-sky-700" : "text-slate-700"
                        }`}
                      >
                        {c.name}
                      </span>
                      {c.count > 0 ? (
                        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {c.count > 99 ? "99+" : c.count}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">0</span>
                      )}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* 우측 메인 */}
        <section className="space-y-4">
          {selectedChild ? (
            <>
              {/* 프로필 바 */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 ring-2 ring-emerald-50">
                    {selectedChild.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {selectedChild.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatBirth(selectedChild.birth_date)}{" "}
                      {calcAge(selectedChild.birth_date) && (
                        <span className="ml-1">
                          ({calcAge(selectedChild.birth_date)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    출력 및 다운로드
                  </button>
                  <Link
                    href={`/dashboard/activities/new?${qsBase}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    개별 작성하기
                  </Link>
                </div>
              </div>

              {/* 기록 리스트 */}
              {childRecords.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-500">
                    <Camera className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-700">
                    아직 작성된 활동 기록이 없어요.
                  </p>
                  <Link
                    href={`/dashboard/activities/new?${qsBase}`}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Sparkles className="h-3.5 w-3.5" />첫 활동 기록 작성하기
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {childRecords.map((r) => {
                    const aiSource = r.ai_content?.trim()
                      ? "원아별 AI"
                      : r.session_ai_content?.trim()
                        ? "세션 AI"
                        : null;
                    return (
                      <li
                        key={r.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-slate-900">
                            {formatDotDate(r.date)}
                          </p>
                          {aiSource && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              <Sparkles className="h-2.5 w-2.5" />
                              {aiSource}
                            </span>
                          )}
                          {r.photoCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              <ImageIcon className="h-2.5 w-2.5" />
                              {r.photoCount}
                            </span>
                          )}
                        </div>
                        {r.sessionTitle && (
                          <div className="mt-2">
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              {r.sessionTitle}
                            </span>
                          </div>
                        )}
                        {r.preview ? (
                          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-700">
                            {r.preview}
                          </p>
                        ) : (
                          <p className="mt-3 text-sm italic text-slate-400">
                            (내용 없음)
                          </p>
                        )}
                        {r.memo && r.memo.trim() && (r.ai_content || r.session_ai_content) && (
                          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[10px] font-medium text-slate-500">
                              교사 메모
                            </p>
                            <p className="mt-1 text-xs text-slate-700">{r.memo}</p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-700">
                좌측에서 원아를 선택해주세요.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
