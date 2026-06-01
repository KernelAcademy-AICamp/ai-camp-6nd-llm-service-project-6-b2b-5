-- =============================================================
-- 유치원 관리 시스템 — 014_seed_fix.sql
-- 002_seed.sql 데이터 정합성 보정
-- 실행 위치: Supabase Dashboard > SQL Editor (002 적용 후)
--
-- 보정 항목:
--   1) 김하윤 → 박하윤 (부친 박부모와 성씨 일치)
--   2) 이서연·정우진·최지호 생년월일 보정 (반 age_group 정합)
--   3) 무지개반 담임교사 김교사(…0006) 추가
--   4) 최지호 privacy_agreed_at NULL 로 통일 (동의자 부재 → 미동의)
--
-- 모두 idempotent — 다시 실행해도 안전.
-- =============================================================

-- DEV_BYPASS: profiles 직접 삽입을 위해 auth.users FK / 트리거 우회
set session_replication_role = replica;

do $$
declare
  v_kinder_id   uuid;
  v_class3_id   uuid;
  v_teacher2_id uuid := '00000000-0000-0000-0000-000000000006';
  v_parent1_id  uuid := '00000000-0000-0000-0000-000000000003';
  v_changed     int;
begin

  -- 유치원 존재 검증 (004 패턴)
  select id into v_kinder_id from kindergartens limit 1;
  if v_kinder_id is null then
    raise exception '유치원 데이터가 없습니다. 002_seed.sql 을 먼저 실행하세요.';
  end if;


  -- -------------------------------------------------------------
  -- 1) 김하윤 → 박하윤 (부친 박부모와 성씨 일치)
  -- -------------------------------------------------------------
  -- 박부모가 부(父)·is_primary 로 연결된 자녀 중 '김하윤' 만 보정.
  update children
  set name = '박하윤'
  where name = '김하윤'
    and id in (
      select pc.child_id from parent_child pc
      where pc.parent_id = v_parent1_id
        and pc.relation = '부'
        and pc.is_primary = true
    );
  get diagnostics v_changed = row_count;
  raise notice '[1/4] 김하윤 → 박하윤: % 건', v_changed;


  -- -------------------------------------------------------------
  -- 2) 반 age_group 과 생년월일 정합
  -- -------------------------------------------------------------
  -- 만 4세반(꽃잎반) → 2021년생, 만 3세반(무지개반) → 2022년생
  -- 월·일은 유지하고 연도만 보정
  update children set birth_date = '2021-11-08' where name = '이서연';
  update children set birth_date = '2021-09-11' where name = '정우진';
  update children set birth_date = '2022-07-22' where name = '최지호';
  raise notice '[2/4] 이서연·정우진(2021년생), 최지호(2022년생) 보정 완료';


  -- -------------------------------------------------------------
  -- 3) 무지개반 담임교사 김교사(…0006) 추가
  -- -------------------------------------------------------------
  -- 3-1) profiles
  insert into profiles (id, role, name, phone, is_active, kindergarten_id)
  values (v_teacher2_id, 'teacher', '김교사', '010-6666-6666', true, v_kinder_id)
  on conflict (id) do nothing;

  -- 3-2) staff_profiles
  insert into staff_profiles (id, position, hire_date, employment_type)
  values (v_teacher2_id, '담임교사', '2024-03-01', 'full_time')
  on conflict (id) do nothing;

  -- 3-3) 자격증
  insert into staff_certifications (staff_id, name, issued_at, issuer)
  select v_teacher2_id, '유치원 정교사 2급', '2023-02-15', '교육부'
  where not exists (
    select 1 from staff_certifications where staff_id = v_teacher2_id
  );

  -- 3-4) 무지개반 lead 배정
  select id into v_class3_id from classrooms where name = '무지개반';
  if v_class3_id is null then
    raise notice '[3/4] 무지개반을 찾지 못해 담임 배정 생략';
  else
    insert into staff_classrooms (staff_id, classroom_id, role_in_class, assigned_at)
    values (v_teacher2_id, v_class3_id, 'lead', '2025-03-01')
    on conflict (staff_id, classroom_id) do nothing;
    raise notice '[3/4] 김교사 → 무지개반 담임(lead) 배정 완료';
  end if;


  -- -------------------------------------------------------------
  -- 4) 최지호 개인정보 동의 상태 정합 (동의자 없으면 미동의로 통일)
  -- -------------------------------------------------------------
  update children
  set privacy_agreed_at = null,
      privacy_agreed_by = null
  where name = '최지호'
    and privacy_agreed_by is null;
  get diagnostics v_changed = row_count;
  raise notice '[4/4] 최지호 privacy_agreed_at 초기화: % 건', v_changed;

end $$;

-- 복구
set session_replication_role = origin;
