/**
 * 또랑 · 15명 원아 프로필 (seed data)
 *
 * 구조(2026-06 개편):
 * - temperament(기질 5칼럼): 활동성·사회성·정서성·적응성·자기조절
 *     근거: Rothbart CBQ 3요인(외향/활발성·부정정서·의도적 통제) + Thomas&Chess(적응성·활동성)
 *     · Rothbart CBQ: https://research.bowdoin.edu/rothbart-temperament-questionnaires/instrument-descriptions/the-childrens-behavior-questionnaire/
 *     · Thomas & Chess(NYLS): https://socialsci.libretexts.org/Bookshelves/Human_Development/Lifespan_Development_(OpenStax)/04:_Social_and_Emotional_Development_in_Infants_and_Toddlers_(Birth_to_Age_3)/4.02:_Temperament_and_Personality_in_Infants_and_Toddlers
 * - parent(부모 5칼럼 = 부모 소통 성향): 소통톤선호·민감주제·안심강조점·표현수위·피드백선호
 *     용도: 학부모용 문서의 '민감·안전 표현 필터' 입력값(톤·표현 조정).
 *     ※ 보호자 단위 속성 — 실DB 전환 시 parent-keyed(parent_child/profiles)로 이전.
 *     ※ 현재 값은 비어 있음(""). 보호자 상담 입력 시 채움.
 * - sensitivity(기질 예민도): 상/중/하
 *     근거: Pluess 외(2018) Highly Sensitive Child — 저/중/고 민감성 3그룹
 *     https://www.researchgate.net/publication/319974199_Environmental_Sensitivity_in_Children_Development_of_the_Highly_Sensitive_Child_Scale_and_Identification_of_Sensitivity_Groups
 *
 * 보안 주의:
 * - `name`은 클라이언트 화면에만 사용. API 호출 시 AI에 전달하지 않는다.
 *   AI는 기질 칼럼(profileTraits)만 받아 `{이름}` 자리표시자로 출력한다.
 */

/** 기질 5칼럼 */
export type Temperament = {
  활동성: string; // 신체·에너지·주도성 (Surgency/Activity)
  사회성: string; // 또래관계·리더십·협력 (Approach/Sociability)
  정서성: string; // 기분·자신감·감정표현 (Negative Affectivity)
  적응성: string; // 새 상황 접근/회피·적응 속도 (Adaptability)
  자기조절: string; // 집중·주의지속·차례 기다리기 (Effortful Control)
};

/**
 * 부모 5칼럼 — "부모 소통 성향" (민감·안전 표현 필터용)
 *
 * 용도: 알림장 등 학부모용 문서 생성 시, 이 성향에 맞춰 톤·표현을 조정하는
 *       '민감·안전 표현 필터'의 입력값. (필터 자체는 추후 알림장 단계에서 연결)
 *
 * ※ 본래 "보호자(부모) 단위 속성"이다. 현재는 데모·TS 구조상 원아(child) 프로필에
 *    얹어 두었으나, 실DB 전환 시 parent_child / profiles(role=parent) 기반의
 *    "보호자 단위" 테이블로 이전해야 한다 (한 원아에 보호자가 여럿일 수 있음).
 */
export type ParentInfo = {
  소통톤선호: string; // 예: 따뜻하게 / 정중하게 / 간결하게
  민감주제: string; // 피해야 할 표현·주제 (예: 발달 비교, 부정 단정)
  안심강조점: string; // 강조해주길 원하는 것 (예: 작은 성취, 또래 관계)
  표현수위: string; // 직설적 vs 완곡한 표현 선호
  피드백선호: string; // 연락·소통 방식 (예: 짧게 자주 / 주 1회 상세)
};

/** 기질 예민도 (Pluess 3그룹) */
export type Sensitivity = "상" | "중" | "하";

export type ChildProfile = {
  id: string;
  name: string;
  age: 3 | 4 | 5;
  summary: string;
  temperament: Temperament; // 기질 5칼럼
  parent: ParentInfo; // 부모 5칼럼
  sensitivity: Sensitivity; // 기질 예민도
};

export const TEMPERAMENT_COLUMNS = [
  "활동성",
  "사회성",
  "정서성",
  "적응성",
  "자기조절",
] as const;

export const PARENT_COLUMNS = [
  "소통톤선호",
  "민감주제",
  "안심강조점",
  "표현수위",
  "피드백선호",
] as const;

/** 부모 칼럼 빈 값 (입력 대기 — 보호자 상담 시 채움) */
const EMPTY_PARENT: ParentInfo = {
  소통톤선호: "",
  민감주제: "",
  안심강조점: "",
  표현수위: "",
  피드백선호: "",
};

export const CHILDREN_PROFILES: ChildProfile[] = [
  {
    id: "siu",
    name: "시우",
    age: 5,
    summary: "활발하고 주도적, 자연스러운 리더십",
    temperament: {
      활동성: "신체활동에 주도적이고 대근육 발달이 빠름",
      사회성: "자연스러운 리더십, 다만 친구에게 양보는 가끔 어려움",
      정서성: "매사 자신감 있고 긍정적",
      적응성: "새 활동에 적극적으로 접근",
      자기조절: "주도성이 강해 차례·양보를 조절하는 연습 중",
    },
    parent: EMPTY_PARENT,
    sensitivity: "하",
  },
  {
    id: "minjun",
    name: "민준",
    age: 4,
    summary: "침착하고 신중, 깊이 있는 활동 선호",
    temperament: {
      활동성: "정적인 활동을 선호, 활동량은 보통",
      사회성: "혼자 깊이 있는 놀이를 선호, 대그룹 진행이 빠르면 부담",
      정서성: "침착하고 정서가 안정적",
      적응성: "새 상황은 관찰 후 천천히 참여",
      자기조절: "블록·조작 집중력이 좋고 언어 발달 우수",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "jiyeon",
    name: "지연",
    age: 4,
    summary: "예민하고 감정 기복, 1:1 관계에서 활발",
    temperament: {
      활동성: "활동적인 분위기에선 위축, 차분한 활동을 선호",
      사회성: "어른과 1:1 상호작용 시 가장 활발, 대그룹은 부담",
      정서성: "예민하고 감정 기복이 있으며 관심·인정이 큰 동기",
      적응성: "익숙한 1:1 관계에서 안정감",
      자기조절: "미술·심리 표현으로 정서를 조절",
    },
    parent: EMPTY_PARENT,
    sensitivity: "상",
  },
  {
    id: "haneul",
    name: "하늘",
    age: 3,
    summary: "친화적이고 밝음, 또래 관계 자연스러움",
    temperament: {
      활동성: "신체활동에 주도적이고 큰 동작이 편함",
      사회성: "또래 관계가 자연스럽고 친화적",
      정서성: "밝고 긍정적",
      적응성: "새 환경에 무리 없이 어울림",
      자기조절: "세밀한 소근육(미술) 작업은 흥미가 낮아 연습 필요",
    },
    parent: EMPTY_PARENT,
    sensitivity: "하",
  },
  {
    id: "yunho",
    name: "윤호",
    age: 5,
    summary: "침착하고 규칙 잘 따름, 구조화된 활동 안정",
    temperament: {
      활동성: "차분하고 안정적인 편",
      사회성: "또래 간 문제가 거의 없음",
      정서성: "정서가 안정적",
      적응성: "구조화된 활동에서 안정감",
      자기조절: "지시 따르기가 우수, 자율·주도성은 천천히 격려 필요",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "yejin",
    name: "예진",
    age: 4,
    summary: "조용하지만 관찰력 뛰어남",
    temperament: {
      활동성: "조용하고 차분함",
      사회성: "새로운 친구 관계는 천천히 형성, 신뢰하는 어른을 따름",
      정서성: "정서가 안정적이고 관찰력이 뛰어남",
      적응성: "시간을 주면 참여도가 높아짐",
      자기조절: "관심 있는 활동(미술·과학)에 깊이 있게 집중",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "daeun",
    name: "다은",
    age: 3,
    summary: "감정 표현 풍부하고 직설적",
    temperament: {
      활동성: "신체활동을 좋아하고 에너지가 높음",
      사회성: "친구 간 갈등을 직설적으로 표현",
      정서성: "감정 표현이 풍부하고 직설적",
      적응성: "흥미가 있으면 최고 집중, 아니면 금방 다른 곳으로",
      자기조절: "차례 기다리기·주의지속이 발달 과정에 있음",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "taeo",
    name: "태오",
    age: 4,
    summary: "호기심 많고 실험적",
    temperament: {
      활동성: "탐색적이고 활동적",
      사회성: "또래와 탐구를 공유",
      정서성: "호기심이 많고 긍정적",
      적응성: "새로운 것에 두려움이 적고 접근이 빠름",
      자기조절: "성공보다 과정 중심, 안전 규칙 인식이 필요",
    },
    parent: EMPTY_PARENT,
    sensitivity: "하",
  },
  {
    id: "doyun",
    name: "도윤",
    age: 5,
    summary: "배려심 있고 또래 감정에 민감",
    temperament: {
      활동성: "활동량은 보통",
      사회성: "배려심이 깊고 또래 중재 능력이 우수",
      정서성: "또래 감정과 자기 실수에 민감(완벽주의 성향)",
      적응성: "사회적 상황 적응이 좋음",
      자기조절: "언어로 갈등을 조절, 자기비판을 완화하는 지원 필요",
    },
    parent: EMPTY_PARENT,
    sensitivity: "상",
  },
  {
    id: "hojun",
    name: "호준",
    age: 3,
    summary: "신체활동 좋아하고 에너지 높음",
    temperament: {
      활동성: "에너지가 높고 대근육 발달이 빠름",
      사회성: "활동 속에서 또래와 어울림",
      정서성: "활기차고 적극적",
      적응성: "신체활동을 충분히 제공하면 안정",
      자기조절: "앉아서 하는 활동·소근육 조절을 연습 중",
    },
    parent: EMPTY_PARENT,
    sensitivity: "하",
  },
  {
    id: "seojin",
    name: "서진",
    age: 4,
    summary: "예술 감각 뛰어남, 창의적 표현",
    temperament: {
      활동성: "차분하고 표현 활동 중심",
      사회성: "또래 관계는 보통",
      정서성: "예술적 자신감이 있고 안정적",
      적응성: "익숙한 표현 활동에서 적극적",
      자기조절: "수·조작 논리 활동에는 흥미가 낮음",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "somin",
    name: "소민",
    age: 4,
    summary: "조용하고 혼자 놀이 선호",
    temperament: {
      활동성: "조용하고 활동량이 낮음",
      사회성: "단체 활동보다 자기 속도를 선호, 역할놀이는 어려움",
      정서성: "압박감에 위축되는 편",
      적응성: "자기 속도가 보장되면 편안함",
      자기조절: "혼자 완성하는 방식의 집중력이 좋음",
    },
    parent: EMPTY_PARENT,
    sensitivity: "상",
  },
  {
    id: "seowoo",
    name: "서우",
    age: 5,
    summary: "리더십 있고 포용적",
    temperament: {
      활동성: "활동적이고 적극적",
      사회성: "포용적 리더십으로 그룹 협력을 주도, 갈등 중재 우수",
      정서성: "공정성에 민감",
      적응성: "집단 활동에 잘 적응",
      자기조절: "규칙을 정하고 지키기를 능숙하게 함",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
  {
    id: "jinwoo",
    name: "진우",
    age: 3,
    summary: "까다로운 적응이나 신뢰 후 깊음",
    temperament: {
      활동성: "활동량은 보통",
      사회성: "신뢰를 형성한 뒤에는 관계가 깊음",
      정서성: "초기 낯섦·불안이 있어 어른의 일관성이 필요",
      적응성: "초기 적응이 까다롭고 예측 가능한 일과에서 안정",
      자기조절: "변화는 미리 알려주면 적응",
    },
    parent: EMPTY_PARENT,
    sensitivity: "상",
  },
  {
    id: "geonho",
    name: "건호",
    age: 4,
    summary: "숨은 리더십, 완성도 추구",
    temperament: {
      활동성: "보통, 집중형",
      사회성: "조용하게 주도하며 또래 협력이 자연스러움",
      정서성: "안정적이고 완성에 만족감을 느낌",
      적응성: "익숙한 작업에 몰입",
      자기조절: "복잡한 구조·미술적 완성도를 추구하는 끈기",
    },
    parent: EMPTY_PARENT,
    sensitivity: "중",
  },
];

export function getProfileById(id: string): ChildProfile | undefined {
  return CHILDREN_PROFILES.find((c) => c.id === id);
}

/**
 * 실제 Supabase 시드 DB 원아(이름 기준) 기질 — 관찰일지 AI 연결용.
 * children-profiles(15명 ttorang)와 실제 children 테이블 이름이 다르므로,
 * 실데이터 원아에 기질을 부여해 이름으로 매핑한다.
 * ⚠️ 데모 값 — 실제 교사·부모 관찰로 보정 필요.
 */
const SEED_DB_TEMPERAMENTS: Record<
  string,
  { temperament: Temperament; sensitivity: Sensitivity }
> = {
  박민준: {
    temperament: {
      활동성: "에너지가 높고 신체활동에 적극적",
      사회성: "또래를 이끄는 주도적 성향",
      정서성: "대체로 밝고 자신감 있음",
      적응성: "새 활동에 빠르게 접근",
      자기조절: "차례 기다리기·양보를 연습 중",
    },
    sensitivity: "하",
  },
  박하윤: {
    temperament: {
      활동성: "차분하고 활동량은 보통",
      사회성: "소규모·1:1 관계를 편안해함",
      정서성: "섬세하고 감정을 깊이 느낌",
      적응성: "새 상황은 시간을 두고 적응",
      자기조절: "집중력이 좋고 마무리가 꼼꼼함",
    },
    sensitivity: "상",
  },
  이서연: {
    temperament: {
      활동성: "표현·예술 활동 중심으로 활동적",
      사회성: "친화적이고 또래와 잘 어울림",
      정서성: "감정 표현이 풍부함",
      적응성: "익숙한 활동에 적극적",
      자기조절: "관심 활동에 몰입도가 높음",
    },
    sensitivity: "중",
  },
  정우진: {
    temperament: {
      활동성: "정적인 활동을 선호",
      사회성: "신중하게 관계를 맺음",
      정서성: "정서가 안정적",
      적응성: "관찰 후 천천히 참여",
      자기조절: "주의지속·규칙 따르기가 우수",
    },
    sensitivity: "중",
  },
  김소연: {
    temperament: {
      활동성: "활동량은 보통",
      사회성: "배려심이 깊고 또래를 중재",
      정서성: "또래 감정에 민감",
      적응성: "사회적 상황 적응이 좋음",
      자기조절: "언어로 갈등을 조절",
    },
    sensitivity: "상",
  },
  최지호: {
    temperament: {
      활동성: "호기심이 많고 활동적",
      사회성: "또래와 탐구를 공유",
      정서성: "긍정적이고 적극적",
      적응성: "새로운 것에 두려움이 적음",
      자기조절: "과정 중심, 안전 규칙 인식이 필요",
    },
    sensitivity: "하",
  },
};

/**
 * 원아 이름으로 기질·예민도 조회 (관찰일지 AI 연결용).
 * 1) 15명 ttorang 프로필 → 2) 실제 시드 DB 원아 순으로 탐색.
 */
export function getTemperamentByName(
  name: string,
): { temperament: Temperament; sensitivity: Sensitivity } | null {
  const p = CHILDREN_PROFILES.find((c) => c.name === name);
  if (p) return { temperament: p.temperament, sensitivity: p.sensitivity };
  return SEED_DB_TEMPERAMENTS[name] ?? null;
}

/**
 * AI·UI 성향 칩용 — 기질 5칼럼 값을 배열로 반환 (빈 값 제외).
 * 기존 `profile.traits` 를 대체. AI 에는 이름 없이 이 배열만 전달.
 */
export function profileTraits(p: ChildProfile): string[] {
  return TEMPERAMENT_COLUMNS.map((k) => p.temperament[k]).filter(Boolean);
}
