-- =============================================================
-- 유치원 관리 시스템 — 015_temperament_parenting.sql
-- v5.2 개선안 반영 — 기질(temperament) + 부모 양육방식(parenting_style) DB 이전
--
-- 배경: 그동안 기질/부모성향은 TS 시드(lib/children-profiles.ts)에만 있었음.
--       원아 50명 확장에 맞춰 DB 컬럼으로 이전(검색·필터·관찰일지 연동 용이).
--
-- 적용 위치: Supabase Dashboard > SQL Editor 에서 실행
--           (또는 supabase db push — 프로젝트 link 필요)
-- 적용 시점: 원아/학부모 데이터 생성(DML) 이후 — 아래 UPDATE 가 기존 행에 기본값을 채움.
-- =============================================================

-- 1) children.temperament + sensitivity
--    기질 유형: Thomas & Chess (1977) 3분류 / 예민도: Pluess HSC 상·중·하
alter table children
  add column if not exists temperament text
    check (temperament in ('easy', 'difficult', 'slow_to_warm_up')),
  add column if not exists sensitivity text
    check (sensitivity in ('상', '중', '하'));

comment on column children.temperament is '기질 유형(Thomas&Chess): easy/difficult/slow_to_warm_up — 기본 기록방식 결정';
comment on column children.sensitivity is '기질 예민도(Pluess HSC): 상/중/하';

-- 2) profiles.parenting_style — 학부모(role=parent)의 양육방식
--    Baumrind (1991) 4분류 — 알림장 톤(민감·안전 표현 필터) 결정
alter table profiles
  add column if not exists parenting_style text
    check (parenting_style in ('authoritative', 'permissive', 'authoritarian', 'uninvolved'));

comment on column profiles.parenting_style is '양육방식(Baumrind): authoritative/permissive/authoritarian/uninvolved — 학부모 문서 톤 결정';

-- 3) 기존 데이터 랜덤 기본값 채우기 (NULL 인 것만 — 재실행 안전)
update children set
  temperament = (array['easy', 'difficult', 'slow_to_warm_up'])[floor(random() * 3) + 1],
  sensitivity = (array['상', '중', '하'])[floor(random() * 3) + 1]
where temperament is null;

update profiles set
  parenting_style = (array['authoritative', 'permissive', 'authoritarian', 'uninvolved'])[floor(random() * 4) + 1]
where role = 'parent' and parenting_style is null;

-- =============================================================
-- (phase 2 — 별도 마이그레이션 예정)
--   · observation_override_rules        : 기간별 기록방식 override("이번주만 다르게")
--   · documentation_instruction_templates: 기질/방식별 AI 작성 지침
--   · parent_tone_override_rules        : 기간별 부모 톤 override
-- 기존 TS 5차원 기질·5성향·예민도(lib/children-profiles.ts)는 보조로 유지.
-- 적용 후: lib/teacher-context.ts 의 기질 읽기를 TS→DB(children.temperament)로 전환.
-- =============================================================
