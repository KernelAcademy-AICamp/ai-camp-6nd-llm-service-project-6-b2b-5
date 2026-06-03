import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { NoteForm, type ChildOption } from "./_form";

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

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const children = active ? await loadChildren(active.id) : [];

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex justify-end">
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </div>
      <NoteForm
        childOptions={children}
        qs={qs}
        teacherId={teacherId}
        classroomId={active?.id ?? ""}
      />
    </main>
  );
}
