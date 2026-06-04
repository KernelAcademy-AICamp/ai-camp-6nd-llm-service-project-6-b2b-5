import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTemperamentByName,
  type Temperament,
  type Sensitivity,
} from "@/lib/children-profiles";

// ?user= 미지정 시 기본 교사 페르소나 (이교사)
export const DEFAULT_TEACHER_ID = "00000000-0000-0000-0000-000000000002";

export type ClassRole = "lead" | "assistant";
export type MyClassroom = { id: string; name: string; role: ClassRole };

// 교사 ID로 담당 반 전체를 조회. 주담임(lead)을 앞에, 부담임(assistant)을 뒤에 정렬.
export async function loadMyClassrooms(
  teacherId: string,
): Promise<MyClassroom[]> {
  const supabase = createAdminClient();

  const { data: links } = await supabase
    .from("staff_classrooms")
    .select("classroom_id, role_in_class")
    .eq("staff_id", teacherId);
  if (!links || links.length === 0) return [];

  const ids = links.map((l) => l.classroom_id);
  const { data: rooms } = await supabase
    .from("classrooms")
    .select("id, name")
    .in("id", ids);
  const nameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const result: MyClassroom[] = links.map((l) => ({
    id: l.classroom_id,
    name: nameById.get(l.classroom_id) ?? "(이름 없음)",
    role: l.role_in_class === "lead" ? "lead" : "assistant",
  }));

  // 주담임(lead) 먼저
  result.sort((a, b) =>
    a.role === b.role ? 0 : a.role === "lead" ? -1 : 1,
  );
  return result;
}

// 활성 반 결정: ?classroom= 가 담당 반에 속하면 그 반, 아니면 첫 반(주담임).
export function resolveActiveClassroom(
  classrooms: MyClassroom[],
  requestedId: string | undefined,
): MyClassroom | null {
  if (classrooms.length === 0) return null;
  if (requestedId) {
    const found = classrooms.find((c) => c.id === requestedId);
    if (found) return found;
  }
  return classrooms[0];
}

export type ChildContextPayload = {
  child: { id: string; name: string };
  classroom: { id: string; name: string };
  period: { start: string; end: string };
  activities: string[]; // selected filter
  keywords: string[];
  memos: Array<{ date: string; text: string; sessionTitle: string | null }>;
  // 활동 분석 — ai_content(원아별 1순위) → session_ai_content(세션 단위 2순위)
  analyses: Array<{
    date: string;
    text: string;
    sessionTitle: string | null;
    source: "ai_content" | "session_ai_content";
  }>;
  sessionTitles: string[]; // sessions found in period
  temperament: Temperament | null; // 원아 기질 5칼럼 (이름 매핑)
  sensitivity: Sensitivity | null; // 기질 예민도 상/중/하
};

export async function loadChildContext(args: {
  childId: string;
  classroomId: string;
  startDate: string;
  endDate: string;
  activities: string[];
  keywords: string[];
}): Promise<ChildContextPayload | null> {
  const supabase = createAdminClient();

  const { data: myClass } = await supabase
    .from("classrooms")
    .select("id, name")
    .eq("id", args.classroomId)
    .maybeSingle();
  if (!myClass) return null;

  const { data: child } = await supabase
    .from("children")
    .select("id, name")
    .eq("id", args.childId)
    .eq("classroom_id", myClass.id)
    .maybeSingle();
  if (!child) return null;

  // 기간 내 세션
  const { data: sessions } = await supabase
    .from("activity_sessions")
    .select("id, title, date")
    .eq("classroom_id", myClass.id)
    .gte("date", args.startDate)
    .lte("date", args.endDate);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const titleByDate = new Map<string, string | null>();
  for (const s of sessions ?? []) titleByDate.set(s.date, s.title);

  // 활동 필터가 비어있지 않으면 그 활동만
  const sessionIdsFiltered =
    args.activities.length > 0
      ? (sessions ?? [])
          .filter((s) => s.title && args.activities.includes(s.title))
          .map((s) => s.id)
      : sessionIds;

  // 해당 원아의 활동 기록 — memo + ai_content + session_ai_content
  const { data: records } = sessionIdsFiltered.length
    ? await supabase
        .from("activity_records")
        .select("memo, ai_content, session_ai_content, created_at, session_id")
        .eq("child_id", args.childId)
        .in("session_id", sessionIdsFiltered)
        .order("created_at", { ascending: true })
    : {
        data: [] as Array<{
          memo: string | null;
          ai_content: string | null;
          session_ai_content: string | null;
          created_at: string;
          session_id: string;
        }>,
      };

  const sessionMetaById = new Map(
    (sessions ?? []).map((s) => [s.id, s]),
  );

  const allRecords = (records ?? []) as Array<{
    memo: string | null;
    ai_content: string | null;
    session_ai_content: string | null;
    created_at: string;
    session_id: string;
  }>;

  // 한 줄 메모 (기존)
  const memos = allRecords
    .filter((r): r is typeof r & { memo: string } => !!r.memo)
    .map((r) => {
      const s = sessionMetaById.get(r.session_id);
      return {
        date: s?.date ?? r.created_at.slice(0, 10),
        text: r.memo,
        sessionTitle: s?.title ?? null,
      };
    });

  // 활동 분석 — ai_content(1순위) → session_ai_content(2순위)
  const analyses: Array<{
    date: string;
    text: string;
    sessionTitle: string | null;
    source: "ai_content" | "session_ai_content";
  }> = [];
  for (const r of allRecords) {
    const text = r.ai_content?.trim() || r.session_ai_content?.trim();
    if (!text) continue;
    const s = sessionMetaById.get(r.session_id);
    analyses.push({
      date: s?.date ?? r.created_at.slice(0, 10),
      text,
      sessionTitle: s?.title ?? null,
      source: r.ai_content?.trim() ? "ai_content" : "session_ai_content",
    });
  }

  const sessionTitles = Array.from(
    new Set(
      (sessions ?? [])
        .map((s) => s.title)
        .filter((t): t is string => !!t),
    ),
  );

  // 원아 이름으로 기질·예민도 매핑 (관찰일지 AI 반영용)
  const temperamentInfo = getTemperamentByName(child.name);

  return {
    child: { id: child.id, name: child.name },
    classroom: { id: myClass.id, name: myClass.name },
    period: { start: args.startDate, end: args.endDate },
    activities: args.activities,
    keywords: args.keywords,
    memos,
    analyses,
    sessionTitles,
    temperament: temperamentInfo?.temperament ?? null,
    sensitivity: temperamentInfo?.sensitivity ?? null,
  };
}

export function contextToPromptText(
  ctx: ChildContextPayload,
  opts?: { includeTemperament?: boolean },
): string {
  const parts: string[] = [];
  parts.push(`원아: ${ctx.child.name} (${ctx.classroom.name})`);
  parts.push(`기간: ${ctx.period.start} ~ ${ctx.period.end}`);
  parts.push(
    `선택된 주요 활동: ${ctx.activities.length > 0 ? ctx.activities.join(", ") : "전체"}`,
  );
  if (ctx.keywords.length > 0) {
    parts.push(`반영 키워드: ${ctx.keywords.join(", ")}`);
  }

  // 기질 블록 — 관찰일지 등에서만 옵션으로 주입(알림장 기본 미포함)
  if (opts?.includeTemperament && ctx.temperament) {
    const t = ctx.temperament;
    parts.push(
      [
        `\n[원아 기질 — 행동 해석의 보조 참고]`,
        `· 활동성: ${t.활동성}`,
        `· 사회성: ${t.사회성}`,
        `· 정서성: ${t.정서성}`,
        `· 적응성: ${t.적응성}`,
        `· 자기조절: ${t.자기조절}`,
        ctx.sensitivity ? `· 기질 예민도: ${ctx.sensitivity}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  // 활동 분석 — ai_content(원아별, 1순위) → session_ai_content(세션 단위, 2순위)
  // 1순위가 있으면 그것만 사용, 없을 때만 2순위 사용
  const perChildAnalyses = ctx.analyses.filter((a) => a.source === "ai_content");
  const sessionAnalyses = ctx.analyses.filter(
    (a) => a.source === "session_ai_content",
  );
  const activeAnalyses =
    perChildAnalyses.length > 0 ? perChildAnalyses : sessionAnalyses;

  if (activeAnalyses.length > 0) {
    const label =
      perChildAnalyses.length > 0
        ? `\n[기간 내 활동 분석 ${activeAnalyses.length}건 — 원아별 AI 기록]`
        : `\n[기간 내 활동 분석 ${activeAnalyses.length}건 — 세션 단위 AI 기록]`;
    parts.push(label);
    for (const a of activeAnalyses) {
      parts.push(
        `- ${a.date}${a.sessionTitle ? ` (${a.sessionTitle})` : ""}:\n${a.text}`,
      );
    }
  }

  if (ctx.memos.length > 0) {
    parts.push(`\n[기간 내 한 줄 메모 ${ctx.memos.length}건]`);
    for (const m of ctx.memos) {
      parts.push(
        `- ${m.date}${m.sessionTitle ? ` (${m.sessionTitle})` : ""}: ${m.text}`,
      );
    }
  } else if (activeAnalyses.length === 0) {
    parts.push(
      `\n[기간 내 한 줄 메모·활동 분석이 없음 — 일반적인 톤으로 초안 생성하되, "구체적인 사례를 추후 보강해 주세요"라는 안내를 자연스럽게 녹이세요.]`,
    );
  }
  return parts.join("\n");
}
