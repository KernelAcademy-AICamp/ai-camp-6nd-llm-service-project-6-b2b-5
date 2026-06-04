import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  DAILY_RECORD_SCHEMA,
  DAILY_RECORD_SYSTEM_PROMPT,
  type DailyRecordResult,
} from "@/lib/daily-record-prompt";

export const runtime = "nodejs";
export const maxDuration = 300; // 50장까지 처리하려면 시간 여유 필요

const MAX_IMAGES = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image (Anthropic 권장)
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
    const files = form.getAll("images");
    const labels = form.getAll("labels").map((v) => String(v));
    const dateLabel = (form.get("date") as string | null) ?? "당일";

    if (files.length === 0) {
      return NextResponse.json(
        { error: "사진을 1장 이상 업로드해주세요." },
        { status: 400 }
      );
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `사진은 최대 ${MAX_IMAGES}장까지 가능합니다.` },
        { status: 400 }
      );
    }

    // FormData entries → base64 image blocks
    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    const labelTexts: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: `images[${i}]가 파일이 아닙니다.` },
          { status: 400 }
        );
      }
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
      const data = buf.toString("base64");
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data,
        },
      });
      const label = labels[i]?.trim();
      labelTexts.push(label ? label : `사진 ${i + 1}`);
    }

    // 메시지 컨텐츠: 라벨 + 이미지를 페어로 인터리브
    const content: Anthropic.ContentBlockParam[] = [];
    content.push({
      type: "text",
      text: `기록_날짜: ${dateLabel}\n총_사진수: ${files.length}\n\n아래에 사진을 순서대로 제공합니다. 각 사진 직전의 텍스트가 그 사진의 시간대/활동 라벨입니다.`,
    });
    for (let i = 0; i < imageBlocks.length; i++) {
      content.push({ type: "text", text: `${labelTexts[i]}:` });
      content.push(imageBlocks[i]);
    }
    content.push({
      type: "text",
      text: "위 사진들을 종합하여 [JSON 스키마]에 따라 JSON 1개만 반환하세요.",
    });

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: DAILY_RECORD_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
      output_config: {
        format: { type: "json_schema", schema: DAILY_RECORD_SCHEMA },
      },
    });

    // 첫 번째 text 블록에 valid JSON이 들어있음
    const textBlock = response.content.find((b) => b.type === "text") as
      | Anthropic.TextBlock
      | undefined;
    if (!textBlock) {
      return NextResponse.json(
        { error: "모델 응답에서 텍스트 블록을 찾지 못했습니다." },
        { status: 502 }
      );
    }
    const parsed = JSON.parse(textBlock.text) as DailyRecordResult;

    // 정합성 보정 — 총_사진수가 실제 업로드와 안 맞으면 덮어쓰기
    if (parsed.총_사진수 !== files.length) {
      parsed.총_사진수 = files.length;
    }

    return NextResponse.json({
      result: parsed,
      usage: response.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-record]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
