import Link from "next/link";
import { FileText, MessageSquare } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEACHER_ID,
  loadMyClassrooms,
  resolveActiveClassroom,
} from "@/lib/teacher-context";
import { ClassroomSwitcher } from "@/components/teacher/classroom-switcher";

export const dynamic = "force-dynamic";

async function loadData(classroomId: string) {
  const supabase = createAdminClient();

  const { data: drafts } = await supabase
    .from("daily_notes")
    .select("id, child_id, date, content, updated_at")
    .eq("classroom_id", classroomId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false });

  const childIds = Array.from(new Set((drafts ?? []).map((d) => d.child_id)));
  const { data: childrenRows } = childIds.length
    ? await supabase.from("children").select("id, name").in("id", childIds)
    : { data: [] as Array<{ id: string; name: string }> };

  return {
    drafts: drafts ?? [],
    childNameById: new Map((childrenRows ?? []).map((c) => [c.id, c.name])),
  };
}

function buildEditQs(
  searchParams: { role?: string; user?: string; classroom?: string },
  active: { id: string } | null,
  draftId: string,
): string {
  const p = new URLSearchParams();
  p.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) p.set("user", searchParams.user);
  if (active) p.set("classroom", active.id);
  p.set("draft", draftId);
  return `/dashboard/notes/new?${p.toString()}`;
}

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { drafts, childNameById } = active
    ? await loadData(active.id)
    : { drafts: [], childNameById: new Map<string, string>() };

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">알림장 · 임시보관함</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            임시저장된 알림장
          </h1>
        </div>
        <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        {drafts.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            임시저장된 알림장이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {childNameById.get(d.child_id) ?? "(원아 없음)"}
                    </p>
                    <span className="text-xs text-slate-400">{d.date}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {d.content || "(내용 없음)"}
                  </p>
                </div>
                <Link
                  href={buildEditQs(searchParams, active, d.id)}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  이어 쓰기
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
