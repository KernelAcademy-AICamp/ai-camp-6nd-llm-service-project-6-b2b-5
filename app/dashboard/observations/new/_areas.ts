export const AREA_KEYS = [
  "physical_health",
  "communication",
  "social",
  "artistic",
  "nature",
] as const;

export type AreaKey = (typeof AREA_KEYS)[number];

export const AREA_LABELS: Record<AreaKey, string> = {
  physical_health: "신체운동·건강",
  communication: "의사소통",
  social: "사회관계",
  artistic: "예술경험",
  nature: "자연탐구",
};

export const KIND_OPTIONS = ["일상생활", "놀이"] as const;
export type KindOption = (typeof KIND_OPTIONS)[number];
