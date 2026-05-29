"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Baby,
  School,
  Users,
  UserCog,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = [
  { id: "director", label: "원장" },
  { id: "teacher", label: "교사" },
  { id: "parent", label: "학부모" },
  { id: "admin", label: "관리자" },
] as const;

type Role = (typeof ROLES)[number]["id"];

const MENU: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard,
    roles: ["director", "teacher", "parent", "admin"] },
  { href: "/dashboard/children", label: "원생 관리", icon: Baby,
    roles: ["director", "teacher", "admin"] },
  { href: "/dashboard/children?my=1", label: "내 자녀", icon: Baby,
    roles: ["parent"] },
  { href: "/dashboard/classrooms", label: "반 관리", icon: School,
    roles: ["director", "teacher", "admin"] },
  { href: "/dashboard/staff", label: "교직원 관리", icon: UserCog,
    roles: ["director", "admin"] },
  { href: "/dashboard/parents", label: "학부모 관리", icon: Users,
    roles: ["director", "teacher", "admin"] },
  { href: "/dashboard/settings", label: "설정", icon: Settings,
    roles: ["director", "admin"] },
];

function buildHref(base: string, role: Role) {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}role=${role}`;
}

export function NavChrome({ children }: { children: React.ReactNode }) {
  const sp = useSearchParams();
  const pathname = usePathname();

  const raw = sp.get("role");
  const activeRole: Role = (ROLES.find((r) => r.id === raw)?.id ?? "director");

  const visibleMenu = MENU.filter((m) => m.roles.includes(activeRole));

  return (
    <div className="min-h-screen flex flex-col">
      {/* 상단: 역할 미리보기 탭 */}
      <div className="border-b bg-background px-6 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">역할 미리보기:</span>
        <div className="flex gap-2">
          {ROLES.map((r) => {
            const isActive = activeRole === r.id;
            const params = new URLSearchParams(sp.toString());
            params.set("role", r.id);
            return (
              <Link
                key={r.id}
                href={`${pathname}?${params.toString()}`}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm border transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-accent"
                )}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 사이드바 + 본문 */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-60 shrink-0 border-r bg-muted/30 hidden md:flex md:flex-col">
          <div className="p-6 border-b">
            <Link href={buildHref("/", activeRole)} className="block">
              <p className="text-lg font-bold">햇님 유치원</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ROLES.find((r) => r.id === activeRole)?.label} 콘솔
              </p>
            </Link>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {visibleMenu.map((item) => {
              const Icon = item.icon;
              const itemPath = item.href.split("?")[0];
              const itemQuery = item.href.includes("?")
                ? new URLSearchParams(item.href.split("?")[1])
                : new URLSearchParams();
              const isActive =
                pathname === itemPath &&
                Array.from(itemQuery.entries()).every(
                  ([k, v]) => sp.get(k) === v
                );
              return (
                <Link
                  key={item.href}
                  href={buildHref(item.href, activeRole)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t text-xs text-muted-foreground">
            <p className="font-medium text-foreground">AI Camp 6기 B2B 5팀</p>
            <p className="mt-0.5">데모 모드 (인증 미적용)</p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
