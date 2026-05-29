-- =============================================================
-- 유치원 관리 시스템 — 002_seed.sql
-- 개발용 시드 데이터
-- 실행 위치: Supabase Dashboard > SQL Editor (001 실행 후)
-- =============================================================

-- DEV_BYPASS: auth.users 없이 profiles 직접 삽입을 위해
-- FK/trigger 검사를 이 세션에서 일시적으로 우회한다.
-- 운영 환경에서는 절대 사용 금지. (서비스 계정으로만 실행 가능)
set session_replication_role = replica;

do $$
declare
  v_kinder_id   uuid := gen_random_uuid();
  v_class1_id   uuid := gen_random_uuid();
  v_class2_id   uuid := gen_random_uuid();
  v_class3_id   uuid := gen_random_uuid();

  -- 고정 UUID — DEV_BYPASS 모드에서 역할 전환 테스트용
  v_director_id uuid := '00000000-0000-0000-0000-000000000001';
  v_teacher_id  uuid := '00000000-0000-0000-0000-000000000002';
  v_parent1_id  uuid := '00000000-0000-0000-0000-000000000003';
  v_parent2_id  uuid := '00000000-0000-0000-0000-000000000004';
  v_admin_id    uuid := '00000000-0000-0000-0000-000000000005';

  v_child1_id   uuid := gen_random_uuid();
  v_child2_id   uuid := gen_random_uuid();
  v_child3_id   uuid := gen_random_uuid();
  v_child4_id   uuid := gen_random_uuid();
  v_child5_id   uuid := gen_random_uuid();
begin

  -- 유치원
  insert into kindergartens (id, name, director_name, address, phone)
  values (
    v_kinder_id,
    '햇님 유치원',
    '김원장',
    '서울시 강남구 햇님로 123',
    '02-1234-5678'
  );

  -- 반 3개
  insert into classrooms (id, kindergarten_id, name, age_group, capacity) values
    (v_class1_id, v_kinder_id, '햇님반',   5, 16),
    (v_class2_id, v_kinder_id, '꽃잎반',   4, 16),
    (v_class3_id, v_kinder_id, '무지개반', 3, 16);

  -- 사용자 5명
  -- 주의: auth.users 없이 profiles만 직접 삽입 (DEV_BYPASS 적용)
  insert into profiles (id, role, name, phone, is_active) values
    (v_director_id, 'director', '김원장', '010-1111-1111', true),
    (v_teacher_id,  'teacher',  '이교사', '010-2222-2222', true),
    (v_parent1_id,  'parent',   '박부모', '010-3333-3333', true),
    (v_parent2_id,  'parent',   '최부모', '010-4444-4444', true),
    (v_admin_id,    'admin',    '관리자', null,            true);

  -- 원아 5명
  insert into children (
    id, classroom_id, name, birth_date, gender, address,
    enrolled_at, status, privacy_agreed_at, privacy_agreed_by
  ) values
    (v_child1_id, v_class1_id, '박민준', '2020-03-15', 'M',
     '서울시 강남구 테헤란로 1길 10', '2024-03-02', 'active',
     now(), v_parent1_id),
    (v_child2_id, v_class2_id, '이서연', '2019-11-08', 'F',
     '서울시 서초구 반포대로 20길 5', '2023-03-06', 'active',
     now(), v_parent2_id),
    (v_child3_id, v_class3_id, '최지호', '2018-07-22', 'M',
     '서울시 송파구 올림픽로 300', '2022-03-07', 'active',
     now(), null),
    (v_child4_id, v_class1_id, '김하윤', '2020-01-30', 'F',
     '서울시 강남구 테헤란로 1길 10', '2024-03-04', 'active',
     now(), v_parent1_id),
    (v_child5_id, v_class2_id, '정우진', '2019-09-11', 'M',
     '서울시 마포구 합정로 10', '2023-03-05', 'inactive',
     null, null);  -- 미동의

  -- 계정 있는 보호자 연결
  insert into parent_child (parent_id, child_id, relation, is_primary) values
    (v_parent1_id, v_child1_id, '부', true),   -- 박부모 → 박민준
    (v_parent1_id, v_child4_id, '부', true),   -- 박부모 → 김하윤
    (v_parent2_id, v_child2_id, '모', true);   -- 최부모 → 이서연

  -- 계정 없는 보호자 (직접 기재, 비상연락처)
  insert into parent_child
    (parent_id, child_id, guardian_name, guardian_phone, relation, is_primary)
  values
    (null, v_child1_id, '박할머니',   '010-9999-0001', '조모', false),
    (null, v_child3_id, '최아버지',   '010-9999-0002', '부',   true),
    (null, v_child5_id, '정이모',     '010-9999-0003', '모',   true);

  -- 교직원 배정
  insert into staff_classrooms (staff_id, classroom_id, role_in_class, assigned_at) values
    (v_teacher_id, v_class1_id, 'lead',      '2025-03-01'),
    (v_teacher_id, v_class2_id, 'assistant', '2025-03-01');

end $$;

-- 원래대로 복구
set session_replication_role = origin;
