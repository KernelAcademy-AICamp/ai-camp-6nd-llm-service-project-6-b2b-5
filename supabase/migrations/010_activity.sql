-- =============================================================
-- 유치원 관리 시스템 — 010_activity.sql
-- 활동 기록 흐름:
--   1단계: activity_sessions — 날짜별 활동 세션 생성
--   2단계: child_activity_photos — 촬영 사진을 아이별로 분류·저장
--   3단계: activity_records — 아이별 메모 입력 + AI 활동 기록 생성·저장
-- 알림장(011)·관찰일지(012)에서 child_activity_photos를 자동 로드하여 사용
-- 실행 위치: Supabase Dashboard > SQL Editor (001~009 실행 후)
-- =============================================================


-- =============================================================
-- 0. files — 업로드 파일 메타데이터
-- =============================================================
-- 알림장·활동 사진 등 모든 첨부 파일의 공통 메타데이터.

create table files (
  id              uuid        primary key default gen_random_uuid(),
  kindergarten_id uuid        references kindergartens (id) on delete set null,
  uploader_id     uuid        references profiles (id) on delete set null,
  bucket          text        not null,    -- Supabase Storage 버킷명 (예: child-photos)
  storage_path    text        not null,    -- 버킷 내 경로 (예: uuid/uuid.jpg)
  url             text        not null,    -- 접근 URL (Public 또는 Signed)
  file_name       text,                    -- 원본 파일명
  file_size       int,                     -- 파일 크기 (바이트)
  mime_type       text,                    -- MIME 타입 (예: image/jpeg)
  created_at      timestamptz not null default now()
);

create index idx_files_kindergarten on files (kindergarten_id);
create index idx_files_uploader     on files (uploader_id);

alter table files enable row level security;

create policy "files_select_admin"
  on files for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "files_select_same_kindergarten"
  on files for select to authenticated
  using (
    kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
  );

create policy "files_select_self"
  on files for select to authenticated
  using (uploader_id = auth.uid());

create policy "files_insert"
  on files for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
  );

create policy "files_delete_self"
  on files for delete to authenticated
  using (uploader_id = auth.uid());

create policy "files_delete_director_admin"
  on files for delete to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
    and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
  );


-- =============================================================
-- 1. activity_sessions — 활동 세션
-- =============================================================
-- 하루 활동의 묶음 단위. 반+날짜 기준.
-- 교사가 사진 업로드 전에 세션을 먼저 생성하거나,
-- 사진 업로드 시 자동 생성.

create table activity_sessions (
  id           uuid        primary key default gen_random_uuid(),
  classroom_id uuid        not null references classrooms (id) on delete restrict,
  date         date        not null,
  title        text,                    -- 활동명 (예: 봄 소풍, 미술 수업)
  created_by   uuid        references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (classroom_id, date)           -- 반+날짜당 세션 1개
);

create trigger activity_sessions_updated_at
  before update on activity_sessions
  for each row execute procedure set_updated_at();

create index idx_activity_sessions_classroom_date
  on activity_sessions (classroom_id, date desc);

alter table activity_sessions enable row level security;

create policy "activity_sessions_select_admin"
  on activity_sessions for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "activity_sessions_select_director"
  on activity_sessions for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid() and p.role = 'director'
        and cl.id = activity_sessions.classroom_id
    )
  );

create policy "activity_sessions_select_teacher"
  on activity_sessions for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      where sc.staff_id = auth.uid()
        and sc.classroom_id = activity_sessions.classroom_id
    )
  );

create policy "activity_sessions_write"
  on activity_sessions for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );


-- =============================================================
-- 2. child_activity_photos — 아이별 분류된 활동 사진
-- =============================================================
-- 교사가 업로드한 사진을 원아별로 분류·태깅.
-- 알림장·관찰일지 작성 시 이 테이블에서 사진을 자동으로 불러옴.

create table child_activity_photos (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references activity_sessions (id) on delete cascade,
  child_id     uuid        not null references children (id) on delete cascade,
  file_id      uuid        not null references files (id) on delete cascade,
  order_num    int         not null default 0,
  created_by   uuid        references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (session_id, child_id, file_id)  -- 같은 세션에서 같은 아이에게 중복 사진 방지
);

create index idx_child_activity_photos_session_child
  on child_activity_photos (session_id, child_id, order_num);

create index idx_child_activity_photos_child
  on child_activity_photos (child_id);

alter table child_activity_photos enable row level security;

create policy "child_activity_photos_select_admin"
  on child_activity_photos for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "child_activity_photos_select_director"
  on child_activity_photos for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join activity_sessions s on true
      join classrooms cl on cl.id = s.classroom_id and cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid() and p.role = 'director'
        and s.id = child_activity_photos.session_id
    )
  );

create policy "child_activity_photos_select_teacher"
  on child_activity_photos for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      join activity_sessions s on s.classroom_id = sc.classroom_id
      where sc.staff_id = auth.uid()
        and s.id = child_activity_photos.session_id
    )
  );

-- 학부모: 본인 자녀 사진만 (published 알림장 연동 후 열람)
create policy "child_activity_photos_select_parent"
  on child_activity_photos for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid()
        and pc.child_id = child_activity_photos.child_id
    )
  );

create policy "child_activity_photos_write"
  on child_activity_photos for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );


-- =============================================================
-- 3. activity_records — 활동 기록 (아이별 AI 생성)
-- =============================================================
-- 세션 내 원아 1명당 1건.
-- 교사 메모 입력 → AI가 활동 기록 자동 생성 → 저장.
-- 알림장·관찰일지 작성 시 이 내용을 자동으로 불러옴.

create table activity_records (
  id                   uuid        primary key default gen_random_uuid(),
  session_id           uuid        not null references activity_sessions (id) on delete cascade,
  child_id             uuid        not null references children (id) on delete cascade,

  memo                 text,                    -- 교사가 직접 입력한 메모 (2단계 입력)

  session_ai_content   text,                    -- 1단계 AI 내용 (세션 사진 기반 초기 생성)
  session_ai_generated_at timestamptz,          -- 1단계 AI 생성 시각

  ai_content           text,                    -- 2단계 AI 내용 (session_ai_content + memo + 사진 기반 정제)
  ai_generated_at      timestamptz,             -- 2단계 AI 생성 시각

  -- 화면에 동시 표시:
  --   session_ai_content (1단계 원본)
  --   memo (교사 입력)
  --   child_activity_photos (사진)
  --   ai_content (2단계 새 AI 내용)

  created_by           uuid        references profiles (id) on delete set null,
  updated_by           uuid        references profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (session_id, child_id)
);

create trigger activity_records_updated_at
  before update on activity_records
  for each row execute procedure set_updated_at();

create index idx_activity_records_session_child
  on activity_records (session_id, child_id);

create index idx_activity_records_child
  on activity_records (child_id);

alter table activity_records enable row level security;

create policy "activity_records_select_admin"
  on activity_records for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "activity_records_select_director"
  on activity_records for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join activity_sessions s on true
      join classrooms cl on cl.id = s.classroom_id and cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid() and p.role = 'director'
        and s.id = activity_records.session_id
    )
  );

create policy "activity_records_select_teacher"
  on activity_records for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      join activity_sessions s on s.classroom_id = sc.classroom_id
      where sc.staff_id = auth.uid()
        and s.id = activity_records.session_id
    )
  );

-- 쓰기: teacher, director, admin
create policy "activity_records_write"
  on activity_records for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );
