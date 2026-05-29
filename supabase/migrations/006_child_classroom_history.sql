-- =============================================================
-- 유치원 관리 시스템 — 006_child_classroom_history.sql
-- 원아 반 이력 관리
-- 목적: 원아가 어느 반에 언제부터 언제까지 있었는지 기록
-- 실행 위치: Supabase Dashboard > SQL Editor (001~005 실행 후)
-- =============================================================


-- =============================================================
-- 1. child_classroom_history — 원아 반 이력
-- =============================================================

create table child_classroom_history (
  id           uuid        primary key default gen_random_uuid(),
  child_id     uuid        not null references children (id) on delete cascade,
  -- 원아 삭제 시 이력도 함께 삭제
  classroom_id uuid        not null references classrooms (id) on delete restrict,
  -- 반 삭제 시 이력이 있으면 삭제 차단

  started_at   date        not null,   -- 해당 반 소속 시작일
  ended_at     date,                   -- 소속 종료일. null이면 현재 재적 중
  reason       text,                   -- 변경 사유 (예: 신규입반, 연간 반편성, 학기 중 반변경)

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- 같은 원아의 이력은 기간이 겹치면 안 됨 (종료일 기준)
  -- 현재 재적(ended_at IS NULL)은 원아당 1개만 존재해야 함
  constraint chk_period check (ended_at is null or ended_at >= started_at)
);

create trigger child_classroom_history_updated_at
  before update on child_classroom_history
  for each row execute procedure set_updated_at();

-- 원아별 이력 조회 성능을 위한 인덱스
create index idx_child_classroom_history_child_id
  on child_classroom_history (child_id, started_at desc);

-- 현재 재적 중인 이력 빠른 조회
create index idx_child_classroom_history_current
  on child_classroom_history (child_id)
  where ended_at is null;

alter table child_classroom_history enable row level security;

-- admin: 전체 조회
create policy "child_classroom_history_select_admin"
  on child_classroom_history for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- director: 본인 소속 유치원 원아 이력만
create policy "child_classroom_history_select_director"
  on child_classroom_history for select to authenticated
  using (
    exists (
      select 1 from profiles p
      join classrooms cl on cl.kindergarten_id = p.kindergarten_id
      where p.id = auth.uid()
        and p.role = 'director'
        and cl.id = child_classroom_history.classroom_id
    )
  );

-- teacher: 담당 반 원아 이력만
create policy "child_classroom_history_select_teacher"
  on child_classroom_history for select to authenticated
  using (
    exists (
      select 1 from staff_classrooms sc
      join profiles p on p.id = sc.staff_id
      where p.id = auth.uid()
        and p.role = 'teacher'
        and sc.classroom_id = child_classroom_history.classroom_id
    )
  );

-- parent: 본인 자녀 이력만
create policy "child_classroom_history_select_parent"
  on child_classroom_history for select to authenticated
  using (
    exists (
      select 1 from parent_child pc
      join profiles p on p.id = pc.parent_id
      where p.id = auth.uid()
        and p.role = 'parent'
        and pc.child_id = child_classroom_history.child_id
    )
  );

-- 쓰기: director, admin만
create policy "child_classroom_history_write_director_admin"
  on child_classroom_history for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid()
      and role in ('director', 'admin'))
  );


-- =============================================================
-- 2. change_child_classroom — 반 변경 트랜잭션 DB 함수
-- =============================================================
-- 아래 3단계를 트랜잭션으로 묶어 하나라도 실패하면 전체 롤백:
--   1) 기존 이력 ended_at 마감
--   2) 새 이력 INSERT
--   3) children.classroom_id 업데이트

create or replace function change_child_classroom(
  p_child_id         uuid,
  p_new_classroom_id uuid,
  p_change_date      date,
  p_reason           text default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- 변경 대상 원아 존재 여부 확인
  if not exists (select 1 from children where id = p_child_id) then
    raise exception '원아를 찾을 수 없습니다. child_id: %', p_child_id;
  end if;

  -- 변경할 반 존재 여부 확인
  if not exists (select 1 from classrooms where id = p_new_classroom_id) then
    raise exception '반을 찾을 수 없습니다. classroom_id: %', p_new_classroom_id;
  end if;

  -- 현재 반과 동일한 반으로 변경 시도 차단
  if exists (
    select 1 from children
    where id = p_child_id and classroom_id = p_new_classroom_id
  ) then
    raise exception '현재 소속 반과 동일한 반으로는 변경할 수 없습니다.';
  end if;

  -- 1. 기존 이력 ended_at 마감 (변경일 전날로 설정)
  update child_classroom_history
  set    ended_at = p_change_date - interval '1 day'
  where  child_id = p_child_id
    and  ended_at is null;

  -- 2. 새 이력 추가
  insert into child_classroom_history
    (child_id, classroom_id, started_at, reason)
  values
    (p_child_id, p_new_classroom_id, p_change_date, p_reason);

  -- 3. children.classroom_id 업데이트
  update children
  set    classroom_id = p_new_classroom_id
  where  id = p_child_id;
end;
$$;


-- =============================================================
-- 3. 개발용 시드 데이터 — 반 이력 초기 데이터
-- =============================================================
-- 002_seed.sql의 원아들에 대한 최초 입반 이력 생성.
-- children.classroom_id 기준으로 현재 반 이력(ended_at = null)을 삽입.

insert into child_classroom_history (child_id, classroom_id, started_at, reason)
select
  c.id,
  c.classroom_id,
  coalesce(c.enrolled_at, '2024-03-01'),
  '신규입반'
from children c;


-- =============================================================
-- 4. 편의 뷰 — 현재 반 이력만 빠르게 조회
-- =============================================================

create or replace view v_child_current_classroom as
select
  cch.child_id,
  cch.classroom_id,
  cch.started_at,
  cch.reason,
  cl.name       as classroom_name,
  cl.age_group,
  k.id          as kindergarten_id,
  k.name        as kindergarten_name
from child_classroom_history cch
join classrooms cl on cl.id = cch.classroom_id
join kindergartens k on k.id = cl.kindergarten_id
where cch.ended_at is null;
