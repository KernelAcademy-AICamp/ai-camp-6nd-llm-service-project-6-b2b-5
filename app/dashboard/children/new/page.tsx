import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  ClassroomRow,
  Role,
  StaffClassroomRow,
} from "@/types";
import { saveChild } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["parent", "teacher", "director", "admin"];

const DEMO_USER_ID: Record<Role, string> = {
  director: "00000000-0000-0000-0000-000000000001",
  teacher: "00000000-0000-0000-0000-000000000002",
  parent: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000005",
};

type SearchParams = {
  role?: string;
  user?: string;
};

export default async function NewChildPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const role: Role = ROLES.find((r) => r === searchParams.role) ?? "director";
  const activeUserId = searchParams.user || DEMO_USER_ID[role];

  const supabase = createAdminClient();
  const [{ data: classroomsAll }, { data: staffLinksAll }] = await Promise.all([
    supabase
      .from("classrooms")
      .select("*")
      .order("age_group", { ascending: false }),
    supabase.from("staff_classrooms").select("*"),
  ]);

  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const staffLinks = (staffLinksAll ?? []) as StaffClassroomRow[];

  // teacher 는 본인 담당 반만
  const visibleClassrooms =
    role === "teacher"
      ? classrooms.filter((c) =>
          staffLinks.some(
            (s) => s.staff_id === activeUserId && s.classroom_id === c.id
          )
        )
      : classrooms;

  // 취소 시 돌아갈 URL (role · user 유지)
  const backParams = new URLSearchParams();
  backParams.set("role", role);
  if (searchParams.user) backParams.set("user", searchParams.user);
  const backHref = `/dashboard/children?${backParams.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">원아 등록</h1>
          <p className="text-muted-foreground mt-1">
            새 원아의 기본 정보와 건강 정보를 입력합니다. (* 필수)
          </p>
        </div>
        <Link href={backHref}>
          <Button variant="outline">← 목록으로</Button>
        </Link>
      </div>

      <form action={saveChild} className="space-y-6">
        {/* 메타 (액션에서 사용) */}
        <input type="hidden" name="role" value={role} />
        {searchParams.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        <input type="hidden" name="recorded_by" value={activeUserId} />

        {/* 기본 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">기본 정보</CardTitle>
            <CardDescription>원아 인적 사항</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="이름 *" name="name" required />
            <Field
              label="생년월일 *"
              name="birth_date"
              type="date"
              required
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">성별</label>
              <select
                name="gender"
                defaultValue=""
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">선택</option>
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">반 *</label>
              <select
                name="classroom_id"
                required
                defaultValue=""
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  반 선택
                </option>
                {visibleClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.age_group != null ? ` (만 ${c.age_group}세)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Field label="등원일" name="enrolled_at" type="date" />
            <Field label="주소" name="address" />
            <Field label="학부모명" name="guardian_name" placeholder="예: 박부모" />
            <Field
              label="학부모 전화번호"
              name="guardian_phone"
              placeholder="예: 010-1234-5678"
            />
            <div className="md:col-span-2 flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="privacy_agreed"
                name="privacy_agreed"
                className="h-4 w-4 rounded border-input"
              />
              <label
                htmlFor="privacy_agreed"
                className="text-sm text-foreground"
              >
                개인정보 수집·이용에 동의함
              </label>
            </div>
          </CardContent>
        </Card>

        {/* 건강 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">건강 정보</CardTitle>
            <CardDescription>응급 상황 시 참고용</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                응급 메모
              </label>
              <textarea
                name="emergency_memo"
                rows={3}
                placeholder="응급 상황 시 알아야 할 정보 (특이체질, 비상연락 등)"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        {/* 알레르기 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">알레르기</CardTitle>
            <CardDescription>
              해당 사항 있을 때만 입력. 알레르기을 비우면 저장되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="알레르기" name="allergen" placeholder="예: 견과류" />
            <Field
              label="반응"
              name="allergy_reaction"
              placeholder="예: 두드러기"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">심각도</label>
              <select
                name="allergy_severity"
                defaultValue=""
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">선택</option>
                <option value="mild">약함</option>
                <option value="moderate">보통</option>
                <option value="severe">심함</option>
              </select>
            </div>
            <Field label="메모" name="allergy_note" />
          </CardContent>
        </Card>

        {/* 기저질환 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">기저질환</CardTitle>
            <CardDescription>
              해당 사항 있을 때만 입력. 질환명을 비우면 저장되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="질환명" name="condition_name" placeholder="예: 천식" />
            <Field label="설명" name="condition_description" />
            <Field label="메모" name="condition_note" />
          </CardContent>
        </Card>

        {/* 복용약 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">복용약</CardTitle>
            <CardDescription>
              현재 복용 중인 약. 약명을 비우면 저장되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="약명" name="med_name" />
            <Field label="용량" name="med_dosage" placeholder="예: 5mg" />
            <Field
              label="복용 빈도"
              name="med_frequency"
              placeholder="예: 1일 2회"
            />
            <div />
            <Field label="시작일" name="med_start_date" type="date" />
            <Field label="종료일" name="med_end_date" type="date" />
          </CardContent>
        </Card>

        {/* 예방접종 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">예방접종</CardTitle>
            <CardDescription>
              백신명을 비우면 저장되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="백신명" name="vaccine_name" placeholder="예: MMR" />
            <div />
            <Field label="접종일" name="vaccinated_at" type="date" />
            <Field
              label="다음 접종 예정"
              name="next_due_at"
              type="date"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href={backHref}>
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button type="submit">저장</Button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
