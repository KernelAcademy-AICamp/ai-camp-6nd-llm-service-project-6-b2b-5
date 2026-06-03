/**
 * 데모 전용 — 강아지 사진 기반 "원아별 자동 분류 디폴트"
 *
 * 배경: AI는 사진에서 사람(원아) 신원을 식별할 수 없고(프라이버시 원칙), 옷차림은
 * 매일 바뀌어 프로필 매칭이 불가하다. 그래서 데이터를 우리가 통제하는 강아지 사진으로
 * 대체해, "업로드된 강아지 ↔ 원아 프로필 강아지" 외형(견종) 매칭으로 자동 분류를 시연한다.
 *
 * 이미지 출처: dog.ceo (CC, 무료). public/demo-dogs/ 에 정적 보관.
 */

/** 실제 시드 DB 원아(이름) → 프로필 강아지(사진 + 견종 라벨) */
export type DemoDogProfile = { url: string; breed: string };
export const DEMO_DOG_PROFILE_BY_NAME: Record<string, DemoDogProfile> = {
  박민준: { url: "/demo-dogs/profile_beagle.jpg", breed: "비글" },
  박하윤: { url: "/demo-dogs/profile_pomeranian.jpg", breed: "포메라니안" },
  이서연: { url: "/demo-dogs/profile_golden.jpg", breed: "골든리트리버" },
  정우진: { url: "/demo-dogs/profile_pug.jpg", breed: "퍼그" },
  김소연: { url: "/demo-dogs/profile_corgi.jpg", breed: "웰시코기" },
  최지호: { url: "/demo-dogs/profile_dalmatian.jpg", breed: "달마시안" },
};

/** 업로드 디폴트용 강아지 사진 10장 (프로필과 같은 견종의 다른 사진 + 일부 2장) */
export const DEMO_UPLOAD_DOGS: string[] = [
  "/demo-dogs/up_beagle_1.jpg",
  "/demo-dogs/up_beagle_2.jpg",
  "/demo-dogs/up_pomeranian_1.jpg",
  "/demo-dogs/up_pomeranian_2.jpg",
  "/demo-dogs/up_golden_1.jpg",
  "/demo-dogs/up_golden_2.jpg",
  "/demo-dogs/up_pug_1.jpg",
  "/demo-dogs/up_corgi_1.jpg",
  "/demo-dogs/up_corgi_2.jpg",
  "/demo-dogs/up_dalmatian_1.jpg",
];

/** 이름으로 프로필 강아지(사진+견종) 조회 (없으면 null) */
export function getDemoDogProfile(name: string): DemoDogProfile | null {
  return DEMO_DOG_PROFILE_BY_NAME[name] ?? null;
}
