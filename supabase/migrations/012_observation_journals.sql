-- =============================================================
-- 유치원 관리 시스템 — 012_observation_journals.sql
-- 관찰일지 (교사 전용 기록)
-- 실행 위치: Supabase Dashboard > SQL Editor (001~011 실행 후)
-- =============================================================
-- 알림장(daily_notes)과 구조는 동일하나:
--   - 학부모에게 공개 안 됨 (교사·원장·admin 전용)
--   - status 없음 (항상 교사 내부 기록)
--   - AI 생성 시각 별도 보관
-- 작성 흐름:
--   관찰일지 페이지 → 원아 선택
--   → child_activity_photos 자동 로드
--   → 사진 추가·삭제 가능
--   → AI로 관찰 내용 생성 → 저장
-- =============================================================


-- =============================================================
-- 1. observation_journals — 관찰일지
-- =============================================================

create table observation_journals (
  id               uuid        primary key default gen_random_uuid(),
  child_id         uuid        not null references children (id) on delete cascade,
  classroom_id     uuid        references classrooms (id) on delete set null,
  session_id       uuid        references activity_sessions (id) on delete set null,
  -- 해당 날짜의 활동 세션. null이면 세션 무관 관찰.
  author_id        uuid        references profiles (id) on delete set null,
  date             date        not null,
  content          text        not null,    -- 관찰 내용 (AI 생성 포함)
  ai_generated_at  timestamptz,             -- AI 생성 시각
  created_by       uuid        references profiles (id) on delete set null,
  updated_by       uuid        references profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger observation_journals_updated_at
  before update on observation_journals
  for each row execute procedure set_updated_at();

create index idx_observation_journals_child_date
  on observation_journals (child_id, date desc);

create index idx_observation_journals_classroom_date
  on observation_journals (classroom_id, date desc);

alter table observation_journals enable row level security;

-- admin: 전체
create policy "observation_journals_select_admin"
  on observation_journals for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- director: 본인 유치원 원아 관찰일지
create policy "observation_journals_select_director"
  on observation_journals for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid() and p.role = 'director'
        and cl.id = observation_journals.classroom_id
    )
  );

-- teacher: 담당 반 또는 본인이 작성한 관찰일지
create policy "observation_journals_select_teacher"
  on observation_journals for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
    and (
      author_id = auth.uid()
      or exists (
        select 1 from staff_classrooms sc
        where sc.staff_id = auth.uid()
          and sc.classroom_id = observation_journals.classroom_id
      )
    )
  );

-- parent: 접근 불가 (교사 전용)

-- 쓰기: teacher, director, admin
create policy "observation_journals_write"
  on observation_journals for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );


-- =============================================================
-- 2. observation_journal_photos — 관찰일지 첨부 사진
-- =============================================================

create table observation_journal_photos (
  id         uuid        primary key default gen_random_uuid(),
  journal_id uuid        not null references observation_journals (id) on delete cascade,
  file_id    uuid        not null references files (id) on delete cascade,
  order_num  int         not null default 0,
  created_at timestamptz not null default now(),

  unique (journal_id, file_id)
);

create index idx_observation_journal_photos_journal
  on observation_journal_photos (journal_id, order_num);

alter table observation_journal_photos enable row level security;

-- admin: 전체
create policy "observation_journal_photos_select_admin"
  on observation_journal_photos for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- director·teacher: 관찰일지 열람 권한과 동일
create policy "observation_journal_photos_select_staff"
  on observation_journal_photos for select to authenticated
  using (
    exists (
      select 1 from observation_journals oj
      join profiles p on p.id = auth.uid()
      where oj.id = observation_journal_photos.journal_id
        and p.role in ('director', 'teacher')
    )
  );

-- 쓰기: teacher, director, admin
create policy "observation_journal_photos_write"
  on observation_journal_photos for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('teacher', 'director', 'admin'))
  );
