// 1단계 매일 활동 기록 → 2단계 원아 활동 기록 핸드오프
// 기본: sessionStorage(DAILY_ACTIVITY_STORAGE_KEY) — 2단계·한줄기록·알림장·관찰일지가 읽음
// 백업: localStorage(DAILY_ACTIVITY_BACKUP_KEY) — 탭 종료/새로고침 후에도 데이터 복원

export const DAILY_ACTIVITY_STORAGE_KEY = "dorang.daily-activity.v1";
/** 새로고침·탭 종료 내구성용 localStorage 백업 키 (sessionStorage 와 동일 데이터) */
export const DAILY_ACTIVITY_BACKUP_KEY = "dorang.daily-activity.backup.v1";

export type DailyActivityHandoff = {
  classroomName: string;
  date: string; // YYYY-MM-DD
  savedAt: number; // epoch ms
  analysis: {
    activity_title: string;
    activity_description: string;
    keywords: string[];
    estimated_children: number;
    suggestion: string;
  } | null;
  clusters: Array<{
    description: string;
    childId: string | null; // 매칭된 원아
    photos: Array<{ id: string; dataUrl: string; activity?: string | null }>;
  }>;
};

/** sessionStorage 우선, 없으면 localStorage 백업에서 복원 */
export function loadHandoff(): DailyActivityHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(DAILY_ACTIVITY_STORAGE_KEY) ??
      window.localStorage.getItem(DAILY_ACTIVITY_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyActivityHandoff;
  } catch {
    return null;
  }
}

/** sessionStorage(주) + localStorage(백업) 동시 저장 */
export function saveHandoff(data: DailyActivityHandoff): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    const json = JSON.stringify(data);
    window.sessionStorage.setItem(DAILY_ACTIVITY_STORAGE_KEY, json);
    try {
      window.localStorage.setItem(DAILY_ACTIVITY_BACKUP_KEY, json);
    } catch {
      // 백업 실패(용량 초과 등)는 무시 — 주 저장소만 성공해도 됨
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "save-failed" };
  }
}

/** 핸드오프 데이터 전체 삭제 (주 + 백업) */
export function clearHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DAILY_ACTIVITY_STORAGE_KEY);
    window.localStorage.removeItem(DAILY_ACTIVITY_BACKUP_KEY);
  } catch {
    // 무시
  }
}
