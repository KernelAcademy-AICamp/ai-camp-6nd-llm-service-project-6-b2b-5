import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { NoteForm, type ChildOption, type ActivityOption } from "./_form";

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

async function loadRecentActivities(classroomId: string): Promise<ActivityOption[]> {
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

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const [children, activities] = active
    ? await Promise.all([loadChildren(active.id), loadRecentActivities(active.id)])
    : [[] as ChildOption[], [] as ActivityOption[]];

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-6">
      <div className="flex justify-start">
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </div>
      <NoteForm
        childOptions={children}
        qs={qs}
        teacherId={teacherId}
        classroomId={active?.id ?? ""}
        activities={activities}
      />
    </main>
  );
}
