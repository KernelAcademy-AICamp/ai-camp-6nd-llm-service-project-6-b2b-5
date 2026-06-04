import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  INDIVIDUAL_RECORD_SCHEMA,
  INDIVIDUAL_RECORD_SYSTEM_PROMPT,
  type IndividualRecordResult,
} from "@/lib/individual-record-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGES = 10; // 개별 기록 맥락용 — 1번보다 적게
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    // 주의: name 필드는 의도적으로 받지 않음. 이름은 클라이언트에서만 사용.
    const traitsRaw = (form.get("traits") as string | null) ?? "";
    const commonDraft = (form.get("commonDraft") as string | null) ?? "";
    const teacherMemo = (form.get("teacherMemo") as string | null) ?? "";
    const files = form.getAll("images");

    if (!traitsRaw.trim()) {
      return NextResponse.json(
        { error: "[원아 성향 프로필]이 비어있습니다." },
        { status: 400 }
      );
    }
    if (!commonDraft.trim() && !teacherMemo.trim()) {
      return NextResponse.json(
        {
          error:
            "[공통 초안] 또는 [교사 개별 메모] 중 하나는 입력해야 합니다.",
        },
        { status: 400 }
      );
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `사진은 최대 ${MAX_IMAGES}장까지 가능합니다.` },
        { status: 400 }
      );
    }

    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) continue;
      if (!ALLOWED_MIME.has(file.type)) {
        return NextResponse.json(
          {
            error: `images[${i}] 지원하지 않는 형식: ${file.type} (jpeg/png/gif/webp만 가능)`,
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          {
            error: `images[${i}] 용량 초과: ${(file.size / 1024 / 1024).toFixed(1)}MB (최대 5MB)`,
          },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: buf.toString("base64"),
        },
      });
    }

    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: `[원아 성향 프로필]
${traitsRaw.trim()}

[공통 초안]
${commonDraft.trim() || "(없음)"}

[교사 개별 메모]
${teacherMemo.trim() || "(없음)"}

${
  files.length > 0
    ? `[사진 ${files.length}장 — 활동 맥락 참고용]\n특정 아이를 식별하지 말고 활동 맥락만 참고하세요.`
    : "(사진 없음)"
}`,
      },
    ];

    // 이미지가 있으면 본문 뒤에 인터리브
    for (let i = 0; i < imageBlocks.length; i++) {
      content.push({ type: "text", text: `사진 ${i + 1}:` });
      content.push(imageBlocks[i]);
    }

    content.push({
      type: "text",
      text: "위 정보를 바탕으로 [JSON 스키마]에 따라 JSON 1개만 반환하세요. {이름} 자리표시자를 사용하고, 조사는 '은(는)' / '이(가)' 형태로 병기하세요.",
    });

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: INDIVIDUAL_RECORD_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
      output_config: {
        format: { type: "json_schema", schema: INDIVIDUAL_RECORD_SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text") as
      | Anthropic.TextBlock
      | undefined;
    if (!textBlock) {
      return NextResponse.json(
        { error: "모델 응답에서 텍스트 블록을 찾지 못했습니다." },
        { status: 502 }
      );
    }
    const parsed = JSON.parse(textBlock.text) as IndividualRecordResult;

    return NextResponse.json({
      result: parsed,
      usage: response.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[individual-record]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
