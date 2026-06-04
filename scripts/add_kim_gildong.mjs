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

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PROFILE_ID = "00000000-0000-0000-0000-000000000007";
const CHILD_ID = "19780cfd-3aa0-413c-bf85-0485b578095f"; // 김소연
const KINDER_ID = "d7d7b9be-7b3f-4df8-acca-afc9b643901f"; // 햇님 유치원
const EXISTING_LINK_ID = "4917eb8f-5706-4b80-8144-6b1dd429b4d0";

// 1) auth user 생성 (FK 대상). 이미 있으면 skip.
const { data: existing } = await sb.auth.admin.getUserById(PROFILE_ID);
if (!existing?.user) {
  const { error: aErr } = await sb.auth.admin.createUser({
    id: PROFILE_ID,
    email: "kim.gildong@parent.test",
    password: "Parent!2026",
    email_confirm: true,
    user_metadata: { name: "김길동" },
  });
  if (aErr) throw new Error(`auth: ${aErr.message}`);
  console.log("✅ auth user 생성: kim.gildong@parent.test");
} else {
  console.log("ℹ️  auth user 이미 존재 → skip");
}

// 2) profile upsert
const { error: pErr } = await sb.from("profiles").upsert(
  {
    id: PROFILE_ID,
    role: "parent",
    name: "김길동",
    phone: "010-2233-5555",
    kindergarten_id: KINDER_ID,
    is_active: true,
  },
  { onConflict: "id" }
);
if (pErr) throw new Error(`profile: ${pErr.message}`);
console.log("✅ profile upsert: 김길동 (id=...0007)");

// 2) parent_child 기존 비계정 row → 계정 연결로 전환 + 관계 '부'
const { error: lErr } = await sb
  .from("parent_child")
  .update({
    parent_id: PROFILE_ID,
    guardian_name: null,
    guardian_phone: null,
    relation: "부",
    is_primary: true,
  })
  .eq("id", EXISTING_LINK_ID);
if (lErr) throw new Error(`parent_child: ${lErr.message}`);
console.log("✅ parent_child 전환 완료: 김소연 ← 김길동 (부)");

// 3) 검증
const { data: verify } = await sb
  .from("parent_child")
  .select("*, profiles(id, name, role, phone), children(name)")
  .eq("child_id", CHILD_ID);
console.log("\n— 검증 —");
console.log(JSON.stringify(verify, null, 2));
