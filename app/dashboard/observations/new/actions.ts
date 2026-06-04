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

const OBSERVATION_SYSTEM_PROMPT = `당신은 한국 유치원 교사의 관찰기록 초안을 작성하는 AI 보조 도구입니다. 누리과정 5개 영역(신체운동·건강 / 의사소통 / 사회관계 / 예술경험 / 자연탐구) 각각에 대해 관찰한 내용을 작성하고, 더불어 **누적 분석**(행동 패턴 / 발달 흐름)도 함께 제공합니다.

[관찰 작성 원칙]
- 객관적 관찰 사실 중심. "~한 모습이 관찰됨", "~하는 모습을 보임" 같은 관찰자 시점
- 영역별 2~4 문장, 영역당 80~150자 분량
- 한 줄 메모와 활동 내용을 영역에 자연스럽게 분류하여 반영
- 메모에 없는 사실을 추측해 만들지 말 것. 메모가 적은 영역은 일반적 발달 단계 관찰 톤으로 작성하되 과장 금지
- 평이한 평서문. 마크다운/이모지/리스트 금지

[누적 분석 원칙]
- behavior_pattern: 메모 전반에서 반복되는 행동 패턴을 2~3 문장으로 요약
- developmental_trend: 기간 흐름에 따른 발달의 흐름·변화를 2~3 문장으로 요약
- 메모 부족 시 "관찰된 사례가 충분치 않습니다"로 시작하는 짧은 안내

[원아 기질 반영 원칙]
- [원아 기질] 정보가 제공되면, 관찰된 행동을 그 기질의 맥락에서 해석한다.
  (예: 예민도가 높은 아이의 위축은 기질적 특성으로 이해하고, 강점·지원 방향을 함께 제시)
- 단, 기질로 행동을 단정하거나 낙인(산만함·문제행동 등)하지 않는다. 관찰 사실이 우선이며 기질은 해석의 보조로만 쓴다.
- 기질 정보가 없으면 기질을 언급하지 않는다.

[출력]
지정된 JSON 스키마로만 응답.`;

const REFINE_AREA_SYSTEM_PROMPT = `당신은 한국 유치원 관찰기록의 표현을 영역별로 다듬는 AI 편집자입니다. 사용자가 지정한 톤·길이로 해당 영역 본문만 다시 작성합니다.

[원칙]
- 사실관계 유지, 추측·과장 금지
- "~한 모습이 관찰됨" 객관적 관찰 톤 유지
- 80~150자 내외
- 마크다운/이모지/리스트 금지
- 영역 본문만 출력 (영역명 헤더 X)`;

const OBSERVATION_SCHEMA = {
  type: "object" as const,
  properties: {
    physical_health: { type: "string" as const },
    communication: { type: "string" as const },
    social: { type: "string" as const },
    artistic: { type: "string" as const },
    nature: { type: "string" as const },
    behavior_pattern: { type: "string" as const, description: "반복 관찰된 행동 패턴 요약" },
    developmental_trend: { type: "string" as const, description: "기간 흐름에 따른 발달 흐름 요약" },
  },
  required: [
    "physical_health",
    "communication",
    "social",
    "artistic",
    "nature",
    "behavior_pattern",
    "developmental_trend",
  ],
  additionalProperties: false,
};

export type ObservationDraft = Record<AreaKey, string> & {
  behavior_pattern: string;
  developmental_trend: string;
};

export async function generateObservationDraftAction(args: {
  childId: string;
  classroomId: string;
  startDate: string;
  endDate: string;
  areas: AreaKey[];
  keywords: string[];
}): Promise<
  | { ok: true; draft: ObservationDraft; sources: SourceMemo[] }
  | { ok: false; error: string }
> {
  try {
    const ctx = await loadChildContext({ ...args, activities: [] });
    if (!ctx) return { ok: false, error: "원아 정보를 찾을 수 없어요." };

    const focusAreas =
      args.areas.length > 0
        ? args.areas.map((k) => AREA_LABELS[k]).join(", ")
        : "전체 5개 영역";

    const userPrompt =
      contextToPromptText(ctx, { includeTemperament: true }) +
      `\n\n[중점 영역] ${focusAreas}` +
      (args.keywords.length > 0 ? `\n[강조할 키워드] ${args.keywords.join(", ")}` : "");

    const client = getAnthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2400,
      output_config: {
        format: { type: "json_schema", schema: OBSERVATION_SCHEMA },
      },
      system: [
        { type: "text", text: OBSERVATION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const jsonText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const parsed = JSON.parse(jsonText) as ObservationDraft;

    const sources: SourceMemo[] = ctx.memos.map((m) => ({
      date: m.date,
      text: m.text,
      tag: m.sessionTitle,
    }));

    return { ok: true, draft: parsed, sources };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "초안 생성 실패" };
  }
}

const REFINE_MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  polish: "어색한 표현·반복을 다듬고 자연스러운 흐름으로 윤문해 주세요. 길이는 유지.",
  shorten: "핵심만 남기고 30% 정도 짧게 줄여 주세요.",
  detail: "관찰된 행동을 더 구체적으로 묘사해 한두 문장 보강해 주세요.",
};

export type RefineMode = "polish" | "shorten" | "detail";

export async function refineObservationAreaAction(args: {
  area: AreaKey;
  content: string;
  mode: RefineMode;
}): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    if (!args.content.trim()) return { ok: false, error: "수정할 내용이 없어요." };

    const userPrompt = `[영역] ${AREA_LABELS[args.area]}\n[원본]\n${args.content}\n\n[수정 지시]\n${REFINE_MODE_INSTRUCTIONS[args.mode]}`;

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: REFINE_AREA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const final = await stream.finalMessage();
    const content = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "표현 수정 실패" };
  }
}

export async function saveObservationAction(args: {
  childId: string;
  classroomId: string;
  teacherId: string;
  endDate: string;
  draft: ObservationDraft;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const sections = [
      "[누적 분석]",
      `· 행동 패턴: ${args.draft.behavior_pattern.trim()}`,
      `· 발달 흐름: ${args.draft.developmental_trend.trim()}`,
      "",
      ...AREA_KEYS.map(
        (k) => `■ ${AREA_LABELS[k]}\n${args.draft[k].trim()}`,
      ),
    ];
    const content = sections.join("\n\n");
    if (content.trim().length === 0) {
      return { ok: false, error: "내용이 비어있어요." };
    }
    if (!args.classroomId) {
      return { ok: false, error: "담임반을 찾을 수 없어요." };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("observation_journals")
      .insert({
        child_id: args.childId,
        classroom_id: args.classroomId,
        author_id: args.teacherId,
        date: args.endDate,
        content,
        ai_generated_at: new Date().toISOString(),
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
