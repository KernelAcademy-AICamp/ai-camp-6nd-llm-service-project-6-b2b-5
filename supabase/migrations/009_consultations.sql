-- =============================================================
-- 유치원 관리 시스템 — 009_consultations.sql
-- 학부모 상담 기록
-- 실행 위치: Supabase Dashboard > SQL Editor (001~008 실행 후)
-- =============================================================

create type consultation_method as enum (
  'face_to_face',  -- 대면
  'phone',         -- 전화
  'video',         -- 화상
  'message'        -- 문자·메시지
);


-- =============================================================
-- consultations — 상담 기록
-- =============================================================

create table consultations (
  id                uuid                primary key default gen_random_uuid(),
  child_id          uuid                not null references children (id) on delete cascade,
  classroom_id      uuid                references classrooms (id) on delete set null,
  -- 상담 시점의 소속 반. 반 이동 후에도 이력 정확성 유지.
  -- 삭제 시 null 유지 (상담 기록 보존)
  parent_child_id   uuid                references parent_child (id) on delete set null,
  -- 상담에 참여한 보호자 (parent_child 경유로 계정 있는 보호자·비상연락처 모두 커버)
  -- 삭제 시 null 유지 (상담 기록 보존)
  teacher_id        uuid                references profiles (id) on delete set null,
  -- 상담 교사. 삭제 시 null 유지 (상담 기록 보존)
  consultation_date date                not null,
  method            consultation_method not null,
  content           text                not null,   -- 상담 내용
  follow_up         text,                           -- 후속 조치
  created_by        uuid                references profiles (id) on delete set null,
  updated_by        uuid                references profiles (id) on delete set null,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

create trigger consultations_updated_at
  before update on consultations
  for each row execute procedure set_updated_at();

-- 반별 상담 현황 조회
create index idx_consultations_classroom_date
  on consultations (classroom_id, consultation_date desc);

-- 원아별 상담 이력 조회
create index idx_consultations_child_date
  on consultations (child_id, consultation_date desc);

-- 보호자별 상담 이력 조회
create index idx_consultations_parent_child
  on consultations (parent_child_id);

alter table consultations enable row level security;

-- admin: 전체
create policy "consultations_select_admin"
  on consultations for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- director: 본인 유치원 원아 상담
create policy "consultations_select_director"
  on consultations for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.id = consultations.classroom_id
    )
  );

-- teacher: 담당 반 또는 본인이 진행한 상담
create policy "consultations_select_teacher"
  on consultations for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
    and (
      teacher_id = auth.uid()
      or exists (
        select 1 from staff_classrooms sc
        where sc.staff_id = auth.uid()
          and sc.classroom_id = consultations.classroom_id
      )
    )
  );

-- parent: 본인과 관련된 상담만
-- parent_child_id 기준 (본인이 참여한 상담) 또는 자녀 기준
create policy "consultations_select_parent"
  on consultations for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid()
        and (
          pc.id = consultations.parent_child_id
          or pc.child_id = consultations.child_id
        )
    )
  );

-- 쓰기: teacher, director, admin
create policy "consultations_write"
  on consultations for all to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('teacher', 'director', 'admin')
    )
  );
