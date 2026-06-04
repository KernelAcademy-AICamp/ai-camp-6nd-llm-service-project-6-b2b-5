# DB 개선 v5.2 검토 + 데이터 확장 정리

> 작성: 2026-06-04 · 입력: 시장조사 기반 v5.2 개선안(또랑) + 현재 DB/UX

## 1. v5.2 개선안 핵심 (해독 요약)
교사 공수 최소화 — "기질 → 기본 기록방식 자동 → 필요 시 override".
- `children.temperament` (easy/difficult/slow_to_warm_up — Thomas&Chess)
- `profiles.parenting_style` (authoritative/permissive/authoritarian/uninvolved — Baumrind)
- `observation_override_rules` — 기간별 기록방식 변경("이번주만 성장중심")
- `documentation_instruction_templates` — 기질/방식별 AI 작성 지침
- `parent_tone_override_rules` — 기간별 부모 톤 변경

## 2. 현재 구조와 비교 → 채택 제안

| v5.2 | 현재 | 결정/제안 |
|---|---|---|
| temperament/parenting_style **DB 컬럼** | 기질5칼럼·부모5성향·예민도 **TS 시드** | ✅ **DB 이전(015)**. 단일 유형값(enum) 채택, 기존 TS 5차원은 보조 유지 |
| 기질→기본 기록방식 + **override** | 없음 | ⭐ phase 2 (교사 공수 0 핵심) |
| AI 작성 지침 **템플릿** | 프롬프트 하드코딩 | phase 2 (일관성↑) |
| 부모 톤 override | 민감·안전 필터만 계획 | 후순위 |

> "추가하면 좋을 요소" 우선순위: **① 기질/부모 DB 이전(완료-마이그레이션) → ② override 테이블 → ③ 작성지침 템플릿 → ④ 부모 톤 override**

## 3. 이번에 한 작업 (데이터 확장, Supabase DML — 적용됨)
- **반 조정**: 햇님반=6세 · 꽃잎반=5세 · 무지개반(김교사)=7세, 정원 16→18
- **원아 50명**: 기존 6명 나이를 반에 맞게 조정 + 신규 44명(반별 나이 랜덤, 기본 컬럼 랜덤)
  - 햇님 17 · 꽃잎 17 · 무지개 16
- **학부모 다양 케이스**: 계정 링크 22 · 계정없는 보호자 34 · 형제(다자녀 부모) 3쌍 (원아 수 > 학부모 수)
  - 학부모 계정은 `auth.admin.createUser` → 트리거 생성 프로필 UPDATE 방식(직접 insert는 auth.users FK로 불가)

## 4. 마이그레이션 015 — **사용자 적용 필요** (DDL은 직접 실행 불가)
`supabase/migrations/015_temperament_parenting.sql`
- `children.temperament`·`sensitivity` + `profiles.parenting_style` 컬럼 추가 + 기존 행 랜덤 populate
- **적용 방법**: Supabase Dashboard > SQL Editor에 015 내용 붙여넣고 실행 (또는 프로젝트 link 후 `supabase db push`)
- 적용 전제: 위 3번 데이터(원아·학부모)가 이미 들어가 있어, 적용 시 전체 행에 기본값이 채워짐
- 적용 후 phase 2: `lib/teacher-context.ts` 기질 읽기를 TS→DB로 전환

## 5. 제약/참고
- 본 환경에선 **DDL(컬럼 추가) 직접 실행 불가**(DATABASE_URL·psql 없음, CLI 미링크) → 마이그레이션 파일만 제공
- 기존 TS 기질/성향(`lib/children-profiles.ts`)은 보조로 유지, 015 적용 후 DB가 정본
- 입력 문서 인코딩 깨짐 → 영문·SQL·테이블명 기준 해독(테이블/컬럼/근거는 정확)
