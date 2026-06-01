"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type AttendanceStatus =
  | "present"
  | "absent"
  | "approved_absent"
  | "sick"
  | "accident";

const VALID_STATUSES: ReadonlySet<AttendanceStatus> = new Set([
  "present",
  "absent",
  "approved_absent",
  "sick",
  "accident",
]);

function asTimeOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // HTML <input type="time"> 는 "HH:MM" — postgres time 호환
  return trimmed;
}

function asTextOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function saveAttendance(formData: FormData) {
  try {
    const date = String(formData.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("날짜 형식 오류");
    }

    const recordedBy = asTextOrNull(formData.get("recorded_by"));
    const childIds = formData.getAll("child_ids[]").map(String);
    if (childIds.length === 0) {
      throw new Error("저장할 원아가 없습니다.");
    }

    const rows = childIds
      .map((childId) => {
        const status = String(formData.get(`status_${childId}`) ?? "");
        if (!VALID_STATUSES.has(status as AttendanceStatus)) return null;
        const classroomId = asTextOrNull(
          formData.get(`classroom_id_${childId}`)
        );
        if (!classroomId) return null;
        return {
          child_id: childId,
          classroom_id: classroomId,
          date,
          status: status as AttendanceStatus,
          check_in: asTimeOrNull(formData.get(`check_in_${childId}`)),
          check_out: asTimeOrNull(formData.get(`check_out_${childId}`)),
          reason: asTextOrNull(formData.get(`reason_${childId}`)),
          recorded_by: recordedBy,
          updated_by: recordedBy,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      throw new Error("유효한 입력이 없습니다.");
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "child_id,date" });

    if (error) {
      throw new Error(`저장 실패: ${error.message}`);
    }

    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    throw new Error(msg);
  }
}
