"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getAnthropic, MODEL } from "@/lib/anthropic";

export type PhotoAnalysis = {
  activity_title: string;
  activity_description: string;
  keywords: string[];
  estimated_children: number;
  suggestion: string;
};

export type PhotoCluster = {
  description: string;
  photo_indices: number[];
};

const ANALYSIS_SYSTEM_PROMPT = `당신은 한국 유치원 교사의 \"활동 사진\" 분석을 돕는 AI입니다. 한 장 이상의 사진을 보고, 오늘 어떤 활동이 있었는지 객관적으로 추출합니다.

[작성 원칙]
- 사진에서 실제로 관찰되는 사실만 기록 (추측 금지)
- 어린이의 얼굴 특징이나 신상은 묘사하지 않음 (활동·놀이·재료·공간 중심)
- activity_title: 5~12자 정도의 간결한 활동명 (예: \"블록 협동 놀이\", \"점심시간\", \"바깥놀이\")
- activity_description: 3~5 문장. 어떤 활동이 어떻게 진행되었는지 객관적으로 묘사
- keywords: 활동 카테고리 태그 3~6개 (예: 블록놀이, 협동, 미술활동, 식사, 신체활동, 바깥놀이, 이야기나누기 등)
- estimated_children: 사진에 보이는 추정 참여 아동 수 (정수)
- suggestion: 이 활동을 기록·문서로 활용할 때의 한 줄 추천 (예: "협동 모습이 잘 드러나 관찰기록에 활용하기 좋아요.")

[출력]
지정된 JSON 스키마로만 응답.`;

const ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    activity_title: { type: "string" as const },
    activity_description: { type: "string" as const },
    keywords: { type: "array" as const, items: { type: "string" as const } },
    estimated_children: { type: "integer" as const },
    suggestion: { type: "string" as const },
  },
  required: [
    "activity_title",
    "activity_description",
    "keywords",
    "estimated_children",
    "suggestion",
  ],
  additionalProperties: false,
};

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

export async function analyzePhotosAction(args: {
  imageDataUrls: string[];
}): Promise<
  | { ok: true; analysis: PhotoAnalysis }
  | { ok: false; error: string }
> {
  try {
    if (!args.imageDataUrls || args.imageDataUrls.length === 0) {
      return { ok: false, error: "분석할 사진이 없어요." };
    }

    const images = args.imageDataUrls
      .map(parseDataUrl)
      .filter((x): x is { mediaType: string; data: string } => x !== null);

    if (images.length === 0) {
      return { ok: false, error: "이미지 형식을 인식할 수 없어요." };
    }

    const client = getAnthropic();
    const response = await client.messages.create({
      model: MODEL,
      thinking: { type: "adaptive" },
      max_tokens: 1500,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: ANALYSIS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: img.data,
              },
            })),
            {
              type: "text" as const,
              text: `위 ${images.length}장의 사진에서 오늘 어떤 활동이 있었는지 분석해 JSON으로 응답하세요.`,
            },
          ],
        },
      ],
    });

    const jsonText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = JSON.parse(jsonText) as PhotoAnalysis;
    return { ok: true, analysis: parsed };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "사진 분석 실패",
    };
  }
}

const CLUSTER_SYSTEM_PROMPT = `당신은 한국 유치원 활동 사진을 \"같은 아이로 추정되는 묶음\"으로 그룹핑하는 AI입니다.

[원칙]
- 같은 옷차림(상의 색·패턴·머리띠·머리 모양·신발 등) 또는 동일한 외형 단서를 가진 아이의 사진들을 한 그룹으로 묶기
- 사진 인덱스는 0부터 시작, 입력 순서대로
- 같은 아이가 보이면 모두 같은 그룹에 모으기 (얼굴이 정면이 아니어도 옷이 같으면 같은 그룹)
- 아이 식별이 불가능한 사진(풍경·뒷모습·재료만·여러 아이가 섞여 식별 어려움)은 어떤 그룹에도 포함시키지 않기 — 결과에서 제외
- description: \"노란 티셔츠\", \"분홍 원피스 + 머리띠\", \"파란 후드티\" 처럼 5~15자 정도의 외형 단서만. 이름·성별 추측 금지
- 그룹 수는 보통 2~6개. 한 사진은 한 그룹에만 속함
- 한 그룹에 정확히 한 아이만 포함되도록 (여러 명이 함께 찍힌 단체사진은 가능하면 제외)

[출력]
지정된 JSON 스키마로만 응답.`;

const CLUSTER_SCHEMA = {
  type: "object" as const,
  properties: {
    clusters: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          description: { type: "string" as const },
          photo_indices: {
            type: "array" as const,
            items: { type: "integer" as const },
          },
        },
        required: ["description", "photo_indices"],
        additionalProperties: false,
      },
    },
  },
  required: ["clusters"],
  additionalProperties: false,
};

export async function clusterPhotosAction(args: {
  imageDataUrls: string[];
}): Promise<
  | { ok: true; clusters: PhotoCluster[] }
  | { ok: false; error: string }
> {
  try {
    if (!args.imageDataUrls || args.imageDataUrls.length === 0) {
      return { ok: false, error: "그룹핑할 사진이 없어요." };
    }

    const images = args.imageDataUrls
      .map(parseDataUrl)
      .filter((x): x is { mediaType: string; data: string } => x !== null);

    if (images.length === 0) {
      return { ok: false, error: "이미지 형식을 인식할 수 없어요." };
    }

    const client = getAnthropic();
    const response = await client.messages.create({
      model: MODEL,
      thinking: { type: "adaptive" },
      max_tokens: 1500,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: CLUSTER_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: CLUSTER_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/webp"
                  | "image/gif",
                data: img.data,
              },
            })),
            {
              type: "text" as const,
              text: `위 ${images.length}장의 사진(인덱스 0부터 ${images.length - 1}까지, 입력 순서대로)을 \"같은 아이로 추정되는 묶음\"으로 그룹핑해 JSON으로 응답하세요.`,
            },
          ],
        },
      ],
    });

    const jsonText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = JSON.parse(jsonText) as { clusters: PhotoCluster[] };
    return { ok: true, clusters: parsed.clusters };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "사진 그룹핑 실패",
    };
  }
}

const CHILD_MEMO_SYSTEM_PROMPT = `당신은 한국 유치원 담임교사가 한 원아의 오늘 활동을 \"교사 자료용 메모\"로 정리하는 AI 보조 도구입니다.

[작성 원칙]
- 5~7 문장, 총 200~350자 분량
- 객관적 사실 위주 (사진에서 확인되는 행동·표정·상호작용 + 활동 정보)
- 추측·과장 금지. 사진·활동 정보에 없는 사실을 만들어내지 말 것
- "○○이는…", "○○이는 친구와…" 처럼 원아 이름으로 시작하는 문장을 1~2회 포함
- 마지막 1문장은 발달·관심사 측면의 짧은 메모 또는 다음 관찰 포인트 제안
- 마크다운/이모지/리스트/제목 사용 금지. 평이한 줄바꿈만 사용
- 본문만 출력 (제목·헤더 출력 금지)`;

export async function generateChildActivityMemoAction(args: {
  childName: string;
  classroomName: string;
  activityTitle: string;
  activityDescription: string;
  keywords: string[];
  imageDataUrls: string[];
}): Promise<{ ok: true; memo: string } | { ok: false; error: string }> {
  try {
    const photos = args.imageDataUrls
      .map(parseDataUrl)
      .filter((x): x is { mediaType: string; data: string } => x !== null)
      .slice(0, 6);

    const promptText = [
      `[원아] ${args.childName} (${args.classroomName})`,
      `[활동 제목] ${args.activityTitle}`,
      `[활동 내역] ${args.activityDescription}`,
      args.keywords.length
        ? `[활동 키워드] ${args.keywords.join(", ")}`
        : "",
      photos.length
        ? `[첨부] ${photos.length}장의 활동 사진이 포함되어 있습니다. 사진에서 확인되는 ${args.childName} 어린이의 모습을 활용해 주세요.`
        : `[첨부] 활동 사진은 없습니다. 활동 정보만으로 메모를 작성하세요.`,
      "",
      `위 정보를 바탕으로 ${args.childName} 어린이의 오늘 활동 메모를 작성하세요.`,
    ]
      .filter(Boolean)
      .join("\n");

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      thinking: { type: "adaptive" },
      max_tokens: 1200,
      output_config: { effort: "medium" },
      system: [
        {
          type: "text",
          text: CHILD_MEMO_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/webp"
                  | "image/gif",
                data: img.data,
              },
            })),
            { type: "text" as const, text: promptText },
          ],
        },
      ],
    });

    const final = await stream.finalMessage();
    const memo = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!memo) return { ok: false, error: "초안이 생성되지 않았어요." };
    return { ok: true, memo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "메모 생성 실패",
    };
  }
}

export type ChildSummaryInput = {
  name: string;
  photoCount: number;
  clusterDescription: string | null;
};

const SUMMARIES_SYSTEM_PROMPT = `당신은 한국 유치원 담임교사가 \"오늘 한 활동\"에 대한 원아별 한 줄 메모를 일괄 작성하도록 돕는 AI 보조 도구입니다.

[작성 원칙]
- 각 원아당 한 문장, 40~80자
- 본문은 행동·상호작용·표정·놀이 흐름 중심. 옷차림/외형 단서는 직접 언급 금지
- 원아마다 표현·서술 각도를 다양화 (모두 비슷하게 끝나지 않도록)
- 매칭된 사진이 있는 원아: 사진에서 추정할 수 있는 활동 모습 위주
- 매칭된 사진이 없는 원아: 활동 정보만으로 일반적이지만 따뜻한 한 줄
- 추측·과장·이름 호칭 외 신상 추측 금지
- 출력 순서는 입력 원아 순서와 동일하게 1:1 매칭`;

const SUMMARIES_SCHEMA = {
  type: "object" as const,
  properties: {
    summaries: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["summaries"],
  additionalProperties: false,
};

export async function generateChildSummariesAction(args: {
  classroomName: string;
  activityTitle: string;
  activityDescription: string;
  keywords: string[];
  children: ChildSummaryInput[];
}): Promise<
  | { ok: true; summaries: string[] }
  | { ok: false; error: string }
> {
  try {
    if (args.children.length === 0) return { ok: true, summaries: [] };

    const childList = args.children
      .map((c, i) => {
        const desc = c.clusterDescription
          ? `(\"${c.clusterDescription}\" 그룹 사진 ${c.photoCount}장 매칭됨)`
          : `(매칭된 사진 없음)`;
        return `${i + 1}. ${c.name} ${desc}`;
      })
      .join("\n");

    const promptText = [
      `[교실] ${args.classroomName}`,
      `[활동 제목] ${args.activityTitle}`,
      `[활동 내역] ${args.activityDescription}`,
      args.keywords.length
        ? `[활동 키워드] ${args.keywords.join(", ")}`
        : "",
      "",
      `[원아 목록 (${args.children.length}명)]`,
      childList,
      "",
      `위 ${args.children.length}명의 원아 각각에 대해 \"한 줄 활동 메모\"를 입력 순서와 동일하게 ${args.children.length}개 출력하세요.`,
    ]
      .filter(Boolean)
      .join("\n");

    const client = getAnthropic();
    const response = await client.messages.create({
      model: MODEL,
      thinking: { type: "adaptive" },
      max_tokens: 4000,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SUMMARIES_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: SUMMARIES_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: promptText }],
    });

    const jsonText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = JSON.parse(jsonText) as { summaries: string[] };
    if (!Array.isArray(parsed.summaries)) {
      return { ok: false, error: "응답 형식 오류" };
    }
    return { ok: true, summaries: parsed.summaries };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "일괄 생성 실패",
    };
  }
}

type ResolvedPhoto = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
};

const EXT_TO_MEDIA: Record<string, ResolvedPhoto["mediaType"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function resolvePhoto(url: string): Promise<ResolvedPhoto | null> {
  try {
    if (url.startsWith("data:")) {
      const parsed = parseDataUrl(url);
      if (!parsed) return null;
      return {
        mediaType: parsed.mediaType as ResolvedPhoto["mediaType"],
        data: parsed.data,
      };
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        mediaType: contentType as ResolvedPhoto["mediaType"],
        data: buf.toString("base64"),
      };
    }
    if (url.startsWith("/")) {
      const localPath = path.join(process.cwd(), "public", url);
      const buf = await fs.readFile(localPath);
      const ext = url.split(".").pop()?.toLowerCase() ?? "jpg";
      const mediaType = EXT_TO_MEDIA[ext] ?? "image/jpeg";
      return { mediaType, data: buf.toString("base64") };
    }
    return null;
  } catch {
    return null;
  }
}

const CHILD_DRAFT_SYSTEM_PROMPT = `당신은 한국 유치원 담임교사가 "한 원아의 오늘 활동 기록"을 작성하도록 돕는 AI 보조 도구입니다.

[입력 자료]
- 매일 활동 기록 본문 (오늘 반에서 있었던 활동의 객관적 묘사)
- 교사 메모 (오늘 이 원아에 대해 관찰한 짧은 메모)
- 활동 사진 (선택한 원아의 모습)

[작성 원칙]
- 5~7 문장, 총 200~350자
- 매일 활동 본문은 "활동의 맥락"으로만 활용. 활동 전체를 다시 설명하지 말고, 원아의 행동·반응 중심으로 작성
- 교사 메모가 있으면 가장 중요한 근거로 사용
- 사진이 있으면 사진에서 확인되는 모습을 1~2회 반영
- 사진이 없으면 활동 본문·교사 메모만으로 자연스럽게 작성 (\"사진이 없어\" 같은 메타 언급 금지)
- 원아 이름으로 시작하는 문장 1~2회 포함
- 마지막 1문장은 발달·관심사 측면의 짧은 메모 또는 다음 관찰 포인트
- 추측·과장·신상 추측 금지. 자료에 없는 사실 만들지 말 것
- 마크다운·이모지·리스트·제목 사용 금지. 본문만 출력`;

export async function generateChildActivityDraftAction(args: {
  childName: string;
  teacherMemo: string;
  sessionTitle: string;
  sessionAiContent: string;
  sessionKeywords: string[];
  photoUrls: string[];
}): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const photoTargets = args.photoUrls.slice(0, 2);
    const resolved = await Promise.all(photoTargets.map(resolvePhoto));
    const photos = resolved.filter((p): p is ResolvedPhoto => p !== null);

    const promptText = [
      `[원아] ${args.childName}`,
      `[오늘의 활동 제목] ${args.sessionTitle}`,
      `[매일 활동 기록 본문]`,
      args.sessionAiContent,
      args.sessionKeywords.length
        ? `[활동 키워드] ${args.sessionKeywords.join(", ")}`
        : "",
      "",
      `[오늘의 교사 메모]`,
      args.teacherMemo.trim() || "(교사 메모 없음 — 활동 본문·사진으로만 작성)",
      "",
      photos.length > 0
        ? `[첨부] ${photos.length}장의 활동 사진이 있습니다. 사진 속 ${args.childName} 어린이의 모습을 활용하세요.`
        : `[첨부] 활동 사진은 없습니다. 위 텍스트 정보만으로 작성하세요.`,
      "",
      `위 자료를 바탕으로 ${args.childName} 어린이의 오늘 활동 기록 초안을 작성하세요.`,
    ]
      .filter(Boolean)
      .join("\n");

    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL,
      thinking: { type: "adaptive" },
      max_tokens: 1200,
      output_config: { effort: "medium" },
      system: [
        {
          type: "text",
          text: CHILD_DRAFT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType,
                data: img.data,
              },
            })),
            { type: "text" as const, text: promptText },
          ],
        },
      ],
    });

    const final = await stream.finalMessage();
    const draft = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!draft) return { ok: false, error: "초안이 생성되지 않았어요." };
    return { ok: true, draft };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "초안 생성 실패",
    };
  }
}
