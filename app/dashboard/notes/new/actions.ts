"use server";

import { revalidatePath } from "next/cache";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadChildContext,
  contextToPromptText,
} from "@/lib/teacher-context";

export type SourceMemo = {
  date: string;
  text: string;
  tag: string | null;
};

const NOTE_SYSTEM_PROMPT = `당신은 한국의 유치원 담임교사가 학부모님께 보내는 \"알림장\" 초안을 작성하는 AI 보조 도구입니다.

[작성 원칙]
- 학부모님께 직접 말하듯 따뜻한 1인칭(저, 선생님은…) 톤으로 작성
- 4~6개 단락, 총 300~500자 분량
- 한 줄 메모와 활동 정보를 자연스럽게 엮어서 구체적 사례 중심으로 서술
- 마지막 단락은 가정과의 협력 제안 또는 격려의 한 문장으로 마무리
- 추측·과장 금지. 메모에 없는 사실을 만들어내지 말 것
- 메모가 없으면 일반적인 톤으로 작성하되 "사례를 추후 보강해 주세요" 안내 포함

[출력 형식]
- 본문만 출력 (제목·인사말 헤더·요약 박스 등은 출력하지 말 것)
- 마크다운/이모지/리스트 사용 금지. 평이한 줄바꿈만 사용`;

const REFINE_SYSTEM_PROMPT = `당신은 한국 유치원 알림장의 표현을 다듬는 AI 편집자입니다. 사용자가 지정한 톤·길이로 본문을 다시 작성합니다.

[원칙]
- 원본 본문의 사실관계는 그대로 유지
- 추측·과장 금지
- 마크다운/이모지/리스트 사용 금지. 평이한 줄바꿈만 사용
- 본문만 출력`;

export async function generateNoteDraftAction(args: {
  childId: string;
  classroomId: string;
  startDate: string;
  endDate: string;
  activities: string[];
  keywords: string[];
}): Promise<
  | { ok: true; draft: string; sources: SourceMemo[] }
  | { ok: false; error: string }
> {
  try {
    const ctx = await loadChildContext(args);
    if (!ctx) return { ok: false, error: "원아 정보를 찾을 수 없어요." };

    const userPrompt = contextToPromptText(ctx);
    const client = getAnthropic();

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: NOTE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const finalMessage = await stream.finalMessage();
    const draft = finalMessage.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const sources: SourceMemo[] = ctx.memos.map((m) => ({
      date: m.date,
      text: m.text,
      tag: m.sessionTitle,
    }));

    return { ok: true, draft, sources };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "초안 생성 실패" };
  }
}

const REFINE_MODE_INSTRUCTIONS: Record<RefineMode, string> = {
  polish: "어색한 표현·반복을 다듬고, 자연스러운 흐름으로 윤문해 주세요. 길이는 비슷하게 유지.",
  shorten: "핵심만 남기고 30% 정도 짧게 줄여 주세요.",
  warmer: "더 따뜻하고 공감 어린 어조로 다시 작성해 주세요. 학부모와의 정서적 연결을 강화.",
  formal: "조금 더 공식적이고 정중한 어조로 다시 작성해 주세요. 격식 있는 표현 사용.",
};

export type RefineMode = "polish" | "shorten" | "warmer" | "formal";

export async function refineNoteAction(args: {
  content: string;
  mode: RefineMode;
}): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    if (!args.content.trim()) return { ok: false, error: "수정할 본문이 없어요." };

    const instruction = REFINE_MODE_INSTRUCTIONS[args.mode];
    const userPrompt = `[원본 본문]\n${args.content}\n\n[수정 지시]\n${instruction}`;

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: REFINE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const final = await stream.finalMessage();
    const draft = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "표현 수정 실패" };
  }
}

const ADD_PARAGRAPH_SYSTEM_PROMPT = `당신은 한국 유치원 알림장에 한 단락을 추가하는 AI 편집자입니다. 기존 본문 흐름에 자연스럽게 이어지는 1~2 문장 단락 하나만 출력하세요. 마크다운/이모지/리스트/제목 사용 금지.`;

export async function addNoteParagraphAction(args: {
  content: string;
  hint?: string;
}): Promise<{ ok: true; paragraph: string } | { ok: false; error: string }> {
  try {
    const userPrompt = `[현재 본문]\n${args.content || "(비어있음)"}\n\n[지시]\n${args.hint?.trim() || "흐름에 맞는 마무리 인사 또는 가정과의 협력 제안 한 단락을 추가해 주세요."}`;

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [
        { type: "text", text: ADD_PARAGRAPH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const final = await stream.finalMessage();
    const paragraph = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    return { ok: true, paragraph };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "단락 추가 실패" };
  }
}

export async function saveNoteAction(args: {
  childId: string;
  classroomId: string;
  teacherId: string;
  endDate: string;
  content: string;
  status: "draft" | "published";
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    if (args.content.trim().length === 0) {
      return { ok: false, error: "내용이 비어있어요." };
    }
    if (!args.classroomId) {
      return { ok: false, error: "담임반을 찾을 수 없어요." };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("daily_notes")
      .insert({
        child_id: args.childId,
        classroom_id: args.classroomId,
        author_id: args.teacherId,
        date: args.endDate,
        content: args.content,
        status: args.status,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/notes");
    revalidatePath("/dashboard/notes/drafts");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장 실패" };
  }
}
