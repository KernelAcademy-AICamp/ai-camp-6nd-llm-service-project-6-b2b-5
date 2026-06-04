"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

const PHOTO_BUCKET = "child-photos";

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
      max_tokens: 1500,
      output_config: {
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
      max_tokens: 1500,
      output_config: {
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
      max_tokens: 1200,
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
      max_tokens: 4000,
      output_config: {
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

// =============================================================
// 원아별 분류 사진 DB 저장 (Supabase)
// activity_sessions(반+날짜) → child_activity_photos(원아별 사진) + activity_records(메모)
// 사진 원본은 Storage 버킷 child-photos 에 업로드, 메타는 files 테이블에 기록.
// =============================================================

export type SaveChildPhotoInput = {
  /** data:image/...;base64,... 형식 */
  dataUrl: string;
  /** 사진별 활동 태그 (없으면 null) */
  activity: string | null;
};

export type SaveChildGroupInput = {
  childId: string;
  photos: SaveChildPhotoInput[];
};

function extFromMediaType(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/gif") return "gif";
  return "jpg";
}

/**
 * 원아별로 분류된 활동 사진을 Supabase 에 저장한다.
 * - activity_sessions: (classroom_id, date) 1건 upsert (활동 제목 반영)
 * - child_activity_photos: 세션 내 기존 사진 정리 후 원아별 사진 재등록
 * - activity_records: 원아별 활동 태그를 메모로 upsert
 * service_role(admin) 클라이언트로 동작하므로 RLS 를 우회한다(서버 전용).
 */
export async function saveActivityRecordAction(args: {
  classroomId: string;
  teacherId: string;
  date: string; // YYYY-MM-DD
  activityTitle: string | null;
  children: SaveChildGroupInput[];
}): Promise<
  | { ok: true; sessionId: string; savedPhotos: number; savedChildren: number }
  | { ok: false; error: string }
> {
  try {
    if (!args.classroomId) {
      return { ok: false, error: "반 정보를 찾을 수 없어요." };
    }
    // 원아별 분류는 선택사항 — 사진이 없어도 세션(활동 제목)은 저장
    const groups = args.children.filter((g) => g.photos.length > 0);

    const supabase = createAdminClient();

    // 1) 교사의 유치원 id (files.kindergarten_id / storage 경로용)
    const { data: prof } = await supabase
      .from("profiles")
      .select("kindergarten_id")
      .eq("id", args.teacherId)
      .maybeSingle();
    const kindergartenId =
      (prof as { kindergarten_id: string | null } | null)?.kindergarten_id ??
      null;

    // 2) activity_sessions upsert (classroom_id, date)
    const { data: existingSession } = await supabase
      .from("activity_sessions")
      .select("id")
      .eq("classroom_id", args.classroomId)
      .eq("date", args.date)
      .maybeSingle();

    let sessionId = (existingSession as { id: string } | null)?.id ?? null;
    if (!sessionId) {
      const { data: created, error: sErr } = await supabase
        .from("activity_sessions")
        .insert({
          classroom_id: args.classroomId,
          date: args.date,
          title: args.activityTitle,
          created_by: args.teacherId,
        })
        .select("id")
        .single();
      if (sErr || !created) {
        return { ok: false, error: sErr?.message ?? "세션 생성 실패" };
      }
      sessionId = created.id;
    } else if (args.activityTitle) {
      await supabase
        .from("activity_sessions")
        .update({ title: args.activityTitle })
        .eq("id", sessionId);
    }

    // 3) 재저장 멱등성 — 이 세션의 기존 분류 사진 링크 제거 후 재등록
    await supabase
      .from("child_activity_photos")
      .delete()
      .eq("session_id", sessionId);

    // 4) 원아별 사진 업로드 + 메모
    let savedPhotos = 0;
    let savedChildren = 0;
    for (const group of groups) {
      let childPhotoSaved = 0;
      let order = 0;
      for (const photo of group.photos) {
        const parsed = parseDataUrl(photo.dataUrl);
        if (!parsed) continue;
        const ext = extFromMediaType(parsed.mediaType);
        const buffer = Buffer.from(parsed.data, "base64");
        const storagePath = `${kindergartenId ?? "unknown"}/${group.childId}/${randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(storagePath, buffer, {
            contentType: parsed.mediaType,
            upsert: false,
          });
        if (upErr) {
          console.error("[활동기록] 사진 Storage 업로드 실패", upErr.message);
          continue;
        }

        const { data: pub } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(storagePath);
        const url = pub?.publicUrl ?? storagePath;

        const { data: fileRow, error: fErr } = await supabase
          .from("files")
          .insert({
            kindergarten_id: kindergartenId,
            uploader_id: args.teacherId,
            bucket: PHOTO_BUCKET,
            storage_path: storagePath,
            url,
            file_name: `${group.childId}-${order + 1}.${ext}`,
            file_size: buffer.length,
            mime_type: parsed.mediaType,
          })
          .select("id")
          .single();
        if (fErr || !fileRow) {
          console.error("[활동기록] files 저장 실패", fErr?.message);
          continue;
        }

        const { error: capErr } = await supabase
          .from("child_activity_photos")
          .insert({
            session_id: sessionId,
            child_id: group.childId,
            file_id: fileRow.id,
            order_num: order,
            created_by: args.teacherId,
          });
        if (capErr) {
          console.error("[활동기록] child_activity_photos 저장 실패", capErr.message);
          continue;
        }
        order += 1;
        childPhotoSaved += 1;
        savedPhotos += 1;
      }

      if (childPhotoSaved > 0) savedChildren += 1;

      // activity_records: 활동 태그를 메모로 upsert
      const tags = Array.from(
        new Set(
          group.photos
            .map((p) => p.activity?.trim())
            .filter((t): t is string => !!t),
        ),
      );
      const memo = tags.length ? tags.join(", ") : null;
      const { data: rec } = await supabase
        .from("activity_records")
        .select("id")
        .eq("session_id", sessionId)
        .eq("child_id", group.childId)
        .maybeSingle();
      if ((rec as { id: string } | null)?.id) {
        if (memo) {
          await supabase
            .from("activity_records")
            .update({ memo, updated_by: args.teacherId })
            .eq("id", (rec as { id: string }).id);
        }
      } else {
        await supabase.from("activity_records").insert({
          session_id: sessionId,
          child_id: group.childId,
          memo,
          updated_by: args.teacherId,
        });
      }
    }

    revalidatePath("/dashboard/activities/new");
    return { ok: true, sessionId: sessionId as string, savedPhotos, savedChildren };
  } catch (e) {
    console.error("[활동기록] 저장 실패", e);
    return { ok: false, error: e instanceof Error ? e.message : "저장 실패" };
  }
}

/**
 * 특정 세션에서 원아별로 저장된 사진을 다시 불러온다. (저장 검증용)
 * 반환: childId -> 사진 URL 배열
 */
export async function loadSavedChildPhotosAction(args: {
  classroomId: string;
  date: string;
}): Promise<
  | { ok: true; sessionId: string | null; byChild: Record<string, string[]> }
  | { ok: false; error: string }
> {
  try {
    const supabase = createAdminClient();
    const { data: session } = await supabase
      .from("activity_sessions")
      .select("id")
      .eq("classroom_id", args.classroomId)
      .eq("date", args.date)
      .maybeSingle();
    const sessionId = (session as { id: string } | null)?.id ?? null;
    if (!sessionId) return { ok: true, sessionId: null, byChild: {} };

    const { data: rows } = await supabase
      .from("child_activity_photos")
      .select("child_id, order_num, files ( bucket, storage_path, url )")
      .eq("session_id", sessionId)
      .order("order_num", { ascending: true });

    const byChild: Record<string, string[]> = {};
    for (const r of (rows ?? []) as Array<{
      child_id: string;
      files:
        | { bucket: string; storage_path: string; url: string }
        | { bucket: string; storage_path: string; url: string }[]
        | null;
    }>) {
      const file = Array.isArray(r.files) ? r.files[0] : r.files;
      if (!file) continue;
      // private 버킷 대응 — 1시간 서명 URL 생성, 실패 시 저장된 url 사용
      let viewUrl = file.url;
      try {
        const { data: signed } = await supabase.storage
          .from(file.bucket)
          .createSignedUrl(file.storage_path, 3600);
        if (signed?.signedUrl) viewUrl = signed.signedUrl;
      } catch {
        // 무시 — fallback url 사용
      }
      (byChild[r.child_id] ??= []).push(viewUrl);
    }
    return { ok: true, sessionId, byChild };
  } catch (e) {
    console.error("[활동기록] 저장 사진 조회 실패", e);
    return { ok: false, error: e instanceof Error ? e.message : "조회 실패" };
  }
}

// =============================================================
// 데모 — 강아지 사진 기반 원아별 자동 분류
// 업로드 사진 ↔ 원아 프로필 강아지를 외형(견종)으로 매칭한다.
// 사람 신원 식별이 아니라 데모용 강아지 외형 매칭이므로 프라이버시 이슈 없음.
// =============================================================

export type ProfileMatchInput = {
  childId: string;
  dataUrl: string;
  label?: string; // 견종 라벨(데모 힌트)
};
export type UploadMatchInput = { photoId: string; dataUrl: string };

const AUTO_CLASSIFY_SYSTEM_PROMPT = `당신은 강아지 사진의 견종(외형·색·무늬)을 판별해 프로필과 매칭하는 AI입니다.
[프로필] 강아지들(각 견종 라벨 제공)과 [사진] 강아지들이 주어집니다.
각 [사진]의 강아지 견종을 시각적으로 판별한 뒤, 같은 견종의 [프로필] 인덱스로 매칭하세요.
- 같은 견종이면 그 프로필 인덱스, 어느 프로필 견종과도 다르면 -1
- 한 사진은 한 프로필에만 매칭 (가장 가까운 하나)
- 같은 견종 사진이 여러 장이면 모두 같은 프로필로 매칭
지정된 JSON 스키마로만 응답.`;

const AUTO_CLASSIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    matches: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          upload: { type: "integer" as const },
          profile: { type: "integer" as const },
        },
        required: ["upload", "profile"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

type ImgBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data: string;
  };
};

function toImageBlock(dataUrl: string): ImgBlock | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: parsed.mediaType as ImgBlock["source"]["media_type"],
      data: parsed.data,
    },
  };
}

/**
 * 업로드 사진을 원아 프로필 강아지와 외형 매칭해 원아별 배정을 반환.
 * 반환: photoId -> childId
 */
export async function autoClassifyByProfileAction(args: {
  profiles: ProfileMatchInput[];
  uploads: UploadMatchInput[];
}): Promise<
  | { ok: true; assignments: Record<string, string> }
  | { ok: false; error: string }
> {
  try {
    if (args.profiles.length === 0 || args.uploads.length === 0) {
      return { ok: true, assignments: {} };
    }

    const content: Array<ImgBlock | { type: "text"; text: string }> = [];
    content.push({ type: "text", text: "[프로필 강아지]" });
    args.profiles.forEach((p, i) => {
      const block = toImageBlock(p.dataUrl);
      if (!block) return;
      content.push({
        type: "text",
        text: p.label ? `프로필 ${i} (견종: ${p.label})` : `프로필 ${i}`,
      });
      content.push(block);
    });
    content.push({ type: "text", text: "[분류할 사진]" });
    args.uploads.forEach((u, i) => {
      const block = toImageBlock(u.dataUrl);
      if (!block) return;
      content.push({ type: "text", text: `사진 ${i}` });
      content.push(block);
    });
    content.push({
      type: "text",
      text: `위 ${args.uploads.length}장의 [사진] 각각을 가장 닮은 [프로필] 인덱스(없으면 -1)로 매칭해 JSON 으로 응답하세요.`,
    });

    const client = getAnthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      output_config: {
        format: { type: "json_schema", schema: AUTO_CLASSIFY_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: AUTO_CLASSIFY_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
    });

    const jsonText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const parsed = JSON.parse(jsonText) as {
      matches: Array<{ upload: number; profile: number }>;
    };

    const assignments: Record<string, string> = {};
    for (const m of parsed.matches ?? []) {
      const u = args.uploads[m.upload];
      const p = args.profiles[m.profile];
      if (u && p && m.profile >= 0) assignments[u.photoId] = p.childId;
    }
    return { ok: true, assignments };
  } catch (e) {
    console.error("[활동기록] 자동 분류 실패", e);
    return { ok: false, error: e instanceof Error ? e.message : "자동 분류 실패" };
  }
}
