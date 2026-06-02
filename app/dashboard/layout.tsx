import { Suspense } from "react";
import { NavChrome } from "@/components/dashboard/nav-chrome";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createAdminClient();

  const [{ data: teachers }, { data: parents }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "teacher")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "parent")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <Suspense fallback={null}>
      <NavChrome
        teachers={(teachers ?? []) as { id: string; name: string }[]}
        parents={(parents ?? []) as { id: string; name: string }[]}
      >
        {children}
      </NavChrome>
    </Suspense>
  );
}
