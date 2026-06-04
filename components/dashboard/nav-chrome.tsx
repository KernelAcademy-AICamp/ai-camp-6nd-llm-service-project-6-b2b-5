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
  ClipboardCheck,
  Camera,
  PencilLine,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = [
  { id: "director", label: "원장" },
  { id: "teacher", label: "교사" },
  { id: "parent", label: "학부모" },
  { id: "admin", label: "관리자" },
] as const;

type Role = (typeof ROLES)[number]["id"];

type Persona = { id: string; name: string };

const MENU: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  children?: { href: string; label: string }[];
}[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard,
    roles: ["director", "teacher", "admin"] },
  { href: "/dashboard", label: "홈", icon: LayoutDashboard,
    roles: ["parent"] },
  { href: "/dashboard/children", label: "원생 관리", icon: Baby,
    roles: ["director", "admin"] },
  { href: "/dashboard/children", label: "담당 원아", icon: Baby,
    roles: ["teacher"] },
  { href: "/dashboard/activities", label: "활동 기록", icon: Camera,
    roles: ["teacher"],
    children: [
      { href: "/dashboard/activities", label: "활동 기록 목록" },
      { href: "/dashboard/activities/new", label: "활동 기록 작성" },
    ] },
  { href: "/dashboard/today-memo", label: "한줄기록", icon: PencilLine,
    roles: ["teacher"] },
  { href: "/dashboard/notes", label: "알림장", icon: MessageSquare,
    roles: ["teacher"],
    children: [
      { href: "/dashboard/notes/new", label: "알림장 작성" },
      { href: "/dashboard/notes", label: "알림장 목록" },
      { href: "/dashboard/notes/drafts", label: "임시보관함" },
    ] },
  { href: "/dashboard/observations", label: "관찰일지", icon: BookOpen,
    roles: ["teacher"],
    children: [
      { href: "/dashboard/observations/new", label: "관찰일지 작성" },
      { href: "/dashboard/observations", label: "관찰일지 목록" },
      { href: "/dashboard/observations/timeline", label: "발달타임라인" },
    ] },
  { href: "/dashboard/children?my=1", label: "아이 정보", icon: Baby,
    roles: ["parent"] },
  { href: "/dashboard/attendance", label: "출결 관리", icon: ClipboardCheck,
    roles: ["director", "teacher", "admin"] },
  { href: "/dashboard/attendance?my=1", label: "출결 확인", icon: ClipboardCheck,
    roles: ["parent"] },
  { href: "/dashboard/classrooms", label: "반 관리", icon: School,
    roles: ["director", "admin"] },
  { href: "/dashboard/staff", label: "교직원 관리", icon: UserCog,
    roles: ["director", "admin"] },
  { href: "/dashboard/parents", label: "학부모 관리", icon: Users,
    roles: ["director", "admin"] },
  { href: "/dashboard/settings", label: "설정", icon: Settings,
    roles: ["director", "admin"] },
];

// 시드 UUID — `?user=` 미지정 시 각 역할의 기본 페르소나
const DEMO_USER_ID: Record<Role, string> = {
  director: "00000000-0000-0000-0000-000000000001",
  teacher: "00000000-0000-0000-0000-000000000002",
  parent: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000005",
};

export function NavChrome({
  children,
  teachers,
  parents,
}: {
  children: React.ReactNode;
  teachers: Persona[];
  parents: Persona[];
}) {
  const sp = useSearchParams();
  const pathname = usePathname();

  const raw = sp.get("role");
  const activeRole: Role = ROLES.find((r) => r.id === raw)?.id ?? "director";

  // 현재 선택된 페르소나 (URL `?user=` 우선, 없으면 시드 기본값)
  const activeUser = sp.get("user") ?? DEMO_USER_ID[activeRole];

  const visibleMenu = MENU.filter((m) => m.roles.includes(activeRole));

  // 현재 role 에 해당하는 페르소나 목록 (teacher / parent 만)
  const personas: Persona[] =
    activeRole === "teacher" ? teachers :
    activeRole === "parent" ? parents :
    [];

  // 역할 탭 클릭: user 는 리셋
  const buildRoleHref = (role: Role) => {
    const params = new URLSearchParams();
    params.set("role", role);
    return `${pathname}?${params.toString()}`;
  };

  // 페르소나 칩 클릭: role 유지, user 설정
  const buildUserHref = (userId: string) => {
    const params = new URLSearchParams();
    params.set("role", activeRole);
    params.set("user", userId);
    return `${pathname}?${params.toString()}`;
  };

  // 사이드바 메뉴 클릭: role + user 유지
  const userInUrl = sp.get("user");
  const buildMenuHref = (base: string) => {
    const [path, query] = base.split("?");
    const params = new URLSearchParams(query ?? "");
    params.set("role", activeRole);
    if (userInUrl && (activeRole === "teacher" || activeRole === "parent")) {
      params.set("user", userInUrl);
    }
    return `${path}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* 상단: 역할 미리보기 + 페르소나 선택 */}
      <div className="border-b bg-background px-6 py-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">역할 미리보기:</span>
          <div className="flex gap-2">
            {ROLES.map((r) => {
              const isActive = activeRole === r.id;
              return (
                <Link
                  key={r.id}
                  href={buildRoleHref(r.id)}
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

        {personas.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">페르소나:</span>
            {personas.map((p) => {
              const isActive = activeUser === p.id;
              return (
                <Link
                  key={p.id}
                  href={buildUserHref(p.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs border transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-foreground border-input hover:bg-accent"
                  )}
                >
                  {p.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 사이드바 + 본문 */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-60 shrink-0 border-r bg-muted/30 hidden md:flex md:flex-col">
          <div className="p-6 border-b">
            <Link href={buildMenuHref("/")} className="block">
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
              const hasChildren = !!item.children?.length;
              // 하위 메뉴가 있으면 섹션(경로 prefix) 활성 시 펼침
              const sectionActive =
                hasChildren && pathname.startsWith(itemPath);
              const isActive = hasChildren
                ? sectionActive
                : pathname === itemPath &&
                  Array.from(itemQuery.entries()).every(
                    ([k, v]) => sp.get(k) === v
                  );
              return (
                <div key={item.href}>
                  <Link
                    href={buildMenuHref(item.href)}
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
                  {hasChildren && sectionActive && (
                    <div className="ml-7 mt-1 space-y-1">
                      {item.children!.map((ch) => {
                        const chPath = ch.href.split("?")[0];
                        const chActive = pathname === chPath;
                        return (
                          <Link
                            key={ch.href}
                            href={buildMenuHref(ch.href)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                              chActive
                                ? "bg-accent font-medium text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <span className="h-1 w-1 rounded-full bg-current opacity-60" />
                            {ch.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
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
