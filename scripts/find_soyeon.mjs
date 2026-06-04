import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/Users/aera/Documents/project/ai-camp-6nd-llm-service-project-6-b2b-5/.env.local", "utf8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i+1).trim()]; })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: kids } = await sb.from("children").select("id, name, classroom_id, classrooms(id, name, kindergarten_id, kindergartens(name))").ilike("name", "%소연%");
console.log("matched children:", JSON.stringify(kids, null, 2));

if (kids?.length) {
  const childId = kids[0].id;
  const { data: links } = await sb.from("parent_child").select("*, profiles(id, name, role)").eq("child_id", childId);
  console.log("existing guardians:", JSON.stringify(links, null, 2));
}
