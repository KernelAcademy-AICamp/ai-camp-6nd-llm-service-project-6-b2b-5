import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import {
  ActivityRecordForm,
  type ChildOption,
  type StepNumber,
} from "./_form";

export const dynamic = "force-dynamic";

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

function parseStep(raw: string | undefined): StepNumber {
  const n = parseInt(raw ?? "1", 10);
  return n === 2 ? 2 : 1;
}

export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; step?: string; classroom?: string };
}) {
  const initialStep = parseStep(searchParams?.step);
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
      <ActivityRecordForm
        childOptions={children}
        classroomName={active?.name ?? "담당 반 없음"}
        classroomId={active?.id ?? ""}
        teacherId={teacherId}
        backHref={`/dashboard${qs}`}
        todayMemoHref={`/dashboard/today-memo${qs}`}
        initialStep={initialStep}
      />
    </main>
  );
}
