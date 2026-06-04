import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import {
  ObservationForm,
  type ChildOption,
  type PullItem,
  type ActivityOption,
} from "./_form";

export const dynamic = "force-dynamic";

async function loadChildren(classroomId: string): Promise<ChildOption[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("children")
    .select("id, name")
    .eq("classroom_id", classroomId)
    .eq("status", "active")
    .order("name");
  return (data ?? []) as ChildOption[];
}

async function loadRecentJournals(classroomId: string): Promise<PullItem[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("observation_journals")
    .select("id, child_id, date, content")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(20);
  return ((data ?? []) as Array<{
    id: string;
    child_id: string;
    date: string;
    content: string;
  }>).map((j) => ({
    id: j.id,
    kind: "journal" as const,
    childId: j.child_id,
    date: j.date,
    summary: j.content.split(/\n\s*\n/)[0].replace(/^\[[^\]]+\]\s*/, "").slice(0, 80),
    body: j.content,
  }));
}

async function loadRecentActivities(
  classroomId: string,
): Promise<ActivityOption[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("activity_sessions")
    .select("id, date, title")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(60);
  return ((data ?? []) as Array<{ id: string; date: string; title: string | null }>)
    .filter((s): s is { id: string; date: string; title: string } => !!s.title)
    .map((s) => ({ id: s.id, date: s.date, title: s.title }));
}

async function loadRecentMemos(classroomId: string): Promise<PullItem[]> {
  const supabase = createAdminClient();
  const { data: sessions } = await supabase
    .from("activity_sessions")
    .select("id, date, title")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(30);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data: records } = await supabase
    .from("activity_records")
    .select("id, child_id, memo, session_id")
    .in("session_id", sessionIds)
    .not("memo", "is", null)
    .limit(30);

  const sessionMeta = new Map(
    (sessions ?? []).map((s) => [s.id, s] as const),
  );

  return ((records ?? []) as Array<{
    id: string;
    child_id: string;
    memo: string | null;
    session_id: string;
  }>)
    .filter(
      (r): r is { id: string; child_id: string; memo: string; session_id: string } =>
        !!r.memo,
    )
    .map((r) => {
      const s = sessionMeta.get(r.session_id);
      return {
        id: r.id,
        kind: "memo" as const,
        childId: r.child_id,
        date: s?.date ?? "",
        summary: `${s?.title ?? "활동"}: ${r.memo}`,
        body: r.memo,
      };
    });
}

export default async function NewObservationPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const [children, journals, memos, activities] = active
    ? await Promise.all([
        loadChildren(active.id),
        loadRecentJournals(active.id),
        loadRecentMemos(active.id),
        loadRecentActivities(active.id),
      ])
    : [
        [] as ChildOption[],
        [] as PullItem[],
        [] as PullItem[],
        [] as ActivityOption[],
      ];

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto pt-8 pb-24 space-y-5">
      <div className="flex justify-start">
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </div>
      <ObservationForm
        childOptions={children}
        qs={qs}
        teacherId={teacherId}
        classroomId={active?.id ?? ""}
        pullItems={[...memos, ...journals]}
        activities={activities}
      />
    </main>
  );
}
