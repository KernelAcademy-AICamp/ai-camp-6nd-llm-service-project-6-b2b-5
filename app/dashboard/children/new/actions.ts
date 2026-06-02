"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

function asText(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function asDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = asText(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function asGender(v: FormDataEntryValue | null): "M" | "F" | null {
  const s = asText(v);
  return s === "M" || s === "F" ? s : null;
}

function asSeverity(
  v: FormDataEntryValue | null
): "mild" | "moderate" | "severe" | null {
  const s = asText(v);
  if (s === "mild" || s === "moderate" || s === "severe") return s;
  return null;
}

export async function saveChild(formData: FormData) {
  const name = asText(formData.get("name"));
  const birthDate = asDateOrNull(formData.get("birth_date"));
  const classroomId = asText(formData.get("classroom_id"));
  const recordedBy = asText(formData.get("recorded_by"));
  const roleParam = asText(formData.get("role")) ?? "director";
  const userParam = asText(formData.get("user"));

  if (!name) throw new Error("이름은 필수입니다.");
  if (!birthDate) throw new Error("생년월일은 필수입니다.");
  if (!classroomId) throw new Error("반 선택은 필수입니다.");

  const gender = asGender(formData.get("gender"));
  const address = asText(formData.get("address"));
  const enrolledAt = asDateOrNull(formData.get("enrolled_at"));
  const privacyAgreed = asText(formData.get("privacy_agreed")) === "on";
  const emergencyMemo = asText(formData.get("emergency_memo"));

  const supabase = createAdminClient();

  // 1) children insert
  const { data: child, error: childErr } = await supabase
    .from("children")
    .insert({
      classroom_id: classroomId,
      name,
      birth_date: birthDate,
      gender,
      address,
      enrolled_at: enrolledAt,
      status: "active",
      privacy_agreed_at: privacyAgreed ? new Date().toISOString() : null,
      privacy_agreed_by: privacyAgreed ? recordedBy : null,
    })
    .select("id")
    .single();

  if (childErr || !child) {
    throw new Error(`원아 등록 실패: ${childErr?.message ?? "unknown"}`);
  }
  const childId = child.id as string;

  // 2) parent_child — 학부모 정보가 있으면 (계정 없는 비상연락처 형태)
  const guardianName = asText(formData.get("guardian_name"));
  const guardianPhone = asText(formData.get("guardian_phone"));
  if (guardianName && guardianPhone) {
    const { error } = await supabase.from("parent_child").insert({
      parent_id: null,
      child_id: childId,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
      relation: "보호자",
      is_primary: true,
    });
    if (error) throw new Error(`학부모 등록 실패: ${error.message}`);
  } else if (guardianName || guardianPhone) {
    throw new Error("학부모명·전화번호는 함께 입력해야 합니다.");
  }

  // 3) child_health (응급 메모가 있을 때만)
  if (emergencyMemo) {
    const { error } = await supabase.from("child_health").insert({
      child_id: childId,
      emergency_memo: emergencyMemo,
      updated_by: recordedBy,
    });
    if (error) throw new Error(`건강정보 저장 실패: ${error.message}`);
  }

  // 3) 알레르기 (allergen 이 있을 때만)
  const allergen = asText(formData.get("allergen"));
  if (allergen) {
    const { error } = await supabase.from("child_allergies").insert({
      child_id: childId,
      allergen,
      reaction: asText(formData.get("allergy_reaction")),
      severity: asSeverity(formData.get("allergy_severity")),
      note: asText(formData.get("allergy_note")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`알레르기 저장 실패: ${error.message}`);
  }

  // 4) 기저질환
  const conditionName = asText(formData.get("condition_name"));
  if (conditionName) {
    const { error } = await supabase.from("child_conditions").insert({
      child_id: childId,
      name: conditionName,
      description: asText(formData.get("condition_description")),
      note: asText(formData.get("condition_note")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`기저질환 저장 실패: ${error.message}`);
  }

  // 5) 복용약
  const medName = asText(formData.get("med_name"));
  if (medName) {
    const { error } = await supabase.from("child_medications").insert({
      child_id: childId,
      name: medName,
      dosage: asText(formData.get("med_dosage")),
      frequency: asText(formData.get("med_frequency")),
      start_date: asDateOrNull(formData.get("med_start_date")),
      end_date: asDateOrNull(formData.get("med_end_date")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`복용약 저장 실패: ${error.message}`);
  }

  // 6) 예방접종
  const vaccineName = asText(formData.get("vaccine_name"));
  if (vaccineName) {
    const { error } = await supabase.from("child_vaccinations").insert({
      child_id: childId,
      vaccine_name: vaccineName,
      vaccinated_at: asDateOrNull(formData.get("vaccinated_at")),
      next_due_at: asDateOrNull(formData.get("next_due_at")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`예방접종 저장 실패: ${error.message}`);
  }

  revalidatePath("/dashboard/children");
  revalidatePath("/dashboard");

  const redirectParams = new URLSearchParams();
  redirectParams.set("role", roleParam);
  if (userParam) redirectParams.set("user", userParam);
  redirect(`/dashboard/children?${redirectParams.toString()}`);
}
