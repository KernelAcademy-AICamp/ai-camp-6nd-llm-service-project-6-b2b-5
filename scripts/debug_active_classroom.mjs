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

const SESSION_CLASSROOM_ID = "a60c00c5-c4d4-4170-800f-45fc655dac90";
const CHILD_IDS_WITH_PHOTOS = [
  "625adb85-2386-40d5-8b5b-26c23f4853bc",
  "ce7ddc1e-b9dd-4f19-9929-60f90fe73496",
];
const DEFAULT_TEACHER_ID = "00000000-0000-0000-0000-000000000002";

console.log("--- 1) classroom_id =", SESSION_CLASSROOM_ID, "정보 ---");
const { data: classroom } = await sb
  .from("classrooms")
  .select("id, name, kindergarten_id, age_group")
  .eq("id", SESSION_CLASSROOM_ID)
  .maybeSingle();
console.log(JSON.stringify(classroom, null, 2));

console.log("\n--- 2) 사진 매핑된 아이들의 children row ---");
const { data: kids } = await sb
  .from("children")
  .select("id, name, classroom_id, status")
  .in("id", CHILD_IDS_WITH_PHOTOS);
console.log(JSON.stringify(kids, null, 2));

console.log("\n--- 3) DEFAULT_TEACHER 가 담당하는 반 (staff_classrooms) ---");
const { data: assignments } = await sb
  .from("staff_classrooms")
  .select("classroom_id, role_in_class, classrooms ( id, name )")
  .eq("staff_id", DEFAULT_TEACHER_ID);
console.log(JSON.stringify(assignments, null, 2));

console.log(
  `\n--- 4) classroom ${SESSION_CLASSROOM_ID} 의 children (status != graduated) ---`,
);
const { data: classroomKids } = await sb
  .from("children")
  .select("id, name, status")
  .eq("classroom_id", SESSION_CLASSROOM_ID)
  .neq("status", "graduated")
  .order("name");
console.log(`총 ${classroomKids?.length ?? 0}명`);
console.log(JSON.stringify(classroomKids, null, 2));
