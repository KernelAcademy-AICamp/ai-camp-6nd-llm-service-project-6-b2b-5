import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { ChildActivityRecordForm } from "./_form";
import type { ChildOption } from "../activities/new/_form";
import { getMockSessionData } from "@/mocks";

export const dynamic = "force-dynamic";

type LoadedSession = { id: string; title: string | null };
type ChildPhoto = { url: string; order_num: number };

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadChildren(classroomId: string): Promise<ChildOption[]> {
  const supabase = createAdminClient();
  const { data: children } = await supabase
    .from("children")
    .select("id, name, gender, privacy_agreed_at, status")
    .eq("classroom_id", classroomId)
    .neq("status", "graduated")
    .order("name");
  return (children ?? []) as ChildOption[];
}

async function loadTodaySession(
  classroomId: string,
  date: string,
): Promise<LoadedSession | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("activity_sessions")
    .select("id, title")
    .eq("classroom_id", classroomId)
    .eq("date", date)
    .maybeSingle();
  return (data as LoadedSession | null) ?? null;
}

async function loadSessionAiContent(sessionId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("activity_records")
    .select("session_ai_content")
    .eq("session_id", sessionId)
    .not("session_ai_content", "is", null)
    .limit(1)
    .maybeSingle();
  return (data?.session_ai_content as string | undefined) ?? null;
}

async function loadChildPhotos(
  sessionId: string,
): Promise<Record<string, ChildPhoto[]>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("child_activity_photos")
    .select("child_id, order_num, files ( url )")
    .eq("session_id", sessionId)
    .order("order_num");

  const result: Record<string, ChildPhoto[]> = {};
  for (const row of (data ?? []) as Array<{
    child_id: string;
    order_num: number;
    files: { url: string }[] | { url: string } | null;
  }>) {
    const file = Array.isArray(row.files) ? row.files[0] : row.files;
    const url = file?.url;
    if (!url) continue;
    (result[row.child_id] ??= []).push({ url, order_num: row.order_num });
  }
  return result;
}

export default async function ActivityRecordsPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string; mock?: string };
}) {
  const useMock = searchParams?.mock === "1";
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = useMock ? [] : await loadMyClassrooms(teacherId);
  const active = useMock
    ? null
    : resolveActiveClassroom(classrooms, searchParams?.classroom);

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  if (useMock) params.set("mock", "1");
  const qs = `?${params.toString()}`;

  if (useMock) {
    const mock = getMockSessionData();
    return (
      <main className="container mx-auto py-10 space-y-6">
        <div className="flex items-center justify-end gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700">
            MOCK 모드
          </span>
        </div>
        <ChildActivityRecordForm
          childOptions={mock.children}
          classroomName="무지개반 (mock)"
          backHref={`/dashboard/activities/new${qs}`}
          todayMemoHref={`/dashboard/today-memo${qs}`}
          dashboardHref={`/dashboard${qs}`}
          sessionTitle={mock.session.title}
          sessionAiContent={mock.session.session_ai_content}
          sessionKeywords={mock.session.keywords}
          childPhotos={mock.childPhotos}
        />
      </main>
    );
  }

  const today = todayDateString();
  const children = active ? await loadChildren(active.id) : [];
  const session = active ? await loadTodaySession(active.id, today) : null;
  const [sessionAiContent, childPhotos] = session
    ? await Promise.all([
        loadSessionAiContent(session.id),
        loadChildPhotos(session.id),
      ])
    : [null, {} as Record<string, ChildPhoto[]>];

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex justify-end">
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </div>
      <ChildActivityRecordForm
        childOptions={children}
        classroomName={active?.name ?? "담당 반 없음"}
        backHref={`/dashboard/activities/new${qs}`}
        todayMemoHref={`/dashboard/today-memo${qs}`}
        dashboardHref={`/dashboard${qs}`}
        sessionTitle={session?.title ?? null}
        sessionAiContent={sessionAiContent}
        sessionKeywords={[]}
        childPhotos={childPhotos}
      />
    </main>
  );
}
