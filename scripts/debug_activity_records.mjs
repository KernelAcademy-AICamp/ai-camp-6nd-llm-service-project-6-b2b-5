import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(
    "/Users/aera/Documents/project/ai-camp-6nd-llm-service-project-6-b2b-5/.env.local",
    "utf8",
  )
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
console.log("=== 오늘 날짜:", todayStr, "===\n");

console.log("--- 1) activity_sessions 전체 (최근 10건) ---");
const { data: sessions } = await sb
  .from("activity_sessions")
  .select("id, classroom_id, date, title")
  .order("date", { ascending: false })
  .limit(10);
console.log(JSON.stringify(sessions, null, 2));

console.log("\n--- 2) 오늘 날짜 세션 ---");
const { data: todaySessions } = await sb
  .from("activity_sessions")
  .select("id, classroom_id, date, title")
  .eq("date", todayStr);
console.log(JSON.stringify(todaySessions, null, 2));

if (todaySessions && todaySessions.length > 0) {
  for (const s of todaySessions) {
    console.log(`\n--- 3) session ${s.id} 의 activity_records ---`);
    const { data: records } = await sb
      .from("activity_records")
      .select("id, child_id, session_ai_content, memo, ai_content")
      .eq("session_id", s.id);
    console.log(`총 ${records?.length ?? 0}건`);
    console.log(
      JSON.stringify(
        records?.map((r) => ({
          child_id: r.child_id,
          has_session_ai: !!r.session_ai_content,
          session_ai_preview: r.session_ai_content?.slice(0, 50),
          has_memo: !!r.memo,
          has_ai_content: !!r.ai_content,
        })),
        null,
        2,
      ),
    );

    console.log(`\n--- 4) session ${s.id} 의 child_activity_photos ---`);
    const { data: photos } = await sb
      .from("child_activity_photos")
      .select("id, child_id, file_id, order_num")
      .eq("session_id", s.id);
    console.log(`총 ${photos?.length ?? 0}건`);
    console.log(JSON.stringify(photos, null, 2));

    if (photos && photos.length > 0) {
      console.log(`\n--- 5) photos join files (embed 테스트) ---`);
      const { data: embedded, error: embedError } = await sb
        .from("child_activity_photos")
        .select("child_id, order_num, files ( url )")
        .eq("session_id", s.id);
      if (embedError) console.log("embed 에러:", embedError);
      console.log(JSON.stringify(embedded, null, 2));

      console.log(`\n--- 6) 같은 쿼리, FK 명시 (files:file_id) ---`);
      const { data: embedded2, error: embedError2 } = await sb
        .from("child_activity_photos")
        .select("child_id, order_num, files:file_id ( url )")
        .eq("session_id", s.id);
      if (embedError2) console.log("embed 에러:", embedError2);
      console.log(JSON.stringify(embedded2, null, 2));

      console.log(`\n--- 7) files 테이블에서 직접 조회 ---`);
      const fileIds = photos.map((p) => p.file_id);
      const { data: files } = await sb
        .from("files")
        .select("id, url, file_name, storage_path, bucket")
        .in("id", fileIds);
      console.log(JSON.stringify(files, null, 2));
    }
  }
}
