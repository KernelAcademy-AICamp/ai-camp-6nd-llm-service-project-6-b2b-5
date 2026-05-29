-- =============================================================
-- 유치원 관리 시스템 — 005_rls.sql
-- 전체 RLS 정책 재정의
-- 목적:
--   1. admin — 모든 유치원 데이터 조회 가능
--   2. director — 본인 소속 유치원 데이터만 조회 가능
--   3. teacher — 담당 반 원아·보호자, 같은 유치원 교직원만 조회 가능
--   4. parent — 본인 자녀, 자녀 담당 교사만 조회 가능
-- 실행 위치: Supabase Dashboard > SQL Editor (001~004 실행 후)
-- =============================================================

-- =============================================================
-- 설계 원칙
-- =============================================================
-- admin    : 모든 유치원 모든 데이터
-- director : 본인 소속 유치원 전체
-- teacher  : 담당 반 원아 + 해당 보호자 + 같은 유치원 교직원
-- parent   : 본인 자녀 + 자녀 담당 교사 정보 (다른 학부모 정보 불가)
-- =============================================================


-- =============================================================
-- 1. profiles
-- =============================================================

drop policy if exists "profiles_select_director_admin"       on profiles;
drop policy if exists "profiles_select_same_kindergarten"    on profiles;

-- admin: 모든 프로필 조회
create policy "profiles_select_admin"
  on profiles for select to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- director: 본인 소속 유치원 프로필만
create policy "profiles_select_director"
  on profiles for select to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'director')
    and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
  );

-- teacher: 본인 + 같은 유치원 교직원 + 담당 반 학부모
create policy "profiles_select_teacher"
  on profiles for select to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher')
    and (
      -- 본인 프로필
      id = auth.uid()
      or
      -- 같은 유치원 교직원 (director·teacher)
      (
        role in ('teacher', 'director')
        and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
      )
      or
      -- 담당 반 원아의 보호자 (앱 계정 있는 학부모)
      (
        role = 'parent'
        and exists (
          select 1 from parent_child pc
          join children c on c.id = pc.child_id
          join staff_classrooms sc on sc.classroom_id = c.classroom_id
          where pc.parent_id = profiles.id
            and sc.staff_id = auth.uid()
        )
      )
    )
  );

-- parent: 본인 + 자녀 담당 교직원 (다른 학부모 정보 불가)
create policy "profiles_select_parent"
  on profiles for select to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'parent')
    and (
      -- 본인 프로필
      id = auth.uid()
      or
      -- 자녀가 속한 유치원의 교직원 (teacher·director만, 다른 parent 불가)
      (
        role in ('teacher', 'director')
        and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
      )
    )
  );


-- =============================================================
-- 2. kindergartens
-- =============================================================

drop policy if exists "kindergartens_select_authenticated"   on kindergartens;
drop policy if exists "kindergartens_select_admin"           on kindergartens;
drop policy if exists "kindergartens_select_own"             on kindergartens;

-- admin: 모든 유치원
create policy "kindergartens_select_admin"
  on kindergartens for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 그 외: 본인 소속 유치원만
create policy "kindergartens_select_own"
  on kindergartens for select to authenticated
  using (
    id = (select kindergarten_id from profiles where id = auth.uid())
  );


-- =============================================================
-- 3. classrooms
-- =============================================================

drop policy if exists "classrooms_select_authenticated"      on classrooms;
drop policy if exists "classrooms_select_admin"              on classrooms;
drop policy if exists "classrooms_select_own_kindergarten"   on classrooms;

-- admin: 모든 반
create policy "classrooms_select_admin"
  on classrooms for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 전체 반
create policy "classrooms_select_director"
  on classrooms for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'director')
    and kindergarten_id = (select kindergarten_id from profiles where id = auth.uid())
  );

-- teacher: 본인이 배정된 반만
create policy "classrooms_select_teacher"
  on classrooms for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      join profiles p on p.id = sc.staff_id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and sc.classroom_id = classrooms.id
    )
  );

-- parent: 본인 자녀가 속한 반만
create policy "classrooms_select_parent"
  on classrooms for select to authenticated
  using (
    exists (
      select 1 from children c
      join parent_child pc on pc.child_id = c.id
      join profiles p on p.id = pc.parent_id
      where p.id = auth.uid()
        and p.role = 'parent'
        and c.classroom_id = classrooms.id
    )
  );


-- =============================================================
-- 4. children
-- =============================================================

drop policy if exists "children_select_director_admin"       on children;
drop policy if exists "children_select_admin"                on children;
drop policy if exists "children_select_director"             on children;
-- teacher·parent 정책(001)은 이미 올바르게 제한되어 있어 유지

-- admin: 모든 원아
create policy "children_select_admin"
  on children for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 원아만
create policy "children_select_director"
  on children for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.id = children.classroom_id
    )
  );


-- =============================================================
-- 5. parent_child
-- =============================================================

drop policy if exists "parent_child_select_director_admin"   on parent_child;
drop policy if exists "parent_child_select_teacher"          on parent_child;  -- 001에서 이미 올바름, 재확인용

-- admin: 전체
create policy "parent_child_select_admin"
  on parent_child for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 원아의 보호자 정보
create policy "parent_child_select_director"
  on parent_child for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      join children c on c.classroom_id = cl.id
      where p.id = auth.uid()
        and p.role = 'director'
        and c.id = parent_child.child_id
    )
  );

-- teacher: 담당 반 원아의 보호자 정보만
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


-- =============================================================
-- 6. staff_classrooms
-- =============================================================

drop policy if exists "staff_classrooms_select_authenticated"     on staff_classrooms;
drop policy if exists "staff_classrooms_select_admin"             on staff_classrooms;
drop policy if exists "staff_classrooms_select_own_kindergarten"  on staff_classrooms;

-- admin: 전체
create policy "staff_classrooms_select_admin"
  on staff_classrooms for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 배정
create policy "staff_classrooms_select_director"
  on staff_classrooms for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.id = staff_classrooms.classroom_id
    )
  );

-- teacher: 본인 배정 + 같은 유치원 동료 배정 (일정 협의 등 목적)
create policy "staff_classrooms_select_teacher"
  on staff_classrooms for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and cl.id = staff_classrooms.classroom_id
    )
  );

-- parent: 자녀 담당 반의 교사 배정만
create policy "staff_classrooms_select_parent"
  on staff_classrooms for select to authenticated
  using (
    exists (
      select 1 from children c
      join parent_child pc on pc.child_id = c.id
      where pc.parent_id = auth.uid()
        and c.classroom_id = staff_classrooms.classroom_id
    )
  );


-- =============================================================
-- 7. staff_profiles
-- =============================================================

drop policy if exists "staff_profiles_select_director_admin" on staff_profiles;
drop policy if exists "staff_profiles_select_admin"          on staff_profiles;
drop policy if exists "staff_profiles_select_director"       on staff_profiles;

-- admin: 전체
create policy "staff_profiles_select_admin"
  on staff_profiles for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 교직원
create policy "staff_profiles_select_director"
  on staff_profiles for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join staff_classrooms sc on sc.staff_id = staff_profiles.id
      join classrooms cl on cl.id = sc.classroom_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.kindergarten_id = p.kindergarten_id
    )
  );

-- teacher: 같은 유치원 동료 교직원 (직책·입사일 등 공유 가능 범위)
create policy "staff_profiles_select_teacher"
  on staff_profiles for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join staff_classrooms sc on sc.staff_id = staff_profiles.id
      join classrooms cl on cl.id = sc.classroom_id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and cl.kindergarten_id = p.kindergarten_id
    )
  );


-- =============================================================
-- 8. staff_certifications
-- =============================================================

drop policy if exists "staff_certifications_select_director_admin" on staff_certifications;
drop policy if exists "staff_certifications_select_admin"          on staff_certifications;
drop policy if exists "staff_certifications_select_director"       on staff_certifications;

-- admin: 전체
create policy "staff_certifications_select_admin"
  on staff_certifications for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 교직원 자격증
create policy "staff_certifications_select_director"
  on staff_certifications for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join staff_classrooms sc on sc.staff_id = staff_certifications.staff_id
      join classrooms cl on cl.id = sc.classroom_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.kindergarten_id = p.kindergarten_id
    )
  );
