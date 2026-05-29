-- =============================================================
-- 유치원 관리 시스템 — 007_attendance.sql
-- 원아 출결 기록
-- 실행 위치: Supabase Dashboard > SQL Editor (001~006 실행 후)
-- =============================================================

create type attendance_status as enum (
  'present',          -- 출석
  'absent',           -- 결석
  'approved_absent',  -- 인정결석 (사유 있는 결석)
  'sick',             -- 병결
  'accident'          -- 사고
);


-- =============================================================
-- attendance — 출결 기록
-- =============================================================
-- child_id + date UNIQUE (원아 1명당 날짜 1건)
-- classroom_id: 기록 시점의 소속 반 (반 이동 후에도 이력 정확성 유지)

create table attendance (
  id           uuid             primary key default gen_random_uuid(),
  child_id     uuid             not null references children (id) on delete cascade,
  classroom_id uuid             not null references classrooms (id) on delete restrict,
  -- 기록 시점의 반. 반 삭제 시 출결 기록이 있으면 삭제 차단
  date         date             not null,
  status       attendance_status not null,
  check_in     time,                        -- 등원 시각
  check_out    time,                        -- 하원 시각
  reason       text,                        -- 인정결석 사유 (status = approved_absent 일 때 입력)
  note         text,                        -- 기타 메모
  recorded_by  uuid             references profiles (id) on delete set null,
  updated_by   uuid             references profiles (id) on delete set null,
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now(),

  unique (child_id, date)
);

create trigger attendance_updated_at
  before update on attendance
  for each row execute procedure set_updated_at();

-- 반별 출석 현황 조회 (classroom_id + date 기준)
create index idx_attendance_classroom_date
  on attendance (classroom_id, date desc);

-- 원아별 출결 이력 조회
create index idx_attendance_child_date
  on attendance (child_id, date desc);

alter table attendance enable row level security;

-- admin: 전체
create policy "attendance_select_admin"
  on attendance for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- director: 본인 유치원 원아
create policy "attendance_select_director"
  on attendance for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.id = attendance.classroom_id
    )
  );

-- teacher: 담당 반
create policy "attendance_select_teacher"
  on attendance for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      where sc.staff_id = auth.uid()
        and sc.classroom_id = attendance.classroom_id
    )
  );

-- parent: 본인 자녀
create policy "attendance_select_parent"
  on attendance for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid()
        and pc.child_id = attendance.child_id
    )
  );

-- 쓰기: teacher, director, admin
create policy "attendance_write"
  on attendance for all to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('teacher', 'director', 'admin')
    )
  );
