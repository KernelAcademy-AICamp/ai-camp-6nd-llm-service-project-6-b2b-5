import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  Calendar,
  ImageIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TEACHER_ID } from "@/lib/teacher-context";
import { CommentsSection, type CommentItem } from "./_comments";

export const dynamic = "force-dynamic";

type Mood = "great" | "good" | "fair" | "poor" | null;

const MOOD_META: Record<
  Exclude<Mood, null>,
  { Icon: typeof Sun; tone: string; label: string }
> = {
  great: { Icon: Sun, tone: "text-amber-500", label: "매우 좋음" },
  good: { Icon: CloudSun, tone: "text-sky-500", label: "좋음" },
  fair: { Icon: Cloud, tone: "text-slate-400", label: "보통" },
  poor: { Icon: CloudRain, tone: "text-slate-500", label: "안 좋음" },
};

const ROLE_LABEL: Record<string, string> = {
  teacher: "교사",
  director: "원장",
  parent: "학부모",
  admin: "관리자",
};

function formatKoDate(d: string) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}월 ${day}일 ${weekday}요일`;
}

function parseContent(raw: string): {
  body: string;
  life: { key: string; value: string }[];
  detail: { key: string; value: string }[];
} {
  const lifeIdx = raw.indexOf("\n\n[생활기록]");
  const detailIdx = raw.indexOf("\n\n[상세입력]");
  const cutAt = [lifeIdx, detailIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const body = cutAt !== undefined ? raw.slice(0, cutAt).trim() : raw.trim();

  function parseBlock(label: string) {
    const i = raw.indexOf(`[${label}]`);
    if (i < 0) return [];
    const after = raw.slice(i + label.length + 2);
    const end = after.search(/\n\[[^\]]+\]/);
    const block = end >= 0 ? after.slice(0, end) : after;
    return block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("•"))
      .map((line) => {
        const m = line.match(/^•\s*([^:]+):\s*(.+)$/);
        return m ? { key: m[1].trim(), value: m[2].trim() } : null;
      })
      .filter((x): x is { key: string; value: string } => x !== null);
  }

  return { body, life: parseBlock("생활기록"), detail: parseBlock("상세입력") };
}

async function loadDetail(noteId: string) {
  const supabase = createAdminClient();

  const { data: note } = await supabase
    .from("daily_notes")
    .select(
      "id, child_id, classroom_id, author_id, date, content, mood, status, is_read, created_at",
    )
    .eq("id", noteId)
    .maybeSingle();

  if (!note) return null;

  const [{ data: child }, { data: classroom }, { data: author }, photos] =
    await Promise.all([
      supabase.from("children").select("name").eq("id", note.child_id).maybeSingle(),
      supabase
        .from("classrooms")
        .select("name")
        .eq("id", note.classroom_id)
        .maybeSingle(),
      note.author_id
        ? supabase.from("profiles").select("name").eq("id", note.author_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("note_photos")
        .select("order_num, files(url)")
        .eq("note_id", noteId)
        .order("order_num"),
    ]);

  // 댓글: 테이블이 아직 없을 수도 있어 안전하게 처리
  let comments: CommentItem[] = [];
  try {
    const { data: rows } = await supabase
      .from("note_comments")
      .select("id, author_id, author_name, content, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: true });
    comments = (rows ?? []) as CommentItem[];
  } catch {
    // 마이그레이션 미적용 — 빈 배열 유지
  }

  const photoUrls = ((photos.data ?? []) as Array<{
    order_num: number;
    files: { url: string } | { url: string }[] | null;
  }>)
    .map((p) => {
      const f = Array.isArray(p.files) ? p.files[0] : p.files;
      return f?.url ?? null;
    })
    .filter((u): u is string => !!u);

  return {
    note,
    childName: child?.name ?? "(원아 없음)",
    classroomName: classroom?.name ?? "",
    authorName: author?.name ?? "교사",
    photos: photoUrls,
    comments,
  };
}

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { role?: string; user?: string };
}) {
  const data = await loadDetail(params.id);
  if (!data) notFound();

  const { note, childName, classroomName, authorName, photos, comments } = data;
  const { body, life, detail } = parseContent(note.content);
  const mood = note.mood ? MOOD_META[note.mood as Exclude<Mood, null>] : null;

  const role = searchParams?.role ?? "teacher";
  const viewerId = searchParams?.user ?? DEFAULT_TEACHER_ID;

  // 댓글 작성자 표시명 — teacher 면 author 이름, parent 면 학부모, 그 외 역할명
  const supabase = createAdminClient();
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", viewerId)
    .maybeSingle();
  const viewerName =
    viewerProfile?.name ?? (role === "parent" ? "학부모" : ROLE_LABEL[role] ?? "사용자");

  const backParams = new URLSearchParams();
  backParams.set("role", role);
  if (searchParams?.user) backParams.set("user", searchParams.user);
  const backQs = backParams.toString();

  return (
    <main className="container mx-auto max-w-3xl pt-8 pb-24 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/notes?${backQs}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          알림장 내용
        </Link>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            note.status === "published"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
          }`}
        >
          {note.status === "published" ? "발송됨" : "임시저장"}
        </span>
      </div>

      {/* 본문 카드 */}
      <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              {formatKoDate(note.date)}
            </div>
            <h1 className="mt-1.5 text-lg font-bold tracking-tight text-slate-900">
              {childName}의 알림장
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {classroomName} · 작성자 {authorName}
            </p>
          </div>
          {mood && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs">
              <mood.Icon className={`h-4 w-4 ${mood.tone}`} />
              <span className="font-medium text-slate-700">{mood.label}</span>
            </div>
          )}
        </header>

        {/* 사진 갤러리 */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((url, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-lg bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                {i === 0 && photos.length > 1 && (
                  <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <ImageIcon className="h-2.5 w-2.5" />
                    {photos.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 본문 */}
        <div className="space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {body.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* 생활기록 */}
        {life.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-700">생활기록</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
              {life.map((row, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{row.key}</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 상세입력 */}
        {detail.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-700">상세입력</p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
              {detail.map((row, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-16 shrink-0 text-slate-500">{row.key}</span>
                  <span className="flex-1 text-slate-700">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
            {authorName.slice(0, 1)}
          </span>
          <span>
            {authorName} {ROLE_LABEL.teacher}
          </span>
          <span className="ml-auto">
            {note.created_at?.slice(0, 10).replace(/-/g, ".")}
          </span>
        </footer>
      </article>

      {/* 댓글 */}
      <CommentsSection
        noteId={note.id}
        comments={comments}
        viewer={{ id: viewerId, name: viewerName, role }}
      />
    </main>
  );
}
