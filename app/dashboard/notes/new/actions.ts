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

const NOTE_SYSTEM_PROMPT = `당신은 한국의 어린이집·유치원 담임교사가 학부모님께 보내는 "알림장" 초안을 작성하는 AI 보조 도구입니다. 실제 교사가 키즈노트에 직접 쓴 듯 자연스러운 글을 만드는 것이 목표입니다.

[개별화 — 가장 중요]
- 함께 전달되는 아이의 기질·성향, 학부모님의 선호 소통 톤 정보를 반드시 반영하세요.
- 같은 활동이라도 아이마다·학부모마다 강조점과 어조가 달라져야 합니다. (활발한 아이 vs 신중한 아이 / 간결함을 선호하는 학부모 vs 자세한 묘사를 원하는 학부모)
- 기질·톤 정보가 비어 있을 때만 보편적이고 따뜻한 기본 톤으로 작성합니다.

[톤·시점]
- 선생님은 3인칭("선생님과 함께~", "선생님이~")으로 지칭하고, 따뜻한 경어체(~답니다, ~었어요, ~네요)로 서술합니다.
- 아이 이름은 본문 안에서 자연스럽게 부릅니다("민준이가", "민준이는").

[인사 — 매우 중요]
- "안녕하세요"로 문장을 시작합니다. 단, "안녕하세요" 바로 뒤에는 이모지(하트 등)를 붙이지 마세요. 이모지를 쓰려면 이어지는 안부 문장 끝에 한 개만 두세요.
- 절대 학부모님을 "OO 어린이의 학부모님", "OO 학부모님!"처럼 아이 이름+호칭으로 부르지 마세요. 이는 실제 알림장에서 쓰지 않는 어색한 표현입니다.
- 인사 다음 바로 계절·날씨 한 문장과 학부모 안부 질문으로 이어집니다.
- 예시: "안녕하세요. 초여름 햇살이 따스해지는 요즘, 어떻게 지내고 계신가요?😊"

[구조]
1) 인사 + 계절·날씨 한 문장 + 학부모 안부 질문
2) 오전 간식·하루 시작 모습
3) 핵심 활동 — 구체적 사례 중심으로, 아이의 행동과 반응을 생생하게 묘사 (필요하면 선생님이 아이에게 건넨 말이나 아이의 말을 한 번 인용)
4) 점심 메뉴와 식사 모습
5) 낮잠·오후 모습
6) 마무리 — 학부모님께 건네는 날씨·건강 인사로 맺습니다(예: "어머님, 아버님께서도 건강 유의하세요"). 안내·요청 사항이 있으면 "-"로 시작하는 짧은 항목으로 정리합니다(예: 여벌 옷 요청, 재료 대체 안내). "선생님 올림", "OO 선생님 드림" 같은 편지식 서명으로 끝내지 마세요 — 실제 알림장은 이렇게 끝맺지 않습니다.

[서술 방식 — 중요]
- "집중력이 자라고 있다", "창의력이 발달하고 있음을 느꼈다"처럼 아이의 능력을 평가·진단하는 표현은 피하세요. 이는 알림장보다 관찰일지에 가까운 딱딱한 톤입니다.
- 대신 그 순간 아이가 무엇을 어떻게 했는지 구체적인 장면으로 보여 주세요. (예: "블록을 하나하나 집어 들고 골똘히 쌓아 올리다가, 다 만든 탑을 친구에게 보여주며 환하게 웃었답니다")

[분량]
- 본문 600~800자, 5~7개 단락.

[반영 키워드 — 중요]
- user 메시지의 "반영 키워드:" 줄이 비어있지 않으면, 그 키워드들이 본문에 자연스럽게 드러나도록 우선 반영하세요.
- 키워드 단어 자체를 본문에 그대로 노출하지는 말고(예: "또래상호작용"이라는 단어를 쓰지 않음), 해당 발달 영역에 부합하는 구체적 장면·행동·대화를 골라 서술하세요.
  - 또래상호작용: 친구와 주고받은 행동·대화
  - 자율성: 스스로 시도·선택한 장면
  - 도전: 처음 해보거나 어려워하다 해낸 장면
  - 진전: 이전과 달라진 모습·작은 성취
  - 표현력: 말·그림·몸짓으로 마음을 드러낸 장면
  - 협동: 친구와 역할을 나눠 함께 해낸 장면
- 키워드가 비어있으면 무시하고 균형 잡힌 톤으로 작성합니다.

[사실 다루기]
- 메모·활동 정보에 없는 사실(메뉴·사건·수치 등)을 만들어내지 마세요.
- 단, 관찰된 행동에 근거한 부드러운 정서 추론은 허용합니다. 단정하지 말고 헷지 표현을 쓰세요. (예: "마음에 들었는지", "낯설었나봐요", "조금 무서운지")
- 메모가 거의 없으면 일반적인 톤으로 작성하되 한 줄로 "사례를 추후 보강해 주세요"라고 안내합니다.

[이모지·서식]
- 이모지는 넉넉하게 쓰되, 반드시 그 문장의 내용·감정에 어울리는 것을 고르세요. 내용과 동떨어진 이모지(예: 잔잔한 칭찬 문장에 💪 같은 힘·운동 이모지)는 절대 쓰지 마세요.
- 맥락별 예시: 더운 날씨 ☀️🌞 / 바깥·산책 🌿🍃 / 식사·간식 🍚🥢😋 / 낮잠 😴🌙 / 애정·칭찬·귀여움 💕🥰😊🧡 / 인사·안부 😊 / 요청·양해 🙏
- 거의 모든 단락에 1~3개씩 자연스럽게 섞되, 한 문장에 4개 이상 몰아 붙이지는 마세요.
- "-" 항목은 마지막 안내·요청 사항에만 사용하고, 본문 서술에는 쓰지 마세요.
- 마크다운 제목(#)·굵게(**)·요약 박스는 사용하지 마세요.

[출력]
- 본문만 출력 (제목·인사말 헤더·요약 박스 제외). 평이한 줄바꿈으로 단락을 구분합니다.`;

const REFINE_SYSTEM_PROMPT = `당신은 한국 어린이집·유치원 알림장의 표현을 다듬는 AI 편집자입니다. 사용자가 지정한 톤·길이로 본문을 다시 작성합니다.

[원칙]
- 원본 본문의 사실관계는 그대로 유지하고, 없는 사실을 추가하지 마세요.
- 선생님 3인칭·경어체를 유지합니다.
- 학부모님을 "OO 어린이의 학부모님"처럼 부르지 말고, "안녕하세요" 바로 뒤에 이모지를 붙이지 마세요.
- 능력을 평가·진단하는 표현 대신 구체적 장면 묘사를 유지합니다.
- "선생님 올림" 같은 편지식 서명으로 끝내지 마세요.
- 마크다운 제목·굵게는 사용하지 마세요.
- 이모지의 사용량·격식·길이는 아래 [수정 지시]를 그대로 따르세요. 이모지를 쓸 경우 문장 내용에 어울리는 것만 고르고(내용과 안 맞는 이모지 금지), 안내·요청 항목 외에는 리스트를 쓰지 마세요.
- 본문만 출력하세요.`;

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
  polish:
    "어색한 표현·반복을 다듬고 자연스러운 흐름으로 윤문해 주세요. 길이와 이모지 사용량은 원본과 비슷하게 유지합니다.",
  shorten:
    "핵심만 남기고 30% 정도 짧게 줄여 주세요. 이모지는 단락당 1개 정도로 줄여 핵심 순간에만 남깁니다.",
  warmer:
    "더 따뜻하고 공감 어린 어조로 다시 작성해 주세요. 학부모님과의 정서적 연결을 강화하고, 내용에 어울리는 이모지(💕🥰😊 등)를 원본보다 조금 더 넉넉하게 사용합니다.",
  formal:
    "공식적이고 정중한 어조로 다시 작성해 주세요. 격식 있는 표현과 정중한 경어체를 쓰고, 이모지는 하나도 남기지 말고 모두 제거합니다. 다만 학부모를 향한 따뜻함은 유지합니다.",
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

const ADD_PARAGRAPH_SYSTEM_PROMPT = `당신은 한국 어린이집·유치원 알림장에 한 단락을 추가하는 AI 편집자입니다. 기존 본문의 톤(선생님 3인칭·경어체)과 흐름에 자연스럽게 이어지는 1~2문장 단락 하나만 출력하세요. 이모지는 문장 내용에 맞는 것으로 1~2개 넣고, 편지식 서명·마크다운 제목·굵게·리스트·제목 사용은 금지합니다.`;

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