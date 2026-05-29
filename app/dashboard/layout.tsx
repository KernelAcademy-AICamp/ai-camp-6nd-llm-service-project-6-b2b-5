import { Suspense } from "react";
import { NavChrome } from "@/components/dashboard/nav-chrome";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <NavChrome>{children}</NavChrome>
    </Suspense>
  );
}
