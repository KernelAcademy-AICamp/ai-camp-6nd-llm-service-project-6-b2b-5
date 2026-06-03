import { createAdminClient } from "@/lib/supabase/admin";

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
  sessionTitles: string[]; // sessions found in period
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

  // 해당 원아의 메모
  const { data: records } = sessionIdsFiltered.length
    ? await supabase
        .from("activity_records")
        .select("memo, created_at, session_id")
        .eq("child_id", args.childId)
        .in("session_id", sessionIdsFiltered)
        .not("memo", "is", null)
        .order("created_at", { ascending: true })
    : { data: [] as Array<{ memo: string | null; created_at: string; session_id: string }> };

  const sessionMetaById = new Map(
    (sessions ?? []).map((s) => [s.id, s]),
  );

  const memos = (records ?? [])
    .filter((r): r is { memo: string; created_at: string; session_id: string } => !!r.memo)
    .map((r) => {
      const s = sessionMetaById.get(r.session_id);
      return {
        date: s?.date ?? r.created_at.slice(0, 10),
        text: r.memo,
        sessionTitle: s?.title ?? null,
      };
    });

  const sessionTitles = Array.from(
    new Set(
      (sessions ?? [])
        .map((s) => s.title)
        .filter((t): t is string => !!t),
    ),
  );

  return {
    child: { id: child.id, name: child.name },
    classroom: { id: myClass.id, name: myClass.name },
    period: { start: args.startDate, end: args.endDate },
    activities: args.activities,
    keywords: args.keywords,
    memos,
    sessionTitles,
  };
}

export function contextToPromptText(ctx: ChildContextPayload): string {
  const parts: string[] = [];
  parts.push(`원아: ${ctx.child.name} (${ctx.classroom.name})`);
  parts.push(`기간: ${ctx.period.start} ~ ${ctx.period.end}`);
  parts.push(
    `선택된 주요 활동: ${ctx.activities.length > 0 ? ctx.activities.join(", ") : "전체"}`,
  );
  if (ctx.keywords.length > 0) {
    parts.push(`반영 키워드: ${ctx.keywords.join(", ")}`);
  }
  if (ctx.memos.length > 0) {
    parts.push(`\n[기간 내 한 줄 메모 ${ctx.memos.length}건]`);
    for (const m of ctx.memos) {
      parts.push(
        `- ${m.date}${m.sessionTitle ? ` (${m.sessionTitle})` : ""}: ${m.text}`,
      );
    }
  } else {
    parts.push(
      `\n[기간 내 한 줄 메모가 없음 — 일반적인 알림장 톤으로 초안 생성하되, "구체적인 사례를 추후 보강해 주세요"라는 안내를 자연스럽게 녹이세요.]`,
    );
  }
  return parts.join("\n");
}
