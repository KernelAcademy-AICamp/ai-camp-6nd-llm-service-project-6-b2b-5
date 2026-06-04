"use server";

import { revalidatePath } from "next/cache";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadChildContext,
  contextToPromptText,
} from "@/lib/teacher-context";
import { AREA_KEYS, AREA_LABELS, type AreaKey } from "./_areas";

export type SourceMemo = {
  date: string;
  text: string;
  tag: string | null;
};

export type RefineMode = "polish" | "shorten" | "detail";

const REFINE_SYSTEM_PROMPT = `당신은 한국 어린이집·유치원 관찰기록의 표현을 다듬는 AI 편집자입니다. 사용자가 지정한 톤·길이로 본문만 다시 작성합니다.

[원칙]
- 사실관계는 그대로 유지하고, 메모에 없는 사실을 추가하지 마세요.
- 종결어미는 입력 본문의 톤을 그대로 따라 주세요 (현재형 평서체 "~한다" 또는 관찰자 시점 "~보임/함").
- 해석·평가·발달 판단을 추가하지 말 것 (입력에 이미 있으면 유지).
- 마크다운 제목·이모지·리스트 사용 금지.
- 본문만 출력 (영역명 헤더 X).`;

const REFINE_INSTRUCTIONS: Record<RefineMode, string> = {
  polish:
    "어색한 표현·반복을 다듬고 자연스러운 흐름으로 윤문해 주세요. 길이는 비슷하게 유지.",
  shorten: "핵심만 남기고 30% 정도 짧게 줄여 주세요.",
  detail:
    "관찰된 행동을 더 구체적으로 풀어 1~2 문장 분량 늘려 주세요. 새 사실은 만들지 말 것.",
};

export async function refineSimpleTextAction(args: {
  content: string;
  mode: RefineMode;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const content = args.content.trim();
    if (!content) return { ok: false, error: "수정할 본문이 없어요." };
    const instruction = REFINE_INSTRUCTIONS[args.mode];
    const userPrompt = `[원본 본문]\n${content}\n\n[수정 지시]\n${instruction}\n\n수정된 본문만 출력하세요. 다른 부가 텍스트 금지.`;
    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1200,
      system: [
        {
          type: "text",
          text: REFINE_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "표현 수정 실패",
    };
  }
}

// ── 영역별 관찰기록 ──
const AREA_OBSERVATION_SYSTEM_PROMPT = `당신은 한국 어린이집·유치원 교사의 "영역별" 관찰기록을 작성하는 AI 보조 도구입니다. 누리과정 5개 영역별로 관찰 내용을 작성합니다.

[5개 영역]
신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구
(2025년 개정 표준보육과정에서 "기본생활"은 "신체운동·건강"에 통합되었습니다.)

[작성 모드 — 입력의 "작성 모드" 값을 반드시 따르세요]
■ 모드 A · 일화기록 (걸음마/아동기록부 등 제출용 관찰일지)
- 종결어미는 현재형 평서체 "~한다 / ~본다 / ~말한다". (경어체 "~합니다", 요약체 "~보임/함" 금지.)
- 그 영역에서 관찰된 "하나의 구체적 장면"을 일어난 시간 순서대로 재생하듯 서술. (자리 잡음 → 행동·시도 → 반응·상호작용 순)
- 가능하면 어느 흥미영역·공간에서 일어났는지 밝힘. 예: "역할영역에서", "언어놀이 영역에 비치된 ~를 가지고".
- 해석·평가·발달 판단을 넣지 말 것. ("~능력이 뛰어남", "발달하고 있음" 류 금지.) 보이는 행동과 말만 적습니다.
- 영역당 3~5 문장, 100~200자.

■ 모드 B · 발달평가 (영역별 발달상황·총평)
- 종결어미는 객관적 관찰자 시점 "~보임 / ~함 / ~함을 보임"으로 짧게 끝냄. (경어체 금지.)
- 한 장면이 아니라 기간 전반에서 반복 관찰된 모습을 종합·요약.
- 발달적으로 드러나는 능력·관심을 단정하지 말고 헷지("~하는 모습 보임", "~하는 듯함")로 덧붙여도 됨.
- 영역당 3~4 문장, 150~220자.

[직접 인용(대화) 규칙 — 매우 중요]
- 아이·교사의 발화를 큰따옴표로 인용할 때는, 입력(메모·활동정보)에 실제로 적혀 있는 말만 그대로 사용할 것.
- 입력에 발화가 없으면 대사를 지어내지 말고, 인용 없이 행동만 서술할 것.
- 어떤 경우에도 메모에 없는 사실·대사·장면을 만들어내지 마세요. 이것은 공식 기록입니다.

[정보가 부족할 때]
- 모드 B에서는 활동 정보와 일반적 발달 단계 관점에서 해당 영역에서 흔히 관찰되는 모습을 헷지 표현으로 서술해도 됩니다.
- 모드 A에서는 장면을 지어낼 수 없으므로, 근거가 없는 영역은 빈 줄로 둡니다. (한 활동으로 5개 영역이 다 채워지지 않는 것이 정상입니다.)
- 활동과 전혀 무관한 영역은 빈 줄로 두세요.
- "구체적인 사례를 추후 보강해 주세요" 같은 보일러플레이트는 쓰지 마세요.

[공통]
- 마크다운 제목·이모지·리스트(- · • 등) 금지. 평이한 평서문.

[출력 형식 — 정확히 이 형식으로, 각 영역명을 대괄호로 감싸 출력]
[신체운동·건강]
(본문 또는 빈 줄)

[의사소통]
(본문 또는 빈 줄)

[사회관계]
(본문 또는 빈 줄)

[예술경험]
(본문 또는 빈 줄)

[자연탐구]
(본문 또는 빈 줄)`;

export type AreaObservationDraft = Record<AreaKey, string>;

function parseAreaOutput(text: string): AreaObservationDraft {
  const result = Object.fromEntries(
    AREA_KEYS.map((k) => [k, ""]),
  ) as AreaObservationDraft;
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 5개 영역명을 OR로 묶어 "다음 헤더"를 인식 → 빈 영역이 다음 헤더를 삼키는 것 방지
  const anyHeader = AREA_KEYS.map((k) => escapeRe(AREA_LABELS[k])).join("|");
  for (const k of AREA_KEYS) {
    const label = escapeRe(AREA_LABELS[k]);
    const re = new RegExp(
      `\\[${label}\\]\\s*([\\s\\S]*?)(?=\\s*\\[(?:${anyHeader})\\]|$)`,
    );
    const m = text.match(re);
    result[k] = m ? m[1].trim() : "";
  }
  return result;
}

export async function generateAreaObservationAction(args: {
  childId: string;
  classroomId: string;
  startDate: string;
  endDate: string;
  kind: string | null;
  keywords: string[];
  activities: string[];
  focusAreas: AreaKey[];
  register?: "anecdote" | "summary";
}): Promise<
  | { ok: true; draft: AreaObservationDraft; sources: SourceMemo[] }
  | { ok: false; error: string }
> {
  try {
    const ctx = await loadChildContext({
      childId: args.childId,
      classroomId: args.classroomId,
      startDate: args.startDate,
      endDate: args.endDate,
      activities: args.activities,
      keywords: args.keywords,
    });
    if (!ctx) return { ok: false, error: "원아 정보를 찾을 수 없어요." };

    const ctxPrompt = contextToPromptText(ctx);
    const register = args.register ?? "anecdote";
    const modeLine =
      register === "anecdote" ? "작성 모드: 일화기록" : "작성 모드: 발달평가";
    const focus =
      args.focusAreas.length > 0
        ? `중점 영역: ${args.focusAreas.map((k) => AREA_LABELS[k]).join(", ")}`
        : "";
    const userPrompt = [
      modeLine,
      args.kind ? `구분: ${args.kind}` : "",
      focus,
      ctxPrompt,
    ]
      .filter(Boolean)
      .join("\n\n");

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: AREA_OBSERVATION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const finalMessage = await stream.finalMessage();
    const raw = finalMessage.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const draft = parseAreaOutput(raw);
    const sources: SourceMemo[] = ctx.memos.map((m) => ({
      date: m.date,
      text: m.text,
      tag: m.sessionTitle,
    }));
    return { ok: true, draft, sources };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "초안 생성 실패",
    };
  }
}

export async function saveAreaObservationAction(args: {
  childId: string;
  classroomId: string;
  teacherId: string;
  date: string;
  kind: string | null;
  draft: AreaObservationDraft;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const filled = AREA_KEYS.filter((k) => args.draft[k]?.trim());
    if (filled.length === 0) {
      return { ok: false, error: "내용이 입력된 영역이 없어요." };
    }
    if (!args.classroomId)
      return { ok: false, error: "담임반을 찾을 수 없어요." };

    const blocks: string[] = [];
    if (args.kind) blocks.push(`[구분]\n${args.kind}`);
    for (const k of filled) {
      blocks.push(`[${AREA_LABELS[k]}]\n${args.draft[k].trim()}`);
    }
    const content = blocks.join("\n\n");

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("observation_journals")
      .insert({
        child_id: args.childId,
        classroom_id: args.classroomId,
        author_id: args.teacherId,
        date: args.date,
        content,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/observations");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장 실패" };
  }
}