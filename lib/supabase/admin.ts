import { createClient } from "@supabase/supabase-js";

// 서버 전용 — service_role_key는 절대 클라이언트로 보내지 말 것.
// RLS를 우회하므로 인증이 붙기 전 데모/관리자 작업에서만 사용.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
