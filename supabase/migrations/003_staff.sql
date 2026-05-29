-- =============================================================
-- 유치원 관리 시스템 — 003_staff.sql
-- 교직원 상세 정보 테이블
-- 실행 위치: Supabase Dashboard > SQL Editor (001, 002 실행 후)
-- =============================================================


-- =============================================================
-- ENUM 추가
-- =============================================================

create type employment_type as enum (
  'full_time',   -- 정규직
  'part_time',   -- 시간제
  'contract'     -- 계약직
);


-- =============================================================
-- 1. staff_profiles — 교직원 상세 정보
-- =============================================================
-- profiles(role = teacher | director)와 1:1 연동.
-- 이름·연락처는 profiles에 이미 있으므로 여기서는 교직원 전용 정보만 보관.

create table staff_profiles (
  id              uuid        primary key references profiles (id) on delete cascade,
  -- profiles.id와 동일. 교직원 계정 삭제 시 함께 삭제.

  position        text,                             -- 직책 (예: 담임교사, 보조교사, 원감)
  hire_date       date,                             -- 입사일
  resign_date     date,                             -- 퇴사일. null이면 재직 중
  employment_type employment_type,                  -- 고용형태

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 퇴사일은 입사일 이후여야 함
  constraint chk_resign_after_hire check (
    resign_date is null or hire_date is null or resign_date >= hire_date
  )
);

create trigger staff_profiles_updated_at
  before update on staff_profiles
  for each row execute procedure set_updated_at();

alter table staff_profiles enable row level security;

-- 본인 정보 조회
create policy "staff_profiles_select_self"
  on staff_profiles for select to authenticated
  using (id = auth.uid());

-- director, admin은 전체 조회
create policy "staff_profiles_select_director_admin"
  on staff_profiles for select to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- director, admin만 생성·수정·삭제
create policy "staff_profiles_write_director_admin"
  on staff_profiles for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );


-- =============================================================
-- 2. staff_certifications — 교직원 자격증
-- =============================================================
-- 한 교직원이 여러 자격증을 가질 수 있어 1:N으로 분리.

create table staff_certifications (
  id          uuid        primary key default gen_random_uuid(),
  staff_id    uuid        not null references staff_profiles (id) on delete cascade,
  -- 교직원 삭제 시 자격증 정보도 함께 삭제

  name        text        not null,   -- 자격증명 (예: 보육교사 2급, 유치원 정교사 1급)
  issued_at   date,                   -- 취득일
  issuer      text,                   -- 발급기관 (예: 보건복지부)

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger staff_certifications_updated_at
  before update on staff_certifications
  for each row execute procedure set_updated_at();

alter table staff_certifications enable row level security;

-- 본인 자격증 조회
create policy "staff_certifications_select_self"
  on staff_certifications for select to authenticated
  using (staff_id = auth.uid());

-- director, admin은 전체 조회
create policy "staff_certifications_select_director_admin"
  on staff_certifications for select to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- director, admin만 생성·수정·삭제
create policy "staff_certifications_write_director_admin"
  on staff_certifications for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );


-- =============================================================
-- 3. 개발용 시드 데이터
-- =============================================================

do $$
declare
  v_director_id uuid := '00000000-0000-0000-0000-000000000001';
  v_teacher_id  uuid := '00000000-0000-0000-0000-000000000002';
begin

  -- 교직원 상세 정보
  insert into staff_profiles (id, position, hire_date, employment_type) values
    (v_director_id, '원장',   '2020-03-01', 'full_time'),
    (v_teacher_id,  '담임교사', '2024-03-01', 'full_time');

  -- 자격증
  insert into staff_certifications (staff_id, name, issued_at, issuer) values
    (v_director_id, '유치원 정교사 1급', '2010-02-15', '교육부'),
    (v_director_id, '원장 자격증',       '2019-08-20', '교육부'),
    (v_teacher_id,  '유치원 정교사 2급', '2022-02-18', '교육부'),
    (v_teacher_id,  '보육교사 2급',      '2022-06-10', '보건복지부');

end $$;
