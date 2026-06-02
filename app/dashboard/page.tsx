import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  StaffClassroomRow,
  UserProfile,
} from "@/types";

type AttendanceRow = {
  id: string;
  child_id: string;
  classroom_id: string;
  date: string;
  status: "present" | "absent" | "approved_absent" | "sick" | "accident";
  check_in: string | null;
  check_out: string | null;
};

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatTodayKo(d: Date) {
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}. (${WEEKDAYS_KO[d.getDay()]})`;
}

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { role?: string; user?: string };
}) {
  const role: Role = ROLES.find((r) => r === searchParams?.role) ?? "director";
  const activeUserId = searchParams?.user || DEMO_USER_ID[role];
  const supabase = createAdminClient();

  const today = new Date();
  const todayIso = isoDate(today);

  const [
    { data: kinder },
    { data: classroomsAll },
    { data: childrenAll },
    { count: profileCount },
    { data: staffLinksAll },
    { data: parentLinksAll },
    { data: staffProfilesAll },
    { data: meRow },
    { data: attendanceTodayRaw },
  ] = await Promise.all([
    supabase.from("kindergartens").select("*").limit(1).single(),
    supabase.from("classrooms").select("*").order("age_group", { ascending: false }),
    supabase.from("children").select("*").order("name"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("staff_classrooms").select("*"),
    supabase.from("parent_child").select("*"),
    supabase.from("profiles").select("*").in("role", ["teacher", "director"]),
    supabase.from("profiles").select("*").eq("id", activeUserId).maybeSingle(),
    supabase
      .from("attendance")
      .select("id, child_id, classroom_id, date, status, check_in, check_out")
      .eq("date", todayIso),
  ]);

  const attendanceToday = (attendanceTodayRaw ?? []) as AttendanceRow[];

  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const children = (childrenAll ?? []) as ChildRow[];
  const staffLinks = (staffLinksAll ?? []) as StaffClassroomRow[];
  const parentLinks = (parentLinksAll ?? []) as ParentChildRow[];
  const staffProfiles = (staffProfilesAll ?? []) as UserProfile[];
  const me = (meRow ?? null) as UserProfile | null;

  // 공통 매핑
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const staffProfileById = new Map(staffProfiles.map((p) => [p.id, p]));
  const leadTeacherByClass = new Map<string, UserProfile>();
  for (const link of staffLinks) {
    if (link.role_in_class !== "lead") continue;
    const prof = staffProfileById.get(link.staff_id);
    if (prof) leadTeacherByClass.set(link.classroom_id, prof);
  }

  // 역할별 가시 데이터
  let visibleClassrooms: ClassroomRow[] = classrooms;
  let visibleChildren: ChildRow[] = children;

  if (role === "teacher") {
    const myClassIds = new Set(
      staffLinks.filter((s) => s.staff_id === activeUserId).map((s) => s.classroom_id)
    );
    visibleClassrooms = classrooms.filter((c) => myClassIds.has(c.id));
    visibleChildren = children.filter((c) => myClassIds.has(c.classroom_id));
  } else if (role === "parent") {
    const myChildIds = new Set(
      parentLinks
        .filter((l) => l.parent_id === activeUserId)
        .map((l) => l.child_id)
    );
    visibleChildren = children.filter((c) => myChildIds.has(c.id));
    const myClassIds = new Set(visibleChildren.map((c) => c.classroom_id));
    visibleClassrooms = classrooms.filter((c) => myClassIds.has(c.id));
  }

  // 헤더 문구
  const roleLabel =
    role === "parent"
      ? "학부모"
      : role === "teacher"
        ? "교사"
        : role === "admin"
          ? "관리자"
          : "원장";
  const title =
    role === "parent"
      ? `${me?.name ?? "학부모"}님의 자녀`
      : role === "teacher"
        ? `${me?.name ?? "교사"}님의 담당 반`
        : role === "admin"
          ? "전체 유치원 관리"
          : `${kinder?.name ?? "유치원"} 대시보드`;
  const subtitle =
    role === "parent"
      ? `${kinder?.name ?? "유치원"} · 자녀 ${visibleChildren.length}명`
      : role === "teacher"
        ? `담당 반 ${visibleClassrooms.length}개 · 원아 ${visibleChildren.length}명`
        : [
            kinder?.director_name && `원장: ${kinder.director_name}`,
            kinder?.address,
          ]
            .filter(Boolean)
            .join(" · ");

  return (
    <main className="container mx-auto py-10 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{roleLabel} 보기</p>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Link href="/">
          <Button variant="outline">로그아웃...</Button>
        </Link>
      </div>

      {/* 역할별 통계 */}
      {role === "parent" ? (
        <ParentView
          children={visibleChildren}
          classroomById={classroomById}
          leadTeacherByClass={leadTeacherByClass}
          role={role}
          userId={searchParams?.user}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {role === "teacher" ? (
              <>
                <StatCard label="담당 반" value={visibleClassrooms.length} suffix="개" />
                <StatCard label="담당 원아" value={visibleChildren.length} />
                <StatCard
                  label="재원중"
                  value={visibleChildren.filter((c) => c.status === "active").length}
                  accent
                />
                <StatCard
                  label="개인정보 미동의"
                  value={visibleChildren.filter((c) => c.privacy_agreed_at === null).length}
                  warn
                />
              </>
            ) : (
              <>
                <StatCard label="전체 원아" value={visibleChildren.length} />
                <StatCard
                  label="재원중"
                  value={visibleChildren.filter((c) => c.status === "active").length}
                  accent
                />
                <StatCard label="반" value={visibleClassrooms.length} suffix="개" />
                <StatCard
                  label="교직원 배정"
                  value={staffLinks.length}
                  suffix="건"
                />
              </>
            )}
          </section>

          {(role === "director" || role === "admin") && (
            <p className="text-sm text-muted-foreground">
              등록된 사용자:{" "}
              <span className="font-semibold text-foreground">
                {profileCount ?? 0}명
              </span>
              <span className="ml-3">(원장 / 교사 / 학부모 / 관리자 포함)</span>
            </p>
          )}

          {role === "director" ? (
            <AttendanceTable
              classrooms={visibleClassrooms}
              children={visibleChildren}
              attendance={attendanceToday}
              dateLabel={formatTodayKo(today)}
              role={role}
              userId={searchParams?.user}
            />
          ) : (
            <ClassroomGrid
              classrooms={visibleClassrooms}
              children={visibleChildren}
              leadTeacherByClass={leadTeacherByClass}
            />
          )}
        </>
      )}
    </main>
  );
}

function AttendanceTable({
  classrooms,
  children,
  attendance,
  dateLabel,
  role,
  userId,
}: {
  classrooms: ClassroomRow[];
  children: ChildRow[];
  attendance: AttendanceRow[];
  dateLabel: string;
  role: Role;
  userId: string | undefined;
}) {
  const activeByClass = new Map<string, number>();
  for (const c of children) {
    if (c.status !== "active") continue;
    activeByClass.set(c.classroom_id, (activeByClass.get(c.classroom_id) ?? 0) + 1);
  }

  const stats = classrooms.map((cls) => {
    const records = attendance.filter((a) => a.classroom_id === cls.id);
    const total = activeByClass.get(cls.id) ?? 0;
    const present = records.filter((a) => a.status === "present").length;
    const checkedIn = records.filter((a) => a.check_in !== null).length;
    const checkedOut = records.filter((a) => a.check_out !== null).length;
    const approvedAbsent = records.filter((a) => a.status === "approved_absent").length;
    return { cls, total, present, checkedIn, checkedOut, approvedAbsent };
  });

  const attendanceHref =
    `/dashboard/attendance?role=${role}` + (userId ? `&user=${userId}` : "");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{dateLabel} 출석 현황</CardTitle>
          <Link
            href={attendanceHref}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            출석부
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>반</TableHead>
              <TableHead>전체인원</TableHead>
              <TableHead>출석</TableHead>
              <TableHead>등/하원</TableHead>
              <TableHead>인정결석</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  표시할 반이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              stats.map((s) => (
                <TableRow key={s.cls.id}>
                  <TableCell className="font-medium">{s.cls.name}</TableCell>
                  <TableCell>{s.total}명</TableCell>
                  <TableCell>{s.present}명</TableCell>
                  <TableCell>
                    {s.checkedIn} / {s.checkedOut}
                  </TableCell>
                  <TableCell>{s.approvedAbsent}명</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ClassroomGrid({
  classrooms,
  children,
  leadTeacherByClass,
}: {
  classrooms: ClassroomRow[];
  children: ChildRow[];
  leadTeacherByClass: Map<string, UserProfile>;
}) {
  const childrenByClass = new Map<string, ChildRow[]>();
  for (const c of children) {
    const arr = childrenByClass.get(c.classroom_id) ?? [];
    arr.push(c);
    childrenByClass.set(c.classroom_id, arr);
  }

  if (classrooms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">표시할 반이 없습니다.</p>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">반별 원아 명단</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classrooms.map((cls) => {
          const list = childrenByClass.get(cls.id) ?? [];
          const lead = leadTeacherByClass.get(cls.id);
          return (
            <Card key={cls.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{cls.name}</CardTitle>
                  <Badge variant="outline">
                    {cls.age_group != null ? `만 ${cls.age_group}세` : "연령 미지정"}
                  </Badge>
                </div>
                <CardDescription>
                  정원 {cls.capacity ?? "-"}명 · 현재 {list.length}명
                  {lead && <> · 담임 {lead.name}</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 원아 없음</p>
                ) : (
                  <ul className="divide-y">
                    {list.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {ageFromBirth(c.birth_date)}세
                            {c.gender === "M" && " · 남"}
                            {c.gender === "F" && " · 여"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.privacy_agreed_at === null && (
                            <Badge variant="destructive">개인정보 미동의</Badge>
                          )}
                          {statusBadge(c.status)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ParentView({
  children,
  classroomById,
  leadTeacherByClass,
  role,
  userId,
}: {
  children: ChildRow[];
  classroomById: Map<string, ClassroomRow>;
  leadTeacherByClass: Map<string, UserProfile>;
  role: Role;
  userId: string | undefined;
}) {
  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          연결된 자녀가 없습니다.
        </CardContent>
      </Card>
    );
  }
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {children.map((c) => {
        const cls = classroomById.get(c.classroom_id);
        const lead = cls ? leadTeacherByClass.get(cls.id) : undefined;
        return (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {c.name}
                  <span className="text-muted-foreground text-sm font-normal ml-2">
                    {ageFromBirth(c.birth_date)}세
                    {c.gender === "M" && " · 남"}
                    {c.gender === "F" && " · 여"}
                  </span>
                </CardTitle>
                {statusBadge(c.status)}
              </div>
              <CardDescription>
                {cls?.name ?? "반 미배정"}
                {lead && <> · 담임 {lead.name}</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="생년월일" value={c.birth_date} />
              <Row label="등원일" value={c.enrolled_at ?? "-"} />
              <Row
                label="개인정보 동의"
                value={
                  c.privacy_agreed_at ? (
                    <Badge variant="outline">동의 완료</Badge>
                  ) : (
                    <Badge variant="destructive">미동의</Badge>
                  )
                }
              />
              <div className="pt-2">
                <Link
                  href={`/dashboard/children?role=${role}${userId ? `&user=${userId}` : ""}&my=1`}
                  className="text-xs text-primary hover:underline"
                >
                  자녀 정보 자세히 보기 →
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix = "명",
  accent = false,
  warn = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const tone = warn
    ? "text-amber-600"
    : accent
      ? "text-emerald-600"
      : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${tone}`}>
          {value}
          <span className="text-base font-normal text-muted-foreground ml-1">
            {suffix}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
