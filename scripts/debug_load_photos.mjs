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

const SESSION_ID = "29749eca-7be1-4c21-99e8-fd5a80c3943c";

console.log("=== loadChildPhotos 시뮬레이션 ===\n");

const { data, error } = await sb
  .from("child_activity_photos")
  .select("child_id, order_num, files ( url )")
  .eq("session_id", SESSION_ID)
  .order("order_num");

console.log("raw data:");
console.log(JSON.stringify(data, null, 2));
console.log("error:", error);

console.log("\n--- 변환 로직 적용 ---");
const result = {};
for (const row of data ?? []) {
  const file = Array.isArray(row.files) ? row.files[0] : row.files;
  const url = file?.url;
  if (!url) {
    console.log(`URL 없음 - child=${row.child_id}, files=`, row.files);
    continue;
  }
  (result[row.child_id] ??= []).push({ url, order_num: row.order_num });
}

console.log("\n최종 결과 (loadChildPhotos return):");
console.log(JSON.stringify(result, null, 2));
console.log("\nchild_id 별 사진 수:");
for (const [cid, photos] of Object.entries(result)) {
  console.log(`  ${cid}: ${photos.length}장`);
}
