import Link from "next/link";
import {
  MessageSquare,
  Users,
  PencilLine,
  ImageIcon,
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
  LayoutGrid,
  List,
  Filter,
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
import { NoteActions } from "./_note-actions";

export const dynamic = "force-dynamic";

type Mood = "great" | "good" | "fair" | "poor" | null;

type NoteRow = {
  id: string;
  child_id: string;
  classroom_id: string;
  author_id: string | null;
  date: string;
  content: string;
  mood: Mood;
  is_read: boolean;
  created_at: string;
};

type ChildOpt = { id: string; name: string };

type NoteCard = NoteRow & {
  childName: string;
  authorName: string;
  classroomName: string;
  photoUrl: string | null;
  photoCount: number;
};

const MOOD_META: Record<Exclude<Mood, null>, { Icon: typeof Sun; tone: string; label: string }> = {
  great: { Icon: Sun, tone: "text-amber-500", label: "매우 좋음" },
  good: { Icon: CloudSun, tone: "text-sky-500", label: "좋음" },
  fair: { Icon: Cloud, tone: "text-slate-400", label: "보통" },
  poor: { Icon: CloudRain, tone: "text-slate-500", label: "안 좋음" },
};

function formatKoDate(d: string) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}월 ${day}일 ${weekday}요일`;
}

async function loadNotes(
  classroomId: string,
  filters: { childId?: string; date?: string; mine?: boolean; teacherId: string },
): Promise<{ notes: NoteCard[]; classroomChildren: ChildOpt[]; classroomName: string }> {
  const supabase = createAdminClient();

  const [{ data: noteRows }, { data: classChildren }, { data: classroom }] = await Promise.all([
    (() => {
      let q = supabase
        .from("daily_notes")
        .select(
          "id, child_id, classroom_id, author_id, date, content, mood, is_read, created_at",
        )
        .eq("classroom_id", classroomId)
        .eq("status", "published")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (filters.childId) q = q.eq("child_id", filters.childId);
      if (filters.date) q = q.eq("date", filters.date);
      if (filters.mine) q = q.eq("author_id", filters.teacherId);
      return q;
    })(),
    supabase
      .from("children")
      .select("id, name")
      .eq("classroom_id", classroomId)
      .order("name"),
    supabase.from("classrooms").select("name").eq("id", classroomId).maybeSingle(),
  ]);

  const all = (noteRows ?? []) as NoteRow[];
  const children = (classChildren ?? []) as ChildOpt[];
  const childNameById = new Map(children.map((c) => [c.id, c.name]));

  if (all.length === 0) {
    return {
      notes: [],
      classroomChildren: children,
      classroomName: classroom?.name ?? "",
    };
  }

  const authorIds = Array.from(new Set(all.map((n) => n.author_id).filter(Boolean) as string[]));
  const noteIds = all.map((n) => n.id);

  const [{ data: authors }, { data: photos }] = await Promise.all([
    authorIds.length
      ? supabase.from("profiles").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from("note_photos")
      .select("note_id, order_num, files(url)")
      .in("note_id", noteIds)
      .order("order_num"),
  ]);

  const authorNameById = new Map(
    ((authors ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
  );

  const firstPhotoByNote = new Map<string, string>();
  const countByNote = new Map<string, number>();
  for (const p of (photos ?? []) as Array<{
    note_id: string;
    order_num: number;
    files: { url: string } | { url: string }[] | null;
  }>) {
    const file = Array.isArray(p.files) ? p.files[0] : p.files;
    countByNote.set(p.note_id, (countByNote.get(p.note_id) ?? 0) + 1);
    if (!firstPhotoByNote.has(p.note_id) && file?.url) {
      firstPhotoByNote.set(p.note_id, file.url);
    }
  }

  const notes: NoteCard[] = all.map((n) => ({
    ...n,
    childName: childNameById.get(n.child_id) ?? "(원아 없음)",
    authorName: (n.author_id && authorNameById.get(n.author_id)) || "교사",
    classroomName: classroom?.name ?? "",
    photoUrl: firstPhotoByNote.get(n.id) ?? null,
    photoCount: countByNote.get(n.id) ?? 0,
  }));

  return { notes, classroomChildren: children, classroomName: classroom?.name ?? "" };
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: {
    role?: string;
    user?: string;
    classroom?: string;
    child?: string;
    date?: string;
    mine?: string;
    view?: "card" | "list";
  };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const view = searchParams?.view === "list" ? "list" : "card";
  const childFilter = searchParams?.child?.trim();
  const dateFilter = searchParams?.date?.trim();
  const mineFilter = searchParams?.mine === "1";

  const { notes, classroomChildren } = active
    ? await loadNotes(active.id, {
        childId: childFilter,
        date: dateFilter,
        mine: mineFilter,
        teacherId,
      })
    : { notes: [] as NoteCard[], classroomChildren: [] as ChildOpt[] };

  const role = searchParams?.role ?? "teacher";
  const baseParams = new URLSearchParams();
  baseParams.set("role", role);
  if (searchParams?.user) baseParams.set("user", searchParams.user);
  if (active) baseParams.set("classroom", active.id);
  const qsBase = baseParams.toString();

  const hasFilter = Boolean(childFilter || dateFilter || mineFilter);

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-6">
      {/* 상단 헤더 */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            알림장
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            우리 반 학부모님께 발송된 알림장 목록입니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
          <Link
            href={`/dashboard/notes/new?${qsBase}&multi=1`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <Users className="h-4 w-4" />
            여러명 보내기
          </Link>
          <Link
            href={`/dashboard/notes/new?${qsBase}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <PencilLine className="h-4 w-4" />
            작성하기
          </Link>
        </div>
      </section>

      {/* 필터 */}
      <form
        action="/dashboard/notes"
        method="GET"
        className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
      >
        <input type="hidden" name="role" value={role} />
        {searchParams?.user && <input type="hidden" name="user" value={searchParams.user} />}
        {active && <input type="hidden" name="classroom" value={active.id} />}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Filter className="h-4 w-4" />
            필터
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs">
            <Link
              href={`/dashboard/notes?${qsBase}${hasFilter ? `&${new URLSearchParams({ ...(childFilter && { child: childFilter }), ...(dateFilter && { date: dateFilter }), ...(mineFilter && { mine: "1" }) }).toString()}` : ""}&view=card`}
              className={`flex items-center gap-1 px-3 py-1.5 ${view === "card" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              카드
            </Link>
            <Link
              href={`/dashboard/notes?${qsBase}${hasFilter ? `&${new URLSearchParams({ ...(childFilter && { child: childFilter }), ...(dateFilter && { date: dateFilter }), ...(mineFilter && { mine: "1" }) }).toString()}` : ""}&view=list`}
              className={`flex items-center gap-1 border-l border-slate-200 px-3 py-1.5 ${view === "list" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              <List className="h-3.5 w-3.5" />
              목록
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            name="child"
            defaultValue={childFilter ?? ""}
            className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-emerald-400 focus:outline-none"
          >
            <option value="">전체 원아</option>
            {classroomChildren.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              name="date"
              defaultValue={dateFilter ?? ""}
              className="h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={mineFilter}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            내가 작성한 글
          </label>
          {searchParams?.view && (
            <input type="hidden" name="view" value={view} />
          )}
          <button
            type="submit"
            className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            적용
          </button>
          {hasFilter && (
            <Link
              href={`/dashboard/notes?${qsBase}${searchParams?.view ? `&view=${view}` : ""}`}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* 게시물 그리드 / 목록 */}
      {notes.length === 0 ? (
        <section className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-sm font-medium text-slate-700">알림장이 없어요.</p>
          <p className="mt-1 text-xs text-slate-500">
            {hasFilter ? "필터 조건과 일치하는 게시물이 없습니다." : "아직 발송된 알림장이 없어요."}
          </p>
        </section>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((n) => (
            <NoteCardItem
              key={n.id}
              note={n}
              qsBase={qsBase}
              childOptions={classroomChildren}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="relative">
                <Link
                  href={`/dashboard/notes/${n.id}?${qsBase}`}
                  className="flex items-start gap-3 p-4 pr-14 hover:bg-slate-50"
                >
                  <div className="w-24 shrink-0 text-xs">
                    <p className="font-medium text-slate-900">{formatKoDate(n.date)}</p>
                    <p className="mt-0.5 text-slate-500">{n.childName}</p>
                  </div>
                  <p className="min-w-0 flex-1 line-clamp-2 text-sm text-slate-700">
                    {n.content}
                  </p>
                  {n.photoUrl && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {n.photoCount}
                    </span>
                  )}
                </Link>
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <NoteActions
                    id={n.id}
                    date={n.date}
                    childId={n.child_id}
                    childOptions={classroomChildren}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function NoteCardItem({
  note,
  qsBase,
  childOptions,
}: {
  note: NoteCard;
  qsBase: string;
  childOptions: ChildOpt[];
}) {
  const mood = note.mood ? MOOD_META[note.mood] : null;
  return (
    <div className="relative h-full">
      <div className="absolute right-2 top-2 z-10">
        <NoteActions
          id={note.id}
          date={note.date}
          childId={note.child_id}
          childOptions={childOptions}
        />
      </div>
      <Link
        href={`/dashboard/notes/${note.id}?${qsBase}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
      >
      {note.photoUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={note.photoUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
          {note.photoCount > 1 && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <ImageIcon className="h-3 w-3" />
              {note.photoCount}
            </span>
          )}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-4">
        <div className={`flex items-center justify-between gap-2 ${note.photoUrl ? "" : "pr-8"}`}>
          <p className="text-xs font-bold text-slate-900">{formatKoDate(note.date)}</p>
          {mood && <mood.Icon className={`h-4 w-4 ${mood.tone}`} aria-label={mood.label} />}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {note.childName}
          {note.classroomName ? <span className="mx-1 text-slate-300">|</span> : null}
          {note.classroomName}
        </p>
        <p
          className={`mt-2 text-xs leading-relaxed text-slate-700 ${
            note.photoUrl ? "line-clamp-2" : "line-clamp-6"
          }`}
        >
          {note.content}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-slate-500">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
            {note.authorName.slice(0, 1)}
          </span>
          <span>{note.authorName} 교사</span>
          {note.is_read ? (
            <span className="ml-auto rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              읽음
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              미열람
            </span>
          )}
        </div>
      </div>
      </Link>
    </div>
  );
}
