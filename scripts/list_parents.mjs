import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/aera/Documents/project/ai-camp-6nd-llm-service-project-6-b2b-5/.env.local", "utf8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: list } = await sb.auth.admin.listUsers();
console.log(JSON.stringify(list?.users?.map(u => ({ email: u.email, id: u.id })), null, 2));
