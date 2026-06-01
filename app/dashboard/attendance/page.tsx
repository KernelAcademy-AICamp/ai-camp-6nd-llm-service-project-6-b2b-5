import Link from "next/link";
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
import { saveAttendance } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["parent", "teacher", "director", "admin"];

const DEMO_USER_ID: Record<Role, string> = {
  director: "00000000-0000-0000-0000-000000000001",
  teacher: "00000000-0000-0000-0000-000000000002",
  parent: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000005",
};

type AttendanceStatus =
  | "present"
  | "absent"
  | "approved_absent"
  | "sick"
  | "accident";

type AttendanceRow = {
  id: string;
  child_id: string;
  classroom_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  reason: string | null;
  note: string | null;
};

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "출석" },
  { value: "absent", label: "결석" },
  { value: "approved_absent", label: "인정결석" },
  { value: "sick", label: "병결" },
  { value: "accident", label: "사고" },
];

function statusBadge(status: AttendanceStatus) {
  if (status === "present") return <Badge variant="success">출석</Badge>;
  if (status === "absent") return <Badge variant="destructive">결석</Badge>;
  if (status === "approved_absent") return <Badge variant="warning">인정결석</Badge>;
  if (status === "sick") return <Badge variant="secondary">병결</Badge>;
  return <Badge variant="secondary">사고</Badge>;
}

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidYm(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s);
}

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoYm(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // m 월의 마지막 일
  return { start: isoDate(start), end: isoDate(end) };
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatDateKo(s: string) {
  const d = new Date(s + "T00:00:00");
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}. (${WEEKDAYS_KO[d.getDay()]})`;
}

function formatTime(t: string | null) {
  if (!t) return "-";
  // postgres time → "HH:MM:SS" 또는 "HH:MM"
  return t.slice(0, 5);
}

type SearchParams = {
  role?: string;
  user?: string;
  date?: string;
  ym?: string;
  my?: string;
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const role: Role = ROLES.find((r) => r === searchParams.role) ?? "director";
  const activeUserId = searchParams.user || DEMO_USER_ID[role];

  if (role === "parent") {
    return <ParentSection searchParams={searchParams} activeUserId={activeUserId} />;
  }
  return <StaffSection searchParams={searchParams} role={role} activeUserId={activeUserId} />;
}

// =============================================================
// Staff (director / teacher / admin) — 출결 관리
// =============================================================

async function StaffSection({
  searchParams,
  role,
  activeUserId,
}: {
  searchParams: SearchParams;
  role: Role;
  activeUserId: string;
}) {
  const today = new Date();
  const selectedDate = isValidDate(searchParams.date) ? searchParams.date : isoDate(today);

  const supabase = createAdminClient();

  const [
    { data: classroomsAll },
    { data: childrenAll },
    { data: staffLinksAll },
    { data: attendanceRaw },
    { data: meRow },
  ] = await Promise.all([
    supabase.from("classrooms").select("*").order("age_group", { ascending: false }),
    supabase.from("children").select("*").eq("status", "active").order("name"),
    supabase.from("staff_classrooms").select("*"),
    supabase
      .from("attendance")
      .select("id, child_id, classroom_id, date, status, check_in, check_out, reason, note")
      .eq("date", selectedDate),
    supabase.from("profiles").select("*").eq("id", activeUserId).maybeSingle(),
  ]);

  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const children = (childrenAll ?? []) as ChildRow[];
  const staffLinks = (staffLinksAll ?? []) as StaffClassroomRow[];
  const attendance = (attendanceRaw ?? []) as AttendanceRow[];
  const me = (meRow ?? null) as UserProfile | null;

  // teacher 는 담당 반의 원아만 표시
  let visibleClassrooms = classrooms;
  let visibleChildren = children;
  if (role === "teacher") {
    const myClassIds = new Set(
      staffLinks.filter((s) => s.staff_id === activeUserId).map((s) => s.classroom_id)
    );
    visibleClassrooms = classrooms.filter((c) => myClassIds.has(c.id));
    visibleChildren = children.filter((c) => myClassIds.has(c.classroom_id));
  }

  const classroomById = new Map(visibleClassrooms.map((c) => [c.id, c]));
  const attendanceByChild = new Map(attendance.map((a) => [a.child_id, a]));

  // 통계
  const total = visibleChildren.length;
  const records = visibleChildren
    .map((c) => attendanceByChild.get(c.id))
    .filter((a): a is AttendanceRow => a !== undefined);
  const presentCount = records.filter((a) => a.status === "present").length;
  const approvedAbsentCount = records.filter((a) => a.status === "approved_absent").length;
  const absentCount = records.filter((a) => a.status === "absent").length;
  const unrecorded = total - records.length;

  // role/user 유지 쿼리
  const persistParams = new URLSearchParams();
  persistParams.set("role", role);
  if (searchParams.user) persistParams.set("user", searchParams.user);

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">출결 관리</h1>
          <p className="text-muted-foreground mt-1">
            {role === "teacher"
              ? `${me?.name ?? "교사"}님의 담당 반 출결을 기록합니다.`
              : "원아의 출결을 기록·조회합니다."}
          </p>
        </div>
        <Link href={`/dashboard?${persistParams.toString()}`}>
          <Button variant="outline">대시보드로</Button>
        </Link>
      </div>

      {/* 날짜 선택 */}
      <form
        action="/dashboard/attendance"
        method="GET"
        className="flex items-end gap-2 flex-wrap"
      >
        <input type="hidden" name="role" value={role} />
        {searchParams.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="date">
            날짜
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={selectedDate}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" size="sm" className="h-9">
          이동
        </Button>
        <span className="text-sm text-muted-foreground self-center ml-2">
          {formatDateKo(selectedDate)}
        </span>
      </form>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCell label="전체" value={total} />
        <SummaryCell label="출석" value={presentCount} accent />
        <SummaryCell label="결석" value={absentCount} warn />
        <SummaryCell label="인정결석" value={approvedAbsentCount} />
        <SummaryCell label="미기록" value={unrecorded} muted />
      </div>

      {/* 입력 폼 */}
      {visibleChildren.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            출결을 기록할 원아가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <form action={saveAttendance} className="space-y-4">
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="recorded_by" value={activeUserId} />

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[140px]">원아</TableHead>
                  <TableHead className="w-[120px]">반</TableHead>
                  <TableHead className="w-[140px]">상태</TableHead>
                  <TableHead className="w-[110px]">등원</TableHead>
                  <TableHead className="w-[110px]">하원</TableHead>
                  <TableHead>인정결석 사유</TableHead>
                  <TableHead>메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleChildren.map((c) => {
                  const existing = attendanceByChild.get(c.id);
                  const cls = classroomById.get(c.classroom_id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {cls?.name ?? "미배정"}
                      </TableCell>
                      <TableCell>
                        <input type="hidden" name="child_ids[]" value={c.id} />
                        <input
                          type="hidden"
                          name={`classroom_id_${c.id}`}
                          value={c.classroom_id}
                        />
                        <select
                          name={`status_${c.id}`}
                          defaultValue={existing?.status ?? "present"}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          type="time"
                          name={`check_in_${c.id}`}
                          defaultValue={existing?.check_in?.slice(0, 5) ?? ""}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="time"
                          name={`check_out_${c.id}`}
                          defaultValue={existing?.check_out?.slice(0, 5) ?? ""}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="text"
                          name={`reason_${c.id}`}
                          defaultValue={existing?.reason ?? ""}
                          placeholder="인정결석 사유"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="text"
                          name={`note_${c.id}`}
                          defaultValue={existing?.note ?? ""}
                          placeholder="메모"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button type="submit">저장</Button>
          </div>
        </form>
      )}
    </main>
  );
}

// =============================================================
// Parent — 출결 확인 (월별 통계 + 기록 리스트)
// =============================================================

async function ParentSection({
  searchParams,
  activeUserId,
}: {
  searchParams: SearchParams;
  activeUserId: string;
}) {
  const today = new Date();
  const selectedYm = isValidYm(searchParams.ym) ? searchParams.ym : isoYm(today);
  const { start, end } = monthRange(selectedYm);

  const supabase = createAdminClient();

  const [
    { data: parentLinksAll },
    { data: childrenAll },
    { data: classroomsAll },
    { data: meRow },
  ] = await Promise.all([
    supabase.from("parent_child").select("*").eq("parent_id", activeUserId),
    supabase.from("children").select("*"),
    supabase.from("classrooms").select("*"),
    supabase.from("profiles").select("*").eq("id", activeUserId).maybeSingle(),
  ]);

  const parentLinks = (parentLinksAll ?? []) as ParentChildRow[];
  const allChildren = (childrenAll ?? []) as ChildRow[];
  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const me = (meRow ?? null) as UserProfile | null;

  const myChildIds = new Set(parentLinks.map((l) => l.child_id));
  const myChildren = allChildren.filter((c) => myChildIds.has(c.id));
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));

  // 자녀들의 월 출결 일괄 조회
  let attendance: AttendanceRow[] = [];
  if (myChildren.length > 0) {
    const { data } = await supabase
      .from("attendance")
      .select("id, child_id, classroom_id, date, status, check_in, check_out, reason, note")
      .in(
        "child_id",
        myChildren.map((c) => c.id)
      )
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });
    attendance = (data ?? []) as AttendanceRow[];
  }

  const persistParams = new URLSearchParams();
  persistParams.set("role", "parent");
  if (searchParams.user) persistParams.set("user", searchParams.user);

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">출결 확인</h1>
          <p className="text-muted-foreground mt-1">
            {me?.name ?? "학부모"}님 자녀의 월별 출결 기록을 확인합니다.
          </p>
        </div>
        <Link href={`/dashboard?${persistParams.toString()}`}>
          <Button variant="outline">홈으로</Button>
        </Link>
      </div>

      {/* 월 선택 */}
      <form
        action="/dashboard/attendance"
        method="GET"
        className="flex items-end gap-2 flex-wrap"
      >
        <input type="hidden" name="role" value="parent" />
        <input type="hidden" name="my" value="1" />
        {searchParams.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="ym">
            조회 월
          </label>
          <input
            id="ym"
            name="ym"
            type="month"
            defaultValue={selectedYm}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" size="sm" className="h-9">
          조회
        </Button>
      </form>

      {myChildren.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            연결된 자녀가 없습니다.
          </CardContent>
        </Card>
      ) : (
        myChildren.map((child) => {
          const cls = classroomById.get(child.classroom_id);
          const records = attendance.filter((a) => a.child_id === child.id);
          const stats = {
            present: records.filter((a) => a.status === "present").length,
            absent: records.filter((a) => a.status === "absent").length,
            approved: records.filter((a) => a.status === "approved_absent").length,
            sick: records.filter((a) => a.status === "sick").length,
            accident: records.filter((a) => a.status === "accident").length,
          };
          const totalRecorded = records.length;
          const presentRate =
            totalRecorded > 0
              ? Math.round((stats.present / totalRecorded) * 100)
              : 0;

          return (
            <section key={child.id} className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {child.name}
                      <span className="text-muted-foreground text-sm font-normal ml-2">
                        {cls?.name ?? "반 미배정"}
                      </span>
                    </CardTitle>
                    <Badge variant="outline">
                      {selectedYm.replace("-", ".")} · 기록 {totalRecorded}건
                    </Badge>
                  </div>
                  <CardDescription>
                    출석률 {presentRate}% (출석 {stats.present}일)
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-5 gap-px bg-border text-center text-sm">
                    <ParentStatCell label="출석" value={stats.present} />
                    <ParentStatCell label="결석" value={stats.absent} warn />
                    <ParentStatCell label="인정결석" value={stats.approved} />
                    <ParentStatCell label="병결" value={stats.sick} />
                    <ParentStatCell label="사고" value={stats.accident} />
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[160px]">날짜</TableHead>
                      <TableHead className="w-[120px]">상태</TableHead>
                      <TableHead className="w-[100px]">등원</TableHead>
                      <TableHead className="w-[100px]">하원</TableHead>
                      <TableHead>인정결석 사유</TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          이 달의 출결 기록이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground">
                            {formatDateKo(r.date)}
                          </TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell>{formatTime(r.check_in)}</TableCell>
                          <TableCell>{formatTime(r.check_out)}</TableCell>
                          <TableCell className="text-sm">
                            {r.reason ?? (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.note ?? (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}

function SummaryCell({
  label,
  value,
  accent = false,
  warn = false,
  muted = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
  muted?: boolean;
}) {
  const tone = warn
    ? "text-amber-600"
    : accent
      ? "text-emerald-600"
      : muted
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">명</span>
      </p>
    </div>
  );
}

function ParentStatCell({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="bg-card py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-bold mt-1 ${warn ? "text-amber-600" : "text-foreground"}`}
      >
        {value}
        <span className="text-xs font-normal text-muted-foreground ml-0.5">일</span>
      </p>
    </div>
  );
}
