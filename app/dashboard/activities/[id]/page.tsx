import Link from "next/link";
import { ChevronLeft, Sparkles, ImageIcon, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteActivityButton } from "./_delete";

export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "child-photos";

type FileRef = { bucket: string; storage_path: string; url: string };
type CapRow = {
  child_id: string;
  order_num: number;
  files: FileRef | FileRef[] | null;
};

function parseKeywords(content: string | null): string[] {
  if (!content) return [];
  const line = content.split("\n").find((l) => l.startsWith("[키워드]"));
  if (!line) return [];
  return line.replace("[키워드]", "").split(",").map((s) => s.trim()).filter(Boolean);
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { role?: string; user?: string; child?: string };
}) {
  const role = searchParams?.role ?? "teacher";
  const childId = searchParams?.child ?? null;

  const params2 = new URLSearchParams();
  params2.set("role", role);
  if (searchParams?.user) params2.set("user", searchParams.user);
  const qs = `?${params2.toString()}`;
  // 원아별 상세에서 돌아갈 땐 목록의 '원아별' 탭으로 복귀
  const backHref = `/dashboard/activities${qs}${childId ? "&tab=child" : ""}`;

  // 최종본 양식은 교사/원장/관리자만 열람
  if (role === "parent") {
    return (
      <main className="container mx-auto py-10">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            이 문서는 교사·원장·관리자만 열람할 수 있어요.
          </CardContent>
        </Card>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data: session } = await supabase
    .from("activity_sessions")
    .select("id, classroom_id, date, title")
    .eq("id", params.id)
    .maybeSingle();

  if (!session) {
    return (
      <main className="container mx-auto py-10">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            활동 기록을 찾을 수 없어요.{" "}
            <Link href={backHref} className="text-primary underline">
              목록으로
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [{ data: classroom }, { data: recs }, { data: caps }, { data: kids }] =
    await Promise.all([
      supabase
        .from("classrooms")
        .select("name")
        .eq("id", session.classroom_id)
        .maybeSingle(),
      supabase
        .from("activity_records")
        .select("child_id, memo, session_ai_content, ai_content")
        .eq("session_id", session.id),
      supabase
        .from("child_activity_photos")
        .select("child_id, order_num, files ( bucket, storage_path, url )")
        .eq("session_id", session.id)
        .order("order_num", { ascending: true }),
      supabase
        .from("children")
        .select("id, name")
        .eq("classroom_id", session.classroom_id),
    ]);

  const records = (recs ?? []) as {
    child_id: string;
    memo: string | null;
    session_ai_content: string | null;
    ai_content: string | null;
  }[];
  const childName = new Map(
    ((kids ?? []) as { id: string; name: string }[]).map((k) => [k.id, k.name]),
  );

  // 원아별 사진(서명 URL)
  const photosByChild = new Map<string, string[]>();
  for (const r of (caps ?? []) as CapRow[]) {
    const file = Array.isArray(r.files) ? r.files[0] : r.files;
    if (!file) continue;
    let url = file.url;
    try {
      const { data: signed } = await supabase.storage
        .from(file.bucket || PHOTO_BUCKET)
        .createSignedUrl(file.storage_path, 3600);
      if (signed?.signedUrl) url = signed.signedUrl;
    } catch {
      // fallback url
    }
    const arr = photosByChild.get(r.child_id) ?? [];
    arr.push(url);
    photosByChild.set(r.child_id, arr);
  }

  const sessionAi = records[0]?.session_ai_content ?? null;
  const keywords = parseKeywords(sessionAi);

  // 표시 대상 원아 목록 (전체 / 원아별 공통 양식)
  const targetChildIds = childId
    ? [childId]
    : records.map((r) => r.child_id);
  const childBlocks = targetChildIds.map((cid) => {
    const rec = records.find((r) => r.child_id === cid);
    return {
      childId: cid,
      name: childName.get(cid) ?? "원아",
      photos: photosByChild.get(cid) ?? [],
      memo: rec?.ai_content ?? rec?.memo ?? "",
    };
  });

  const isChildView = !!childId;
  const totalPhotos = childBlocks.reduce((n, b) => n + b.photos.length, 0);

  return (
    <main className="container mx-auto py-10 space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Link
            href={backHref}
            className="mt-0.5 grid h-8 w-8 place-items-center rounded-full hover:bg-accent"
            aria-label="목록으로"
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {session.title ?? "(제목 없음)"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(session.date)} · {classroom?.name ?? "반"} ·{" "}
              {isChildView
                ? `원아별 · ${childBlocks[0]?.name ?? "원아"}`
                : `작성 원아 ${childBlocks.length}명`}{" "}
              · 사진 {totalPhotos}장
            </p>
          </div>
        </div>
        <DeleteActivityButton
          sessionId={session.id}
          childId={childId}
          backHref={backHref}
          label={isChildView ? "이 원아 기록을" : "이 활동 기록을"}
        />
      </div>

      {/* 보관 안내 */}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
        원아 사진은 재원 기간 및 졸업/퇴소 후 1년까지만 보관됩니다. (이 화면은 편집 불가 · 삭제만 가능)
      </p>

      {/* AI 활동 분석 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            AI 활동 분석
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keywords.map((k) => (
                <Badge key={k} variant="secondary">
                  {k}
                </Badge>
              ))}
            </div>
          )}
          {sessionAi ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {sessionAi}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              저장된 AI 활동 분석 내용이 없어요.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 원아별 분류 이미지 */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" />
          원아별 분류 이미지
        </h2>
        {childBlocks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              분류된 원아 기록이 없어요.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {childBlocks.map((b) => (
              <Card key={b.childId}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {b.name.charAt(0)}
                    </span>
                    {b.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      <ImageIcon className="mr-0.5 inline h-3 w-3" />
                      {b.photos.length}장
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {b.photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {b.photos.map((url, i) => (
                        <div
                          key={`${b.childId}-${i}`}
                          className="aspect-square overflow-hidden rounded-lg ring-1 ring-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${b.name} ${i + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      분류된 사진 없음
                    </p>
                  )}
                  {b.memo && (
                    <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground/80">
                      {b.memo}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
