import Link from "next/link";
import { BookOpen, FileText, Plus, Sparkles } from "lucide-react";
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

  const { data: journals } = await supabase
    .from("observation_journals")
    .select("id, child_id, date, content, ai_generated_at, created_at")
    .eq("classroom_id", classroomId)
    .order("date", { ascending: false })
    .limit(30);

  const childIds = Array.from(new Set((journals ?? []).map((j) => j.child_id)));
  const { data: childrenRows } = childIds.length
    ? await supabase.from("children").select("id, name").in("id", childIds)
    : { data: [] as Array<{ id: string; name: string }> };

  return {
    journals: journals ?? [],
    childNameById: new Map((childrenRows ?? []).map((c) => [c.id, c.name])),
  };
}

export default async function ObservationsPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string; classroom?: string };
}) {
  const teacherId = searchParams?.user ?? DEFAULT_TEACHER_ID;
  const classrooms = await loadMyClassrooms(teacherId);
  const active = resolveActiveClassroom(classrooms, searchParams?.classroom);
  const { journals, childNameById } = active
    ? await loadData(active.id)
    : { journals: [], childNameById: new Map<string, string>() };

  const params = new URLSearchParams();
  params.set("role", searchParams?.role ?? "teacher");
  if (searchParams?.user) params.set("user", searchParams.user);
  if (active) params.set("classroom", active.id);
  const qs = `?${params.toString()}`;

  return (
    <main className="container mx-auto pt-10 pb-24 space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">또랑 · 관찰일지</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-emerald-500" />
            관찰일지
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            누리과정 영역별 발달 관찰 기록 — 교사 전용
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClassroomSwitcher classrooms={classrooms} activeId={active?.id ?? ""} />
          <Link
            href={`/dashboard/observations/new${qs}`}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            관찰일지 작성
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        {journals.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-500">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">
              아직 작성된 관찰일지가 없어요.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              원아의 활동 기록과 한 줄 메모를 바탕으로 AI 초안을 만들 수 있어요.
            </p>
            <Link
              href={`/dashboard/observations/new${qs}`}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              첫 관찰일지 작성하기
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {journals.map((j) => (
              <li key={j.id} className="flex items-start gap-3 py-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {childNameById.get(j.child_id) ?? "(원아 없음)"}
                    </p>
                    <span className="text-xs text-slate-400">{j.date}</span>
                    {j.ai_generated_at && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        AI
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {j.content}
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
