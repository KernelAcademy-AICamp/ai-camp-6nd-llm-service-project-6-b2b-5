export type MockChildPhoto = {
  url: string;
  order_num: number;
};

export const MOCK_CHILD_PHOTOS: Record<string, MockChildPhoto[]> = {
  "mock-child-001": [
    { url: "/mock-photos/child-001-1.jpg", order_num: 1 },
    { url: "/mock-photos/child-001-2.jpg", order_num: 2 },
  ],
  "mock-child-002": [
    { url: "/mock-photos/child-002-1.jpg", order_num: 1 },
  ],
  "mock-child-003": [
    { url: "/mock-photos/child-003-1.jpg", order_num: 1 },
    { url: "/mock-photos/child-003-2.jpg", order_num: 2 },
  ],
  "mock-child-004": [],
};
