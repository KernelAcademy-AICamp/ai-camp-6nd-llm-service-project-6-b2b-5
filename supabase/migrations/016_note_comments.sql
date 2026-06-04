-- 알림장 댓글
create table if not exists note_comments (
  id          uuid        primary key default gen_random_uuid(),
  note_id     uuid        not null references daily_notes (id) on delete cascade,
  author_id   uuid        references profiles (id) on delete set null,
  author_name text        not null,                  -- 프로필이 사라져도 보이도록 비정규화
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_note_comments_note_id on note_comments (note_id, created_at);

alter table note_comments enable row level security;

-- admin·director·teacher: 같은 유치원 내 댓글 전체 조회·작성·삭제
create policy "note_comments_staff_all"
  on note_comments for all to authenticated
  using (
    exists (
      select 1
      from daily_notes dn
      join classrooms c on c.id = dn.classroom_id
      join profiles p   on p.id = auth.uid()
      where dn.id = note_comments.note_id
        and (
          p.role = 'admin'
          or (p.role in ('director', 'teacher') and p.kindergarten_id = c.kindergarten_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from daily_notes dn
      join classrooms c on c.id = dn.classroom_id
      join profiles p   on p.id = auth.uid()
      where dn.id = note_comments.note_id
        and (
          p.role = 'admin'
          or (p.role in ('director', 'teacher') and p.kindergarten_id = c.kindergarten_id)
        )
    )
  );

-- parent: 본인 자녀의 알림장(published) 에만 댓글 조회·작성. 본인이 쓴 것만 삭제
create policy "note_comments_parent_read"
  on note_comments for select to authenticated
  using (
    exists (
      select 1
      from daily_notes dn
      join parent_child pc on pc.child_id = dn.child_id
      where dn.id = note_comments.note_id
        and dn.status = 'published'
        and pc.parent_id = auth.uid()
    )
  );

create policy "note_comments_parent_insert"
  on note_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from daily_notes dn
      join parent_child pc on pc.child_id = dn.child_id
      where dn.id = note_comments.note_id
        and dn.status = 'published'
        and pc.parent_id = auth.uid()
    )
  );

create policy "note_comments_parent_delete_own"
  on note_comments for delete to authenticated
  using (author_id = auth.uid());
