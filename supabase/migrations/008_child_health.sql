-- =============================================================
-- 유치원 관리 시스템 — 008_child_health.sql
-- 원아 건강 정보
-- 실행 위치: Supabase Dashboard > SQL Editor (001~007 실행 후)
-- =============================================================
-- 구조:
--   child_health       : 원아 1명당 1건 (응급상황 메모)
--   child_allergies    : 알레르기 (1:N)
--   child_conditions   : 질환·주의사항 (1:N)
--   child_medications  : 복약 관련 (1:N)
--   child_vaccinations : 예방접종 (1:N)
-- 모든 테이블에 updated_by (수정자) 포함
-- =============================================================


-- =============================================================
-- 1. child_health — 건강 기본 정보 (원아당 1건)
-- =============================================================

create table child_health (
  id              uuid        primary key default gen_random_uuid(),
  child_id        uuid        not null unique references children (id) on delete cascade,
  emergency_memo  text,                    -- 응급상황 메모 (투약 금지 약물, 주치의 연락처 등)
  updated_by      uuid        references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger child_health_updated_at
  before update on child_health
  for each row execute procedure set_updated_at();

alter table child_health enable row level security;

create policy "child_health_select_admin"
  on child_health for select to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "child_health_select_director"
  on child_health for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      join children c on c.classroom_id = cl.id
      where p.id = auth.uid() and p.role = 'director' and c.id = child_health.child_id
    )
  );

create policy "child_health_select_teacher"
  on child_health for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      join children c on c.classroom_id = sc.classroom_id
      where sc.staff_id = auth.uid() and c.id = child_health.child_id
    )
  );

create policy "child_health_select_parent"
  on child_health for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = child_health.child_id
    )
  );

create policy "child_health_write_director_admin"
  on child_health for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
  );


-- =============================================================
-- 2. child_allergies — 알레르기
-- =============================================================

create table child_allergies (
  id         uuid        primary key default gen_random_uuid(),
  child_id   uuid        not null references children (id) on delete cascade,
  allergen   text        not null,   -- 알레르기 원인 (예: 땅콩, 우유, 꽃가루)
  reaction   text,                   -- 반응 증상 (예: 두드러기, 호흡곤란)
  severity   text,                   -- 심각도 (예: 경증, 중증, 응급)
  note       text,                   -- 비고
  updated_by uuid        references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger child_allergies_updated_at
  before update on child_allergies
  for each row execute procedure set_updated_at();

alter table child_allergies enable row level security;

create policy "child_allergies_select_staff"
  on child_allergies for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'director', 'teacher'))
  );

create policy "child_allergies_select_parent"
  on child_allergies for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = child_allergies.child_id
    )
  );

create policy "child_allergies_write_director_admin"
  on child_allergies for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
  );


-- =============================================================
-- 3. child_conditions — 질환·주의사항
-- =============================================================

create table child_conditions (
  id          uuid        primary key default gen_random_uuid(),
  child_id    uuid        not null references children (id) on delete cascade,
  name        text        not null,  -- 질환명 또는 주의사항 제목 (예: 천식, 당뇨)
  description text,                  -- 상세 설명
  note        text,                  -- 교사 주의사항 메모
  updated_by  uuid        references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger child_conditions_updated_at
  before update on child_conditions
  for each row execute procedure set_updated_at();

alter table child_conditions enable row level security;

create policy "child_conditions_select_staff"
  on child_conditions for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'director', 'teacher'))
  );

create policy "child_conditions_select_parent"
  on child_conditions for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = child_conditions.child_id
    )
  );

create policy "child_conditions_write_director_admin"
  on child_conditions for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
  );


-- =============================================================
-- 4. child_medications — 복약 관련
-- =============================================================

create table child_medications (
  id          uuid        primary key default gen_random_uuid(),
  child_id    uuid        not null references children (id) on delete cascade,
  name        text        not null,  -- 약품명
  dosage      text,                  -- 용량 (예: 1회 5ml)
  frequency   text,                  -- 복용 주기 (예: 하루 3회, 식후 30분)
  start_date  date,                  -- 복용 시작일
  end_date    date,                  -- 복용 종료일 (null이면 계속 복용)
  note        text,                  -- 주의사항 메모
  updated_by  uuid        references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger child_medications_updated_at
  before update on child_medications
  for each row execute procedure set_updated_at();

alter table child_medications enable row level security;

create policy "child_medications_select_staff"
  on child_medications for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'director', 'teacher'))
  );

create policy "child_medications_select_parent"
  on child_medications for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = child_medications.child_id
    )
  );

create policy "child_medications_write_director_admin"
  on child_medications for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
  );


-- =============================================================
-- 5. child_vaccinations — 예방접종
-- =============================================================

create table child_vaccinations (
  id           uuid        primary key default gen_random_uuid(),
  child_id     uuid        not null references children (id) on delete cascade,
  vaccine_name text        not null,  -- 백신명 (예: MMR, 수두, 독감)
  vaccinated_at date,                 -- 접종일
  next_due_at  date,                  -- 다음 접종 예정일
  note         text,                  -- 메모
  updated_by   uuid        references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger child_vaccinations_updated_at
  before update on child_vaccinations
  for each row execute procedure set_updated_at();

alter table child_vaccinations enable row level security;

create policy "child_vaccinations_select_staff"
  on child_vaccinations for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'director', 'teacher'))
  );

create policy "child_vaccinations_select_parent"
  on child_vaccinations for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      where pc.parent_id = auth.uid() and pc.child_id = child_vaccinations.child_id
    )
  );

create policy "child_vaccinations_write_director_admin"
  on child_vaccinations for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('director', 'admin'))
  );
