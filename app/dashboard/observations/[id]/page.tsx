import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Activity,
  MessageCircle,
  Users,
  Palette,
  Leaf,
  Sparkles,
  FileText,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const AREA_LABEL_LIST = [
  "신체운동·건강",
  "의사소통",
  "사회관계",
  "예술경험",
  "자연탐구",
] as const;

const AREA_ICONS: Record<string, typeof Activity> = {
  "신체운동·건강": Activity,
  의사소통: MessageCircle,
  사회관계: Users,
  예술경험: Palette,
  자연탐구: Leaf,
  // 옛 데이터 호환
  기본생활: Activity,
};

function block(raw: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`);
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

function parseObservationContent(raw: string): {
  kind: string | null;
  areas: Array<{ label: string; text: string }>;
  rest: string;
} {
  const kind = block(raw, "구분") || null;

  // 본문에 등장한 모든 [영역] 헤더를 추출 (현재 5개 + 옛 기본생활)
  const allLabels = [...AREA_LABEL_LIST, "기본생활"];
  const areas = allLabels
    .map((label) => ({ label, text: block(raw, label) }))
    .filter((a) => a.text);

  // 영역 외에 분류되지 않은 본문 — fallback
  const rest = areas.length === 0 && !kind ? raw.trim() : "";

  return { kind, areas, rest };
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return `만 ${age}세`;
}

function formatKoDate(d: string) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}월 ${day}일 ${weekday}요일`;
}

async function loadDetail(id: string) {
  const supabase = createAdminClient();

  const { data: journal } = await supabase
    .from("observation_journals")
    .select(
      "id, child_id, classroom_id, author_id, date, content, ai_generated_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!journal) return null;

  const [{ data: child }, { data: classroom }, { data: author }] = await Promise.all([
    supabase
      .from("children")
      .select("name, birth_date, gender")
      .eq("id", journal.child_id)
      .maybeSingle(),
    supabase
      .from("classrooms")
      .select("name")
      .eq("id", journal.classroom_id)
      .maybeSingle(),
    journal.author_id
      ? supabase
          .from("profiles")
          .select("name")
          .eq("id", journal.author_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    journal,
    childName: child?.name ?? "(원아 없음)",
    childBirth: child?.birth_date ?? null,
    classroomName: classroom?.name ?? "",
    authorName: author?.name ?? "교사",
  };
}

export default async function ObservationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { role?: string; user?: string };
}) {
  const data = await loadDetail(params.id);
  if (!data) notFound();

  const { journal, childName, childBirth, classroomName, authorName } = data;
  const parsed = parseObservationContent(journal.content);

  const role = searchParams?.role ?? "teacher";
  const backParams = new URLSearchParams();
  backParams.set("role", role);
  if (searchParams?.user) backParams.set("user", searchParams.user);
  const backQs = backParams.toString();

  return (
    <main className="container mx-auto max-w-3xl pt-8 pb-24 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/observations?${backQs}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          관찰기록 목록
        </Link>
        {journal.ai_generated_at && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
            <Sparkles className="h-3 w-3" />
            AI 생성
          </span>
        )}
      </div>

      {/* 본문 카드 */}
      <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700 ring-2 ring-emerald-50">
              {childName.slice(0, 1)}
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                {childName}의 관찰기록
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatKoDate(journal.date)}
                </span>
                {classroomName && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{classroomName}</span>
                  </>
                )}
                {childBirth && calcAge(childBirth) && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{calcAge(childBirth)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {parsed.kind && (
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
              {parsed.kind}
            </span>
          )}
        </header>

        {/* 영역별 본문 */}
        {parsed.areas.length > 0 ? (
          <div className="space-y-3">
            {parsed.areas.map((a) => {
              const Icon = AREA_ICONS[a.label] ?? FileText;
              return (
                <div
                  key={a.label}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/40 px-4 py-2">
                    <Icon className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-900">
                      {a.label}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-slate-800">
                    {a.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          // 영역 구조가 없는 옛 데이터 — 본문 그대로
          <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
            {parsed.rest || journal.content}
          </p>
        )}

        <footer className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
            {authorName.slice(0, 1)}
          </span>
          <span>{authorName} 교사</span>
          <span className="ml-auto">
            {journal.created_at?.slice(0, 10).replace(/-/g, ".")}
          </span>
        </footer>
      </article>
    </main>
  );
}
