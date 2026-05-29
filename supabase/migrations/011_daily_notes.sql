-- =============================================================
-- 유치원 관리 시스템 — 011_daily_notes.sql
-- 알림장 + 첨부 사진
-- files 테이블은 010_activity.sql에서 정의됨.
-- 실행 위치: Supabase Dashboard > SQL Editor (001~010 실행 후)
-- =============================================================


-- =============================================================
-- 1. daily_notes — 알림장
-- =============================================================
-- status: draft(임시저장, 부모 열람 불가) / published(저장, 부모 열람 가능)

create type note_status as enum (
  'draft',      -- 임시저장 (교사만 열람)
  'published'   -- 저장 (학부모 열람 가능)
);

create type mood_type as enum (
  'great',  -- 매우 좋음
  'good',   -- 좋음
  'fair',   -- 보통
  'poor'    -- 안 좋음
);

create table daily_notes (
  id           uuid        primary key default gen_random_uuid(),
  child_id     uuid        not null references children (id) on delete cascade,
  classroom_id uuid        references classrooms (id) on delete set null,
  session_id   uuid        references activity_sessions (id) on delete set null,
  -- 기반이 된 활동 세션. null이면 세션 없이 직접 작성.
  -- 세션이 있으면 ai_content + 사진 자동 로드에 사용.
  author_id    uuid        references profiles (id) on delete set null,
  date         date        not null,
  content      text        not null,
  mood         mood_type,
  status       note_status not null default 'draft',
  -- draft: 임시저장. 학부모 열람 불가.
  -- published: 저장 완료. 학부모 열람 가능.
  is_read      boolean     not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger daily_notes_updated_at
  before update on daily_notes
  for each row execute procedure set_updated_at();

create index idx_daily_notes_child_date     on daily_notes (child_id, date desc);
create index idx_daily_notes_classroom_date on daily_notes (classroom_id, date desc);

alter table daily_notes enable row level security;

create policy "daily_notes_select_admin"
  on daily_notes for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "daily_notes_select_director"
  on daily_notes for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid() and p.role = 'director'
        and cl.id = daily_notes.classroom_id
    )
  );

create policy "daily_notes_select_teacher"
  on daily_notes for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
    and (
      author_id = auth.uid()
      or exists (
        select 1 from staff_classrooms sc
        where sc.staff_id = auth.uid() and sc.classroom_id = daily_notes.classroom_id
      )
    )
  );

-- 학부모: published 상태만 열람 가능
create policy "daily_notes_select_parent"
  on daily_notes for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = daily_notes.child_id
    )
  );

create policy "daily_notes_write"
  on daily_notes for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );

-- 학부모 읽음 처리: is_read·read_at 컬럼만 수정 가능
create policy "daily_notes_mark_read"
  on daily_notes for update to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = daily_notes.child_id
    )
  )
  with check (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = daily_notes.child_id
    )
  );


-- =============================================================
-- 2. note_photos — 알림장 첨부 사진
-- =============================================================

create table note_photos (
  id         uuid        primary key default gen_random_uuid(),
  note_id    uuid        not null references daily_notes (id) on delete cascade,
  file_id    uuid        not null references files (id) on delete cascade,
  order_num  int         not null default 0,
  created_at timestamptz not null default now(),

  unique (note_id, file_id)
);

create index idx_note_photos_note_id on note_photos (note_id, order_num);

alter table note_photos enable row level security;

create policy "note_photos_select_admin"
  on note_photos for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "note_photos_select_staff"
  on note_photos for select to authenticated
  using (
    exists (
      select 1 from daily_notes dn
      join profiles p on p.id = auth.uid()
      where dn.id = note_photos.note_id and p.role in ('director', 'teacher')
    )
  );

create policy "note_photos_select_parent"
  on note_photos for select to authenticated
  using (
    exists (
      select 1 from daily_notes dn
      join parent_child pc on pc.child_id = dn.child_id
      where dn.id = note_photos.note_id
        and dn.status = 'published'
        and pc.parent_id = auth.uid()
    )
  );

create policy "note_photos_write"
  on note_photos for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );
