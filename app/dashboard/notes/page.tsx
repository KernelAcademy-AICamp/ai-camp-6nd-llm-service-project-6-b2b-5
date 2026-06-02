import Link from "next/link";
import { MessageSquare, FileText, ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

async function loadData(classroomId: string) {
  const supabase = createAdminClient();

  const { data: notes } = await supabase
    .from("daily_notes")
    .select("id, child_id, date, content, status, is_read, created_at")
    .eq("classroom_id", classroomId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20);

  const [{ count: draftCount }, { count: publishedCount }] = await Promise.all([
    supabase
      .from("daily_notes")
      .select("*", { count: "exact", head: true })
      .eq("classroom_id", classroomId)
      .eq("status", "draft"),
    supabase
      .from("daily_notes")
      .select("*", { count: "exact", head: true })
      .eq("classroom_id", classroomId)
      .eq("status", "published"),
  ]);

  const childIds = Array.from(new Set((notes ?? []).map((n) => n.child_id)));
  const { data: childrenRows } = childIds.length
    ? await supabase.from("children").select("id, name").in("id", childIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const childNameById = new Map((childrenRows ?? []).map((c) => [c.id, c.name]));

  return {
    notes: notes ?? [],
    draftCount: draftCount ?? 0,
    publishedCount: publishedCount ?? 0,
    childNameById,
  };
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { notes, draftCount, publishedCount, childNameById } = active
    ? await loadData(active.id)
    : { notes: [], draftCount: 0, publishedCount: 0, childNameById: new Map<string, string>() };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">알림장</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            우리 반 알림장
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
          <Link
            href={`/dashboard/notes/drafts${qs}`}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
          >
            임시보관함 {draftCount > 0 && `(${draftCount})`}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="발행됨" value={publishedCount} tone="emerald" />
        <Stat label="임시저장" value={draftCount} tone="amber" />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="mb-3 text-sm font-bold">최근 발행 알림장</p>
        {notes.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            아직 발행된 알림장이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {childNameById.get(n.child_id) ?? "(원아 없음)"}
                    </p>
                    <span className="text-xs text-slate-400">{n.date}</span>
                    {n.is_read ? (
                      <Badge variant="success" className="text-[10px]">읽음</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">미열람</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {n.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber";
}) {
  const toneMap = {
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
  } as const;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneMap[tone].split(" ")[0]}`}>
        {value}
        <span className="ml-0.5 text-sm font-normal text-slate-400">건</span>
      </p>
    </div>
  );
}
