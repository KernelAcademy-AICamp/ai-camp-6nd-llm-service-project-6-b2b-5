import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TEACHER_ID, loadMyClassrooms } from "@/lib/teacher-context";
import {
  ActivityListClient,
  type SessionRow,
  type ChildRecordRow,
} from "./_list";

export const dynamic = "force-dynamic";

type RecordRow = {
  session_id: string;
  child_id: string;
  memo: string | null;
  session_ai_content: string | null;
  ai_content: string | null;
  updated_at: string;
};
type SessionDb = {
  id: string;
  classroom_id: string;
  date: string;
  title: string | null;
};

/** session_ai_content 텍스트의 "[키워드] a, b" 줄에서 키워드 파싱 */
function parseKeywords(content: string | null): string[] {
  if (!content) return [];
  const line = content.split("\n").find((l) => l.startsWith("[키워드]"));
  if (!line) return [];
  return line
    .replace("[키워드]", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function ActivityListPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const role = searchParams?.role ?? "teacher";
  const classrooms = await loadMyClassrooms(teacherId);
  const classroomIds = classrooms.map((c) => c.id);
  const classroomName = new Map(classrooms.map((c) => [c.id, c.name]));

  const supabase = createAdminClient();
  let sessions: SessionRow[] = [];
  const childRecords: ChildRecordRow[] = [];

  if (classroomIds.length > 0) {
    const [{ data: sess }, { data: kids }] = await Promise.all([
      supabase
        .from("activity_sessions")
        .select("id, classroom_id, date, title")
        .in("classroom_id", classroomIds)
        .order("date", { ascending: false }),
      supabase.from("children").select("id, name").in("classroom_id", classroomIds),
    ]);
    const sessionList = (sess ?? []) as SessionDb[];
    const childName = new Map(
      ((kids ?? []) as { id: string; name: string }[]).map((k) => [k.id, k.name]),
    );
    const sessionIds = sessionList.map((s) => s.id);

    let records: RecordRow[] = [];
    let photos: { session_id: string; child_id: string }[] = [];
    if (sessionIds.length > 0) {
      const [{ data: recs }, { data: caps }] = await Promise.all([
        supabase
          .from("activity_records")
          .select(
            "session_id, child_id, memo, session_ai_content, ai_content, updated_at",
          )
          .in("session_id", sessionIds),
        supabase
          .from("child_activity_photos")
          .select("session_id, child_id")
          .in("session_id", sessionIds),
      ]);
      records = (recs ?? []) as RecordRow[];
      photos = (caps ?? []) as { session_id: string; child_id: string }[];
    }

    const photoBySession = new Map<string, number>();
    const photoBySessionChild = new Map<string, number>();
    for (const p of photos) {
      photoBySession.set(p.session_id, (photoBySession.get(p.session_id) ?? 0) + 1);
      const k = `${p.session_id}|${p.child_id}`;
      photoBySessionChild.set(k, (photoBySessionChild.get(k) ?? 0) + 1);
    }
    const recordsBySession = new Map<string, RecordRow[]>();
    for (const r of records) {
      const arr = recordsBySession.get(r.session_id) ?? [];
      arr.push(r);
      recordsBySession.set(r.session_id, arr);
    }

    // 전체 보기 — 세션 단위
    sessions = sessionList.map((s) => {
      const recs = recordsBySession.get(s.id) ?? [];
      return {
        id: s.id,
        date: s.date,
        classroomId: s.classroom_id,
        classroomName: classroomName.get(s.classroom_id) ?? "반",
        title: s.title ?? "(제목 없음)",
        keywords: parseKeywords(recs[0]?.session_ai_content ?? null),
        childCount: recs.length,
        photoCount: photoBySession.get(s.id) ?? 0,
      };
    });

    // 원아별 보기 — (세션, 원아) 단위
    const sessionMeta = new Map(sessionList.map((s) => [s.id, s]));
    for (const r of records) {
      const s = sessionMeta.get(r.session_id);
      if (!s) continue;
      childRecords.push({
        childId: r.child_id,
        childName: childName.get(r.child_id) ?? "원아",
        date: s.date,
        classroomId: s.classroom_id,
        classroomName: classroomName.get(s.classroom_id) ?? "반",
        title: s.title ?? "(제목 없음)",
        memo: r.ai_content ?? r.memo ?? "",
        keywords: parseKeywords(r.session_ai_content),
        photoCount: photoBySessionChild.get(`${r.session_id}|${r.child_id}`) ?? 0,
      });
    }
    childRecords.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const params = new URLSearchParams();
  params.set("role", role);
  if (searchParams?.user) params.set("user", searchParams.user);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <ActivityListClient
        sessions={sessions}
        childRecords={childRecords}
        classrooms={classrooms.map((c) => ({ id: c.id, name: c.name }))}
        writeHref={`/dashboard/activities/new${qs}`}
      />
    </main>
  );
}
