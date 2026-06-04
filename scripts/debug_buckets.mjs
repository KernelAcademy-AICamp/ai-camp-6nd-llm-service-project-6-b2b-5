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

console.log("=== Storage 버킷 목록 ===\n");
const { data: buckets, error } = await sb.storage.listBuckets();
console.log("error:", error);
console.log(JSON.stringify(buckets, null, 2));

console.log("\n=== child-photos 버킷 내 파일 (있다면) ===");
const { data: files, error: filesError } = await sb.storage
  .from("child-photos")
  .list("d7d7b9be-7b3f-4df8-acca-afc9b643901f", { limit: 100 });
console.log("error:", filesError);
console.log(JSON.stringify(files, null, 2));
