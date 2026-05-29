// 원격 DB 검증 스크립트
// 사용: node scripts/verify-db.mjs
// .env.local 에서 service role key 사용 (RLS 우회)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const expected = [
  ["kindergartens", 1],
  ["profiles", 5],
  ["classrooms", 3],
  ["children", 5],
  ["parent_child", 6],
  ["staff_classrooms", 2],
];

console.log("📊 테이블별 row count 검증\n");
console.log("table".padEnd(20), "expected", "actual", "result");
console.log("─".repeat(50));

let allOk = true;
for (const [table, want] of expected) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log(table.padEnd(20), String(want).padEnd(8), "ERROR", error.message);
    allOk = false;
    continue;
  }
  const ok = count === want;
  console.log(
    table.padEnd(20),
    String(want).padEnd(8),
    String(count).padEnd(6),
    ok ? "✅" : "❌"
  );
  if (!ok) allOk = false;
}

console.log("─".repeat(50));
console.log(allOk ? "\n✅ 전체 검증 통과" : "\n❌ 일부 검증 실패");
process.exit(allOk ? 0 : 1);
