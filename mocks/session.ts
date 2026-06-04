export type MockSession = {
  id: string;
  classroom_id: string;
  date: string;
  title: string;
  session_ai_content: string;
  keywords: string[];
};

export const MOCK_SESSION: MockSession = {
  id: "mock-session-001",
  classroom_id: "mock-classroom-001",
  date: "2026-06-03",
  title: "블록 협동 다리 만들기",
  session_ai_content:
    "오늘 무지개반에서는 큰 우레탄 블록을 활용한 협동 놀이가 진행되었다. 아이들은 두세 명씩 모여 블록을 길게 이어 다리를 만들고, 인형과 자동차를 그 위로 통과시키며 놀이를 확장해갔다. 처음에는 각자 블록을 쌓다가 점차 친구의 작업을 보고 합치는 모습이 관찰되었다. 다리가 무너지면 함께 다시 세우며 시행착오를 즐겼고, 일부 아이는 \"여기 더 큰 블록 줘\" 처럼 역할을 분담하기도 했다. 교사는 가운데 큰 블록을 가져다 주거나 \"누가 가장 길게 만들었을까?\" 같은 발문으로 놀이 흐름을 지원했다.",
  keywords: ["블록놀이", "협동", "신체활동", "문제해결", "또래상호작용"],
};
