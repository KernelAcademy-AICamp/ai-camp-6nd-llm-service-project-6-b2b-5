import Link from "next/link";
import {
  BookOpen,
  PencilLine,
  Search,
  Printer,
  Sparkles,
  HelpCircle,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { JournalActions } from "./_journal-actions";

export const dynamic = "force-dynamic";

type JournalRow = {
  id: string;
  child_id: string;
  classroom_id: string;
  author_id: string | null;
  date: string;
  content: string;
  ai_generated_at: string | null;
  created_at: string;
};

type ChildRow = {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
};

type JournalEntry = JournalRow & {
  preview: string;
  kind: string | null;
  areas: string[];
  authorName: string;
};

type ChildWithCount = ChildRow & { count: number; latest: string | null };

const AREA_LABEL_LIST = [
  "신체운동·건강",
  "의사소통",
  "사회관계",
  "예술경험",
  "자연탐구",
] as const;

function block(raw: string, label: string): string {
  const re = new RegExp(`\\[${label}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`);
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

function parseContent(raw: string): {
  preview: string;
  kind: string | null;
  areas: string[];
} {
  const areaTexts = AREA_LABEL_LIST.map((label) => block(raw, label)).filter(Boolean);
  let preview =
    areaTexts.length > 0
      ? areaTexts.join(" ")
      : block(raw, "관찰 내용") || raw.trim();
  preview = preview
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[·■]\s*[^\n]+\n?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  const kind = block(raw, "구분") || null;

  const areasBlock = block(raw, "누리과정 영역") || block(raw, "표준보육과정 영역");
  const areas = areasBlock
    ? areasBlock
        .split("\n")
        .map((l) => l.replace(/^[-•·*]\s*/, "").trim())
        .filter(Boolean)
    : AREA_LABEL_LIST.filter((label) => block(raw, label));

  return { preview, kind, areas };
}

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

async function loadData(
  classroomId: string,
  search: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<{ children: ChildWithCount[]; journals: JournalRow[] }> {
  const supabase = createAdminClient();
  let q = supabase
    .from("observation_journals")
    .select(
      "id, child_id, classroom_id, author_id, date, content, ai_generated_at, created_at",
    )
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(500);
  if (startDate) q = q.gte("date", startDate);
  if (endDate) q = q.lte("date", endDate);

  const [{ data: childRows }, { data: journalRows }] = await Promise.all([
    supabase
      .from("children")
      .select("id, name, birth_date, gender")
      .eq("classroom_id", classroomId)
      .order("name"),
    q,
  ]);

  const allChildren = (childRows ?? []) as ChildRow[];
  const allJournals = (journalRows ?? []) as JournalRow[];

  // 검색: 원아 이름 매칭 + 내용 매칭 (둘 중 하나라도)
  const term = search?.toLowerCase().trim();
  const childIdsByContent = new Set<string>();
  let filteredJournals = allJournals;
  if (term) {
    filteredJournals = allJournals.filter((j) =>
      (j.content ?? "").toLowerCase().includes(term),
    );
    for (const j of filteredJournals) childIdsByContent.add(j.child_id);
  }

  const all = term
    ? allChildren.filter(
        (c) =>
          c.name.toLowerCase().includes(term) || childIdsByContent.has(c.id),
      )
    : allChildren;

  // 사이드바 카운트는 "필터된 결과 기준"으로 — 검색어 적용 시 매칭된 건수만 노출
  const countByChild = new Map<string, { count: number; latest: string | null }>();
  for (const j of filteredJournals) {
    const cur = countByChild.get(j.child_id) ?? { count: 0, latest: null };
    cur.count++;
    if (!cur.latest || j.date > cur.latest) cur.latest = j.date;
    countByChild.set(j.child_id, cur);
  }

  const children = all.map((c) => ({
    ...c,
    count: countByChild.get(c.id)?.count ?? 0,
    latest: countByChild.get(c.id)?.latest ?? null,
  }));

  return { children, journals: filteredJournals };
}

export default async function ObservationsPage({
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

  const { children, journals } = active
    ? await loadData(active.id, search, fromDate, toDate)
    : { children: [] as ChildWithCount[], journals: [] as JournalRow[] };

  const selectedChildId =
    searchParams?.child && children.some((c) => c.id === searchParams.child)
      ? searchParams.child
      : children[0]?.id;
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? null;

  // 작성자 이름 일괄 조회
  const authorIds = Array.from(
    new Set(journals.map((j) => j.author_id).filter(Boolean) as string[]),
  );
  let authorNameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const supabase = createAdminClient();
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    authorNameById = new Map(
      ((authors ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
    );
  }

  const childJournals: JournalEntry[] = selectedChild
    ? journals
        .filter((j) => j.child_id === selectedChild.id)
        .map((j) => ({
          ...j,
          ...parseContent(j.content),
          authorName: (j.author_id && authorNameById.get(j.author_id)) || "교사",
        }))
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
            <BookOpen className="h-6 w-6 text-emerald-500" />
            관찰기록
          </h1>
          <HelpCircle className="h-4 w-4 text-slate-300" />
        </div>
        <Link
          href={`/dashboard/observations/new?${qsBase}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <PencilLine className="h-4 w-4" />
          작성하기
        </Link>
      </section>

      {/* 상단 필터 (기간/반/검색) */}
      <form
        action="/dashboard/observations"
        method="GET"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="role" value={role} />
        {searchParams?.user && <input type="hidden" name="user" value={searchParams.user} />}
        {active && <input type="hidden" name="classroom" value={active.id} />}
        {selectedChild && (
          <input type="hidden" name="child" value={selectedChild.id} />
        )}

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
            href={`/dashboard/observations?${qsBase}${selectedChildId ? `&child=${selectedChildId}` : ""}`}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            초기화
          </Link>
        )}
      </form>

      {/* 본문: 좌 원아 리스트 / 우 선택 원아 관찰기록 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* 좌측: 원아 리스트 */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="border-b border-slate-100 pb-2">
            <select
              disabled
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500"
            >
              <option>전체 보기</option>
            </select>
          </div>
          <p className="mt-3 text-xs font-medium text-slate-500">
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
                      href={`/dashboard/observations?${qsBase}&child=${c.id}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
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

        {/* 우측: 선택 원아 관찰기록 */}
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
                        <span className="ml-1">({calcAge(selectedChild.birth_date)})</span>
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
                    href={`/dashboard/observations/new?${qsBase}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    개별 작성하기
                  </Link>
                </div>
              </div>

              {/* 관찰기록 리스트 */}
              {childJournals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-500">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-700">
                    아직 작성된 관찰기록이 없어요.
                  </p>
                  <Link
                    href={`/dashboard/observations/new?${qsBase}`}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Sparkles className="h-3.5 w-3.5" />첫 관찰기록 작성하기
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {childJournals.map((j) => (
                    <li
                      key={j.id}
                      className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                    >
                      <div className="absolute right-3 top-3">
                        <JournalActions
                          id={j.id}
                          date={j.date}
                          childId={j.child_id}
                          children={children.map((c) => ({
                            id: c.id,
                            name: c.name,
                          }))}
                        />
                      </div>
                      <Link
                        href={`/dashboard/observations/${j.id}?${qsBase}`}
                        className="group block"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-slate-900">
                            {formatDotDate(j.date)}
                          </p>
                          {j.ai_generated_at && (
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
                              N
                            </span>
                          )}
                        </div>
                        {j.kind && (
                          <div className="mt-2">
                            <span className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                              {j.kind}
                            </span>
                          </div>
                        )}
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-700">
                          {j.preview}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                            {j.authorName.slice(0, 1)}
                          </span>
                          <span className="text-xs text-slate-600">
                            {j.authorName}
                          </span>
                          {j.areas.length > 0 && (
                            <span className="ml-auto flex flex-wrap items-center gap-1">
                              {j.areas.slice(0, 3).map((a) => (
                                <span
                                  key={a}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                >
                                  {a}
                                </span>
                              ))}
                              {j.areas.length > 3 && (
                                <span className="text-[10px] text-slate-400">
                                  +{j.areas.length - 3}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
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
