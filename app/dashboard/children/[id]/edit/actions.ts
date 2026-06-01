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

function asSeverity(
  v: FormDataEntryValue | null
): "mild" | "moderate" | "severe" | null {
  const s = asText(v);
  if (s === "mild" || s === "moderate" || s === "severe") return s;
  return null;
}

export async function saveChildEdit(formData: FormData) {
  const childId = String(formData.get("child_id") ?? "");
  if (!childId) throw new Error("원아 ID 없음");

  const recordedBy = asText(formData.get("recorded_by"));
  const roleParam = asText(formData.get("role")) ?? "teacher";
  const userParam = asText(formData.get("user"));

  const supabase = createAdminClient();

  // 1) children.address
  const address = asText(formData.get("address"));
  {
    const { error } = await supabase
      .from("children")
      .update({ address })
      .eq("id", childId);
    if (error) throw new Error(`주소 저장 실패: ${error.message}`);
  }

  // 2) 학부모 전화번호
  const guardianPhone = asText(formData.get("guardian_phone"));
  const guardianSource = asText(formData.get("guardian_source")); // "profile" | "parent_child" | null
  const parentLinkId = asText(formData.get("parent_link_id"));
  const guardianParentId = asText(formData.get("guardian_parent_id"));

  if (guardianSource === "profile" && guardianParentId) {
    const { error } = await supabase
      .from("profiles")
      .update({ phone: guardianPhone })
      .eq("id", guardianParentId);
    if (error) throw new Error(`보호자 전화 저장 실패: ${error.message}`);
  } else if (guardianSource === "parent_child" && parentLinkId) {
    if (!guardianPhone) {
      throw new Error("계정 없는 보호자는 전화번호를 비울 수 없습니다.");
    }
    const { error } = await supabase
      .from("parent_child")
      .update({ guardian_phone: guardianPhone })
      .eq("id", parentLinkId);
    if (error) throw new Error(`보호자 전화 저장 실패: ${error.message}`);
  }

  // 3) child_health (응급 메모) — upsert
  const emergencyMemo = asText(formData.get("emergency_memo"));
  {
    const { data: existing } = await supabase
      .from("child_health")
      .select("id")
      .eq("child_id", childId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("child_health")
        .update({ emergency_memo: emergencyMemo, updated_by: recordedBy })
        .eq("id", existing.id);
      if (error) throw new Error(`응급 메모 저장 실패: ${error.message}`);
    } else if (emergencyMemo) {
      const { error } = await supabase.from("child_health").insert({
        child_id: childId,
        emergency_memo: emergencyMemo,
        updated_by: recordedBy,
      });
      if (error) throw new Error(`응급 메모 저장 실패: ${error.message}`);
    }
  }

  // 헬퍼: 기존 행 처리 (삭제 또는 업데이트)
  async function processExisting(
    table: string,
    ids: string[],
    buildPatch: (id: string) => Record<string, unknown> | null
  ) {
    for (const id of ids) {
      const wantDelete =
        asText(formData.get(`${table}_${id}_delete`)) === "on";
      if (wantDelete) {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) throw new Error(`${table} 삭제 실패: ${error.message}`);
        continue;
      }
      const patch = buildPatch(id);
      if (!patch) continue;
      const { error } = await supabase.from(table).update(patch).eq("id", id);
      if (error) throw new Error(`${table} 수정 실패: ${error.message}`);
    }
  }

  // 4) 알레르기
  const allergyIds = formData.getAll("allergy_ids[]").map(String);
  await processExisting("child_allergies", allergyIds, (id) => {
    const allergen = asText(formData.get(`allergy_${id}_allergen`));
    if (!allergen) return null; // allergen 비우면 변경 무시 (삭제 체크 안 한 경우)
    return {
      allergen,
      reaction: asText(formData.get(`allergy_${id}_reaction`)),
      severity: asSeverity(formData.get(`allergy_${id}_severity`)),
      note: asText(formData.get(`allergy_${id}_note`)),
      updated_by: recordedBy,
    };
  });
  const newAllergen = asText(formData.get("new_allergy_allergen"));
  if (newAllergen) {
    const { error } = await supabase.from("child_allergies").insert({
      child_id: childId,
      allergen: newAllergen,
      reaction: asText(formData.get("new_allergy_reaction")),
      severity: asSeverity(formData.get("new_allergy_severity")),
      note: asText(formData.get("new_allergy_note")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`알레르기 추가 실패: ${error.message}`);
  }

  // 5) 기저질환
  const conditionIds = formData.getAll("condition_ids[]").map(String);
  await processExisting("child_conditions", conditionIds, (id) => {
    const name = asText(formData.get(`condition_${id}_name`));
    if (!name) return null;
    return {
      name,
      description: asText(formData.get(`condition_${id}_description`)),
      note: asText(formData.get(`condition_${id}_note`)),
      updated_by: recordedBy,
    };
  });
  const newConditionName = asText(formData.get("new_condition_name"));
  if (newConditionName) {
    const { error } = await supabase.from("child_conditions").insert({
      child_id: childId,
      name: newConditionName,
      description: asText(formData.get("new_condition_description")),
      note: asText(formData.get("new_condition_note")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`기저질환 추가 실패: ${error.message}`);
  }

  // 6) 복용약
  const medIds = formData.getAll("med_ids[]").map(String);
  await processExisting("child_medications", medIds, (id) => {
    const name = asText(formData.get(`med_${id}_name`));
    if (!name) return null;
    return {
      name,
      dosage: asText(formData.get(`med_${id}_dosage`)),
      frequency: asText(formData.get(`med_${id}_frequency`)),
      start_date: asDateOrNull(formData.get(`med_${id}_start_date`)),
      end_date: asDateOrNull(formData.get(`med_${id}_end_date`)),
      updated_by: recordedBy,
    };
  });
  const newMedName = asText(formData.get("new_med_name"));
  if (newMedName) {
    const { error } = await supabase.from("child_medications").insert({
      child_id: childId,
      name: newMedName,
      dosage: asText(formData.get("new_med_dosage")),
      frequency: asText(formData.get("new_med_frequency")),
      start_date: asDateOrNull(formData.get("new_med_start_date")),
      end_date: asDateOrNull(formData.get("new_med_end_date")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`복용약 추가 실패: ${error.message}`);
  }

  // 7) 예방접종
  const vaccIds = formData.getAll("vacc_ids[]").map(String);
  await processExisting("child_vaccinations", vaccIds, (id) => {
    const vaccineName = asText(formData.get(`vacc_${id}_vaccine_name`));
    if (!vaccineName) return null;
    return {
      vaccine_name: vaccineName,
      vaccinated_at: asDateOrNull(formData.get(`vacc_${id}_vaccinated_at`)),
      next_due_at: asDateOrNull(formData.get(`vacc_${id}_next_due_at`)),
      updated_by: recordedBy,
    };
  });
  const newVaccineName = asText(formData.get("new_vacc_vaccine_name"));
  if (newVaccineName) {
    const { error } = await supabase.from("child_vaccinations").insert({
      child_id: childId,
      vaccine_name: newVaccineName,
      vaccinated_at: asDateOrNull(formData.get("new_vacc_vaccinated_at")),
      next_due_at: asDateOrNull(formData.get("new_vacc_next_due_at")),
      updated_by: recordedBy,
    });
    if (error) throw new Error(`예방접종 추가 실패: ${error.message}`);
  }

  revalidatePath("/dashboard/children");
  revalidatePath(`/dashboard/children/${childId}/edit`);

  const redirectParams = new URLSearchParams();
  redirectParams.set("role", roleParam);
  if (userParam) redirectParams.set("user", userParam);
  redirect(`/dashboard/children?${redirectParams.toString()}`);
}
