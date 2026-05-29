-- =============================================================
-- 유치원 관리 시스템 — 001_core_schema.sql
-- MVP 1단계: 대시보드 + 원아 관리에 필요한 핵심 테이블
-- 실행 위치: Supabase Dashboard > SQL Editor 또는 `supabase db push`
--
-- 실행 순서:
--   1) ENUM 타입
--   2) 공통 함수 (set_updated_at)
--   3) 테이블 6개 (FK 의존 순)
--   4) updated_at 트리거
--   5) auth.users → profiles 자동 생성 트리거
--   6) RLS 활성화
--   7) 정책 (모든 테이블이 존재해야 cross-reference 가능)
-- =============================================================


-- =============================================================
-- 0. ENUM 타입 정의
-- =============================================================

create type user_role as enum ('parent', 'teacher', 'director', 'admin');
-- parent   : 학부모
-- teacher  : 교사
-- director : 원장
-- admin    : 시스템 관리자

create type child_status as enum ('active', 'inactive', 'graduated');
-- active     : 재원중
-- inactive   : 퇴소
-- graduated  : 졸업

create type gender_type as enum ('M', 'F');
-- M : 남
-- F : 여

create type class_role as enum ('lead', 'assistant');
-- lead      : 담임교사
-- assistant : 보조교사


-- =============================================================
-- 공통 함수: updated_at 자동 갱신 trigger
-- =============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================
-- 테이블 정의 (FK 의존 순서대로)
-- =============================================================

-- 1. kindergartens — 유치원
create table kindergartens (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,       -- 유치원명
  director_name text,                       -- 원장명
  address       text,                       -- 주소
  phone         text,                       -- 전화번호
  logo_url      text,                       -- 로고 이미지 (Supabase Storage 경로)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. profiles — 사용자 프로필 (auth.users와 1:1)
create table profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  role       user_role   not null default 'parent',  -- 역할
  name       text        not null default '',         -- 이름
  phone      text,                                    -- 연락처
  avatar_url text,                                    -- 프로필사진 (Supabase Storage 경로)
  is_active  boolean     not null default true,       -- 활성여부
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. classrooms — 반
create table classrooms (
  id              uuid        primary key default gen_random_uuid(),
  kindergarten_id uuid        not null references kindergartens (id) on delete restrict,
  name            text        not null,   -- 반이름
  age_group       int,                    -- 대상연령 (만 나이)
  capacity        int,                    -- 정원
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 4. children — 원아
create table children (
  id                 uuid         primary key default gen_random_uuid(),
  classroom_id       uuid         not null references classrooms (id) on delete restrict,

  -- 기본 인적 사항
  name               text         not null,             -- 이름
  birth_date         date         not null,             -- 생년월일
  gender             gender_type,                       -- 성별 M/F
  address            text,                              -- 주소
  photo_url          text,                              -- 사진 (Supabase Storage 경로)

  -- 재원 정보
  enrolled_at        date,                              -- 입소일
  status             child_status not null default 'active', -- 재원상태

  -- 개인정보 수집·이용 동의
  privacy_agreed_at  timestamptz,                       -- 동의일시. null = 미동의
  privacy_agreed_by  uuid references profiles (id) on delete set null,
                                                        -- 동의자. 계정 삭제 시 null 유지

  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now()
);

-- 5. parent_child — 보호자-원아 연결 (다대다)
-- 계정 있는 보호자: parent_id로 연결
-- 계정 없는 보호자(비상연락처): parent_id = null, guardian_name/phone 직접 기재
-- CHECK 제약으로 두 경우 혼용 방지
create table parent_child (
  id             uuid        primary key default gen_random_uuid(),
  parent_id      uuid        references profiles (id) on delete cascade, -- nullable
  child_id       uuid        not null references children (id) on delete cascade,
  guardian_name  text,       -- 보호자이름 (parent_id = null 일 때만 기재)
  guardian_phone text,       -- 보호자연락처 (parent_id = null 일 때만 기재)
  relation       text        not null,                -- 관계 (부/모/조모 등)
  is_primary     boolean     not null default false,  -- 주보호자여부
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint chk_guardian check (
    (parent_id is not null and guardian_name is null and guardian_phone is null)
    or
    (parent_id is null and guardian_name is not null and guardian_phone is not null)
  ),

  unique (parent_id, child_id)
);

-- 6. staff_classrooms — 교직원-반 배정 (다대다)
create table staff_classrooms (
  id            uuid        primary key default gen_random_uuid(),
  staff_id      uuid        not null references profiles (id) on delete cascade,
  classroom_id  uuid        not null references classrooms (id) on delete cascade,
  role_in_class class_role  not null default 'lead', -- 반내역할
  assigned_at   date,                                -- 배정시작일
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (staff_id, classroom_id)
);


-- =============================================================
-- updated_at 자동 갱신 트리거
-- =============================================================

create trigger kindergartens_updated_at
  before update on kindergartens
  for each row execute procedure set_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

create trigger classrooms_updated_at
  before update on classrooms
  for each row execute procedure set_updated_at();

create trigger children_updated_at
  before update on children
  for each row execute procedure set_updated_at();

create trigger parent_child_updated_at
  before update on parent_child
  for each row execute procedure set_updated_at();

create trigger staff_classrooms_updated_at
  before update on staff_classrooms
  for each row execute procedure set_updated_at();


-- =============================================================
-- auth.users INSERT 시 profiles 자동 생성
-- =============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'parent'),
    coalesce(new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- =============================================================
-- RLS 활성화
-- =============================================================

alter table kindergartens    enable row level security;
alter table profiles         enable row level security;
alter table classrooms       enable row level security;
alter table children         enable row level security;
alter table parent_child     enable row level security;
alter table staff_classrooms enable row level security;


-- =============================================================
-- RLS 정책 (모든 테이블이 존재한 뒤에 생성)
-- =============================================================

-- kindergartens
create policy "kindergartens_select_authenticated"
  on kindergartens for select to authenticated using (true);

create policy "kindergartens_write_director_admin"
  on kindergartens for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- profiles
create policy "profiles_select_self"
  on profiles for select to authenticated using (id = auth.uid());

create policy "profiles_select_director_admin"
  on profiles for select to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid()
      and p.role in ('director', 'admin'))
  );

create policy "profiles_update_self"
  on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- classrooms
create policy "classrooms_select_authenticated"
  on classrooms for select to authenticated using (true);

create policy "classrooms_write_director_admin"
  on classrooms for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- children
create policy "children_select_director_admin"
  on children for select to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

create policy "children_select_teacher"
  on children for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join staff_classrooms sc on sc.staff_id = p.id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and sc.classroom_id = children.classroom_id
    )
  );

create policy "children_select_parent"
  on children for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join parent_child pc on pc.parent_id = p.id
      where p.id = auth.uid()
        and p.role = 'parent'
        and pc.child_id = children.id
    )
  );

create policy "children_write_director_admin"
  on children for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- parent_child
create policy "parent_child_select_self"
  on parent_child for select to authenticated
  using (parent_id = auth.uid());

create policy "parent_child_select_teacher"
  on parent_child for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join staff_classrooms sc on sc.staff_id = p.id
      join children c on c.classroom_id = sc.classroom_id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and c.id = parent_child.child_id
    )
  );

create policy "parent_child_select_director_admin"
  on parent_child for select to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

create policy "parent_child_write_director_admin"
  on parent_child for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );

-- staff_classrooms
create policy "staff_classrooms_select_authenticated"
  on staff_classrooms for select to authenticated using (true);

create policy "staff_classrooms_write_director_admin"
  on staff_classrooms for all to authenticated
  using (
    exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role in ('director', 'admin'))
  );
