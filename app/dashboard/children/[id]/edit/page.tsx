import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  ChildRow,
  ClassroomRow,
  ParentChildRow,
  Role,
  UserProfile,
} from "@/types";
import { saveChildEdit } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["parent", "teacher", "director", "admin"];

const DEMO_USER_ID: Record<Role, string> = {
  director: "00000000-0000-0000-0000-000000000001",
  teacher: "00000000-0000-0000-0000-000000000002",
  parent: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000005",
};

type AllergyRow = {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: "mild" | "moderate" | "severe" | null;
  note: string | null;
};
type ConditionRow = {
  id: string;
  name: string;
  description: string | null;
  note: string | null;
};
type MedRow = {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
};
type VaccRow = {
  id: string;
  vaccine_name: string;
  vaccinated_at: string | null;
  next_due_at: string | null;
};
type HealthRow = {
  id: string;
  emergency_memo: string | null;
};

type SearchParams = { role?: string; user?: string };

export default async function EditChildPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const childId = params.id;
  const role: Role = ROLES.find((r) => r === searchParams.role) ?? "director";
  const activeUserId = searchParams.user || DEMO_USER_ID[role];

  const supabase = createAdminClient();

  const [
    { data: childRaw },
    { data: classroomsAll },
    { data: parentLinksRaw },
    { data: parentProfilesAll },
    { data: healthRaw },
    { data: allergiesRaw },
    { data: conditionsRaw },
    { data: medsRaw },
    { data: vaccsRaw },
  ] = await Promise.all([
    supabase.from("children").select("*").eq("id", childId).maybeSingle(),
    supabase.from("classrooms").select("*"),
    supabase.from("parent_child").select("*").eq("child_id", childId),
    supabase.from("profiles").select("*").eq("role", "parent"),
    supabase.from("child_health").select("*").eq("child_id", childId).maybeSingle(),
    supabase
      .from("child_allergies")
      .select("*")
      .eq("child_id", childId)
      .order("created_at"),
    supabase
      .from("child_conditions")
      .select("*")
      .eq("child_id", childId)
      .order("created_at"),
    supabase
      .from("child_medications")
      .select("*")
      .eq("child_id", childId)
      .order("created_at"),
    supabase
      .from("child_vaccinations")
      .select("*")
      .eq("child_id", childId)
      .order("created_at"),
  ]);

  const child = childRaw as ChildRow | null;
  if (!child) notFound();

  const classrooms = (classroomsAll ?? []) as ClassroomRow[];
  const parentLinks = (parentLinksRaw ?? []) as ParentChildRow[];
  const parentProfiles = (parentProfilesAll ?? []) as UserProfile[];
  const health = (healthRaw ?? null) as HealthRow | null;
  const allergies = (allergiesRaw ?? []) as AllergyRow[];
  const conditions = (conditionsRaw ?? []) as ConditionRow[];
  const meds = (medsRaw ?? []) as MedRow[];
  const vaccs = (vaccsRaw ?? []) as VaccRow[];

  const classroom = classrooms.find((c) => c.id === child.classroom_id);

  // 주 보호자 한 명 결정
  const primaryLink =
    parentLinks.find((l) => l.is_primary) ?? parentLinks[0] ?? null;
  let primaryPhone = "";
  let primaryName = "";
  let primaryRelation = "";
  let guardianSource: "profile" | "parent_child" | "" = "";
  let primaryParentId = "";
  let parentLinkId = "";
  if (primaryLink) {
    parentLinkId = primaryLink.id;
    primaryRelation = primaryLink.relation;
    if (primaryLink.parent_id) {
      const prof = parentProfiles.find((p) => p.id === primaryLink.parent_id);
      primaryName = prof?.name ?? "(앱 계정 보호자)";
      primaryPhone = prof?.phone ?? "";
      guardianSource = "profile";
      primaryParentId = primaryLink.parent_id;
    } else {
      primaryName = primaryLink.guardian_name ?? "";
      primaryPhone = primaryLink.guardian_phone ?? "";
      guardianSource = "parent_child";
    }
  }

  const backParams = new URLSearchParams();
  backParams.set("role", role);
  if (searchParams.user) backParams.set("user", searchParams.user);
  const backHref = `/dashboard/children?${backParams.toString()}`;

  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{child.name} 정보 편집</h1>
          <p className="text-muted-foreground mt-1">
            {classroom?.name ?? "반 미배정"} · 주소·보호자 연락처·건강 정보를 수정합니다.
          </p>
        </div>
        <Link href={backHref}>
          <Button variant="outline">← 목록으로</Button>
        </Link>
      </div>

      <form action={saveChildEdit} className="space-y-6">
        <input type="hidden" name="child_id" value={child.id} />
        <input type="hidden" name="role" value={role} />
        {searchParams.user && (
          <input type="hidden" name="user" value={searchParams.user} />
        )}
        <input type="hidden" name="recorded_by" value={activeUserId} />

        {/* 기본 정보 (편집 가능: 주소) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">기본 정보</CardTitle>
            <CardDescription>주소만 수정 가능 (이름·생년월일·반은 등록 시 결정)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField label="이름" value={child.name} />
            <ReadOnlyField label="생년월일" value={child.birth_date} />
            <ReadOnlyField
              label="성별"
              value={child.gender === "M" ? "남" : child.gender === "F" ? "여" : "-"}
            />
            <ReadOnlyField label="반" value={classroom?.name ?? "미배정"} />
            <div className="md:col-span-2">
              <Field label="주소" name="address" defaultValue={child.address ?? ""} />
            </div>
          </CardContent>
        </Card>

        {/* 보호자 연락처 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">주 보호자 연락처</CardTitle>
            <CardDescription>
              {primaryLink
                ? `${primaryName || "보호자"}${primaryRelation ? ` (${primaryRelation})` : ""}${guardianSource === "profile" ? " · 앱 계정" : ""}`
                : "등록된 주 보호자가 없습니다."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="guardian_source" value={guardianSource} />
            <input type="hidden" name="parent_link_id" value={parentLinkId} />
            <input
              type="hidden"
              name="guardian_parent_id"
              value={primaryParentId}
            />
            {primaryLink ? (
              <Field
                label="학부모 전화번호"
                name="guardian_phone"
                defaultValue={primaryPhone}
                placeholder="010-1234-5678"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                보호자 정보가 등록돼 있지 않아 편집할 수 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 응급 메모 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">응급 메모</CardTitle>
            <CardDescription>응급 상황 시 참고할 정보</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              name="emergency_memo"
              rows={3}
              defaultValue={health?.emergency_memo ?? ""}
              placeholder="응급 상황 시 알아야 할 정보 (특이체질, 비상연락 등)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>

        {/* 알레르기 */}
        <HealthSection
          title="알레르기"
          description="삭제 체크 후 저장하면 제거됩니다."
        >
          {allergies.map((a) => (
            <div
              key={a.id}
              className="grid gap-3 md:grid-cols-5 items-end border-b pb-3"
            >
              <input type="hidden" name="allergy_ids[]" value={a.id} />
              <Field
                label="알레르기"
                name={`allergy_${a.id}_allergen`}
                defaultValue={a.allergen}
              />
              <Field
                label="반응"
                name={`allergy_${a.id}_reaction`}
                defaultValue={a.reaction ?? ""}
              />
              <SeveritySelect
                name={`allergy_${a.id}_severity`}
                defaultValue={a.severity ?? ""}
              />
              <Field
                label="메모"
                name={`allergy_${a.id}_note`}
                defaultValue={a.note ?? ""}
              />
              <DeleteCheckbox name={`allergy_${a.id}_delete`} />
            </div>
          ))}
          <div className="grid gap-3 md:grid-cols-5 items-end pt-2">
            <Field
              label="알레르기 (새로 추가)"
              name="new_allergy_allergen"
              placeholder="예: 견과류"
            />
            <Field label="반응" name="new_allergy_reaction" />
            <SeveritySelect name="new_allergy_severity" defaultValue="" />
            <Field label="메모" name="new_allergy_note" />
            <div />
          </div>
        </HealthSection>

        {/* 기저질환 */}
        <HealthSection
          title="기저질환"
          description="삭제 체크 후 저장하면 제거됩니다."
        >
          {conditions.map((c) => (
            <div
              key={c.id}
              className="grid gap-3 md:grid-cols-4 items-end border-b pb-3"
            >
              <input type="hidden" name="condition_ids[]" value={c.id} />
              <Field
                label="질환명"
                name={`condition_${c.id}_name`}
                defaultValue={c.name}
              />
              <Field
                label="설명"
                name={`condition_${c.id}_description`}
                defaultValue={c.description ?? ""}
              />
              <Field
                label="메모"
                name={`condition_${c.id}_note`}
                defaultValue={c.note ?? ""}
              />
              <DeleteCheckbox name={`condition_${c.id}_delete`} />
            </div>
          ))}
          <div className="grid gap-3 md:grid-cols-4 items-end pt-2">
            <Field
              label="질환명 (새로 추가)"
              name="new_condition_name"
              placeholder="예: 천식"
            />
            <Field label="설명" name="new_condition_description" />
            <Field label="메모" name="new_condition_note" />
            <div />
          </div>
        </HealthSection>

        {/* 복용약 */}
        <HealthSection
          title="복용약"
          description="삭제 체크 후 저장하면 제거됩니다."
        >
          {meds.map((m) => (
            <div
              key={m.id}
              className="grid gap-3 md:grid-cols-6 items-end border-b pb-3"
            >
              <input type="hidden" name="med_ids[]" value={m.id} />
              <Field
                label="약명"
                name={`med_${m.id}_name`}
                defaultValue={m.name}
              />
              <Field
                label="용량"
                name={`med_${m.id}_dosage`}
                defaultValue={m.dosage ?? ""}
              />
              <Field
                label="빈도"
                name={`med_${m.id}_frequency`}
                defaultValue={m.frequency ?? ""}
              />
              <Field
                label="시작일"
                name={`med_${m.id}_start_date`}
                type="date"
                defaultValue={m.start_date ?? ""}
              />
              <Field
                label="종료일"
                name={`med_${m.id}_end_date`}
                type="date"
                defaultValue={m.end_date ?? ""}
              />
              <DeleteCheckbox name={`med_${m.id}_delete`} />
            </div>
          ))}
          <div className="grid gap-3 md:grid-cols-6 items-end pt-2">
            <Field label="약명 (새로 추가)" name="new_med_name" />
            <Field label="용량" name="new_med_dosage" />
            <Field label="빈도" name="new_med_frequency" />
            <Field label="시작일" name="new_med_start_date" type="date" />
            <Field label="종료일" name="new_med_end_date" type="date" />
            <div />
          </div>
        </HealthSection>

        {/* 예방접종 */}
        <HealthSection
          title="예방접종"
          description="삭제 체크 후 저장하면 제거됩니다."
        >
          {vaccs.map((v) => (
            <div
              key={v.id}
              className="grid gap-3 md:grid-cols-4 items-end border-b pb-3"
            >
              <input type="hidden" name="vacc_ids[]" value={v.id} />
              <Field
                label="백신명"
                name={`vacc_${v.id}_vaccine_name`}
                defaultValue={v.vaccine_name}
              />
              <Field
                label="접종일"
                name={`vacc_${v.id}_vaccinated_at`}
                type="date"
                defaultValue={v.vaccinated_at ?? ""}
              />
              <Field
                label="다음 접종 예정"
                name={`vacc_${v.id}_next_due_at`}
                type="date"
                defaultValue={v.next_due_at ?? ""}
              />
              <DeleteCheckbox name={`vacc_${v.id}_delete`} />
            </div>
          ))}
          <div className="grid gap-3 md:grid-cols-4 items-end pt-2">
            <Field
              label="백신명 (새로 추가)"
              name="new_vacc_vaccine_name"
              placeholder="예: MMR"
            />
            <Field
              label="접종일"
              name="new_vacc_vaccinated_at"
              type="date"
            />
            <Field
              label="다음 접종 예정"
              name="new_vacc_next_due_at"
              type="date"
            />
            <div />
          </div>
        </HealthSection>

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
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="h-9 px-3 flex items-center text-sm text-muted-foreground bg-muted/30 rounded-md border border-input">
        {value}
      </div>
    </div>
  );
}

function SeveritySelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">심각도</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">선택</option>
        <option value="mild">약함</option>
        <option value="moderate">보통</option>
        <option value="severe">심함</option>
      </select>
    </div>
  );
}

function DeleteCheckbox({ name }: { name: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground self-end pb-1.5 cursor-pointer">
      <input type="checkbox" name={name} className="h-4 w-4 rounded border-input" />
      <Trash2 className="h-3.5 w-3.5" />
      삭제
    </label>
  );
}

function HealthSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
