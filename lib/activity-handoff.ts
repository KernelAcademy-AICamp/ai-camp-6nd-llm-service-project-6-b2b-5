// 1단계 매일 활동 기록 → 2단계 원아 활동 기록 sessionStorage 핸드오프

export const DAILY_ACTIVITY_STORAGE_KEY = "dorang.daily-activity.v1";

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
    photos: Array<{ id: string; dataUrl: string }>;
  }>;
};

export function loadHandoff(): DailyActivityHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DAILY_ACTIVITY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyActivityHandoff;
  } catch {
    return null;
  }
}

export function saveHandoff(data: DailyActivityHandoff): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  try {
    window.sessionStorage.setItem(DAILY_ACTIVITY_STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "save-failed" };
  }
}
