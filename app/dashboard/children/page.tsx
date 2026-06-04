import Link from "next/link";
import { Pencil } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ChildRow,
  ClassroomRow,
  ParentChildRow,
  Role,
  UserProfile,
} from "@/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["parent", "teacher", "director", "admin"];

// 데모 시드 UUID — 로그인 도입 시 createClient() 의 auth.user.id 로 교체
const DEMO_USER_ID: Record<Role, string> = {
  director: "00000000-0000-0000-0000-000000000001",
  teacher: "00000000-0000-0000-0000-000000000002",
  parent: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000005",
};

function statusBadge(status: ChildRow["status"]) {
  if (status === "active") return <Badge variant="success">재원중</Badge>;
  if (status === "inactive") return <Badge variant="warning">퇴소</Badge>;
  return <Badge variant="secondary">졸업</Badge>;
}

function ageFromBirth(birth: string) {
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function formatBirth(birth: string) {
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return birth;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function genderLabel(g: ChildRow["gender"]) {
  if (g === "M") return "남";
  if (g === "F") return "여";
  return "-";
}

type SearchParams = {
  role?: string;
  user?: string;
  classroom?: string;
  q?: string;
  my?: string;
};

export default async function ChildrenPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const role: Role = (ROLES.find((r) => r === searchParams.role) ?? "director");
  const activeUserId = searchParams.user || DEMO_USER_ID[role];
  const supabase = createAdminClient();

  // 1) 반·원아·보호자 매핑·보호자 프로필 동시 로드
  const [
    { data: classroomsAll },
    { data: childrenAll },
    { data: parentLinksAll },
    { data: parentProfilesAll },
    { data: staffLinksAll },
  ] = await Promise.all([
    supabase.from("classrooms").select("*").order("age_group", { ascending: false }),
    supabase.from("children").select("*").order("name"),
    supabase.from("parent_child").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: true }),
    supabase.from("profiles").select("*").eq("role", "parent"),
    supabase.from("staff_classrooms").select("*"),
  ]);

  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const childrenRaw = (childrenAll ?? []) as ChildRow[];
  const parentLinks = (parentLinksAll ?? []) as ParentChildRow[];
  const parentProfiles = (parentProfilesAll ?? []) as UserProfile[];

  // 2) 역할 기반 1차 필터
  let visibleChildren = childrenRaw;

  if (role === "parent") {
    const myChildIds = new Set(
      parentLinks.filter((l) => l.parent_id === activeUserId).map((l) => l.child_id)
    );
    visibleChildren = childrenRaw.filter((c) => myChildIds.has(c.id));
  } else if (role === "teacher") {
    const myClassIds = new Set(
      (staffLinksAll ?? [])
        .filter((s) => s.staff_id === activeUserId)
        .map((s) => s.classroom_id)
    );
    visibleChildren = childrenRaw.filter((c) => myClassIds.has(c.classroom_id));
  }

  // 3) 검색·반 필터 (URL 쿼리)
  const classroomFilter = searchParams.classroom?.trim();
  const query = searchParams.q?.trim();
  if (classroomFilter) {
    visibleChildren = visibleChildren.filter(
      (c) => c.classroom_id === classroomFilter
    );
  }
  if (query) {
    const q = query.toLowerCase();
    visibleChildren = visibleChildren.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
  }

  // 4) 화면 표시용 매핑
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const parentProfileById = new Map(parentProfiles.map((p) => [p.id, p]));
  const primaryGuardianByChild = new Map<
    string,
    { name: string; phone: string | null; relation: string; hasAccount: boolean }
  >();
  for (const link of parentLinks) {
    if (!link.is_primary) continue;
    if (link.parent_id) {
      const prof = parentProfileById.get(link.parent_id);
      primaryGuardianByChild.set(link.child_id, {
        name: prof?.name ?? "보호자",
        phone: prof?.phone ?? null,
        relation: link.relation,
        hasAccount: true,
      });
    } else {
      primaryGuardianByChild.set(link.child_id, {
        name: link.guardian_name ?? "보호자",
        phone: link.guardian_phone,
        relation: link.relation,
        hasAccount: false,
      });
    }
  }

  // 5) 통계
  const totalCount = visibleChildren.length;
  const activeCount = visibleChildren.filter((c) => c.status === "active").length;
  const privacyMissing = visibleChildren.filter(
    (c) => c.privacy_agreed_at === null
  ).length;

  // 6) 필터 링크 빌더 (role · user 유지)
  const baseParams = new URLSearchParams();
  baseParams.set("role", role);
  if (searchParams.user) baseParams.set("user", searchParams.user);
  const buildFilterHref = (next: Partial<SearchParams>) => {
    const p = new URLSearchParams(baseParams.toString());
    if (next.classroom) p.set("classroom", next.classroom);
    if (next.q) p.set("q", next.q);
    return `/dashboard/children?${p.toString()}`;
  };
  const dashboardHref = `/dashboard?${baseParams.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {role === "parent"
              ? "아이 정보"
              : role === "teacher"
                ? "담당 원아"
                : "원생 관리"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {role === "parent"
              ? "내 아이의 정보를 확인할 수 있습니다."
              : role === "teacher"
                ? "담당 반의 원아 목록을 조회합니다."
                : "유치원에 등록된 원아 목록을 조회·관리합니다."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(role === "director") && (
            <>
              <a href="/api/children/template" download>
                <Button variant="outline">등록폼 다운로드</Button>
              </a>
              <Link
                href={`/dashboard/children/new?${baseParams.toString()}`}
              >
                <Button>원아 등록</Button>
              </Link>
            </>
          )}
          <Link href={dashboardHref}>
            <Button variant="outline">{role === "parent" ? "홈으로" : "대시보드로"}</Button>
          </Link>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <SummaryCell label="전체" value={totalCount} />
        <SummaryCell label="재원중" value={activeCount} accent />
        <SummaryCell label="개인정보 미동의" value={privacyMissing} warn />
      </div>

      {/* 필터 (학부모는 숨김) */}
      {role !== "parent" && (
      <form
        action="/dashboard/children"
        method="GET"
        className="flex items-end gap-2 flex-wrap"
      >
        <input type="hidden" name="role" value={role} />
        {searchParams.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="q">
            원아 이름
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query ?? ""}
            placeholder="이름 검색"
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="classroom">
            반
          </label>
          <select
            id="classroom"
            name="classroom"
            defaultValue={classroomFilter ?? ""}
            className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">전체 반</option>
            {classrooms.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
                {cls.age_group != null ? ` (만 ${cls.age_group}세)` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" className="h-9">
          검색
        </Button>
        {(query || classroomFilter) && (
          <Link href={buildFilterHref({})}>
            <Button type="button" variant="ghost" size="sm" className="h-9">
              초기화
            </Button>
          </Link>
        )}
      </form>
      )}

      {/* 표 */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">이름</TableHead>
              <TableHead className="w-[70px]">성별</TableHead>
              <TableHead className="w-[120px]">생년월일</TableHead>
              <TableHead className="w-[70px]">나이</TableHead>
              <TableHead className="w-[140px]">반</TableHead>
              <TableHead>주 보호자</TableHead>
              <TableHead className="w-[140px]">개인정보</TableHead>
              <TableHead className="w-[100px] text-right">상태</TableHead>
              {(role === "teacher" || role === "director") && (
                <TableHead className="w-[60px] text-right">편집</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleChildren.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={(role === "teacher" || role === "director") ? 9 : 8}
                  className="text-center text-sm text-muted-foreground py-12"
                >
                  표시할 원아가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              visibleChildren.map((c) => {
                const cls = classroomById.get(c.classroom_id);
                const guardian = primaryGuardianByChild.get(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{genderLabel(c.gender)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBirth(c.birth_date)}
                    </TableCell>
                    <TableCell>{ageFromBirth(c.birth_date)}세</TableCell>
                    <TableCell>
                      {cls ? (
                        <span>
                          {cls.name}
                          {cls.age_group != null && (
                            <span className="text-muted-foreground text-xs ml-1">
                              만 {cls.age_group}세
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">미배정</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {guardian ? (
                        <div className="flex flex-col">
                          <span>
                            {guardian.name}
                            <span className="text-muted-foreground text-xs ml-1">
                              ({guardian.relation})
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {guardian.phone ?? "연락처 없음"}
                            {!guardian.hasAccount && " · 계정 없음"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">보호자 없음</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.privacy_agreed_at === null ? (
                        <Badge variant="destructive">미동의</Badge>
                      ) : (
                        <Badge variant="outline">동의</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {statusBadge(c.status)}
                    </TableCell>
                    {(role === "teacher" || role === "director") && (
                      <TableCell className="text-right">
                        <Link
                          href={`/dashboard/children/${c.id}/edit?${baseParams.toString()}`}
                          aria-label={`${c.name} 정보 편집`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}

function SummaryCell({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  const tone = warn
    ? "text-amber-600"
    : accent
      ? "text-emerald-600"
      : "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">
          명
        </span>
      </p>
    </div>
  );
}
