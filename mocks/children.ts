import type { ChildOption } from "@/app/dashboard/activities/new/_form";

export const MOCK_CHILDREN: ChildOption[] = [
  {
    id: "mock-child-001",
    name: "최지호",
    gender: "M",
    privacy_agreed_at: "2025-03-02T00:00:00Z",
    status: "active",
  },
  {
    id: "mock-child-002",
    name: "김소연",
    gender: "F",
    privacy_agreed_at: "2025-03-02T00:00:00Z",
    status: "active",
  },
  {
    id: "mock-child-003",
    name: "이서연",
    gender: "F",
    privacy_agreed_at: "2025-03-02T00:00:00Z",
    status: "active",
  },
  {
    id: "mock-child-004",
    name: "김도훈",
    gender: "M",
    privacy_agreed_at: null,
    status: "active",
  },
];
