-- =============================================================
-- 유치원 관리 시스템 — 004_add_kindergarten_to_profiles.sql
-- profiles 테이블에 kindergarten_id 추가
-- 목적: 로그인 시 소속 유치원을 단일 조회로 바로 알 수 있게 함
-- 실행 위치: Supabase Dashboard > SQL Editor (001~003 실행 후)
-- =============================================================


-- =============================================================
-- 1. profiles에 kindergarten_id 컬럼 추가
-- =============================================================

alter table profiles
  add column kindergarten_id uuid references kindergartens (id) on delete set null;
-- 유치원 삭제 시 null로 설정 (사용자 계정은 유지)

comment on column profiles.kindergarten_id is
  '소속 유치원. 로그인 시 단일 조회로 유치원 정보 접근 가능.
   MVP(단일 유치원)에서는 모든 사용자가 동일한 값을 가짐.
   다기관 확장 시 유치원별로 다른 값을 가짐.';


-- =============================================================
-- 2. 인덱스 추가 (유치원별 사용자 목록 조회 성능)
-- =============================================================

create index idx_profiles_kindergarten_id
  on profiles (kindergarten_id);


-- =============================================================
-- 3. 기존 시드 데이터에 kindergarten_id 반영
-- =============================================================
-- 002_seed.sql에서 생성된 고정 UUID 프로필에 유치원 연결.
-- kindergartens 테이블의 첫 번째(유일한) 유치원 ID를 가져와 일괄 업데이트.

do $$
declare
  v_kinder_id uuid;
begin
  select id into v_kinder_id from kindergartens limit 1;

  if v_kinder_id is null then
    raise notice '유치원 데이터가 없습니다. 002_seed.sql을 먼저 실행하세요.';
    return;
  end if;

  update profiles
  set kindergarten_id = v_kinder_id
  where kindergarten_id is null;

  raise notice '% 명의 프로필에 유치원(%)을 연결했습니다.', found, v_kinder_id;
end $$;


-- =============================================================
-- 4. RLS 정책 추가
-- =============================================================
-- 같은 유치원 소속 사용자끼리만 서로 프로필 조회 가능 (teacher → 동료 교사 등)

create policy "profiles_select_same_kindergarten"
  on profiles for select to authenticated
  using (
    kindergarten_id = (
      select kindergarten_id from profiles
      where id = auth.uid()
    )
  );
