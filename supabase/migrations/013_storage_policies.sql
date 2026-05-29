-- =============================================================
-- 유치원 관리 시스템 — 013_storage_policies.sql
-- Supabase Storage 버킷 정책 (child-photos)
--
-- 실행 전 필수: Supabase 대시보드 > Storage에서 버킷 먼저 생성
--   버킷명: child-photos
--   Public: OFF (Private)
--
-- 실행 위치: Supabase Dashboard > SQL Editor (010~012 실행 후)
-- =============================================================
-- 주의: Storage 정책은 storage.objects 테이블에 적용.
--       DB files 테이블 RLS와 별개로 동작.
--       Storage 정책 = 파일 자체 접근 제어
--       DB RLS       = 파일 메타데이터 접근 제어
-- =============================================================


-- =============================================================
-- 기존 정책 초기화 (재실행 시 충돌 방지)
-- =============================================================

drop policy if exists "child-photos 업로드"  on storage.objects;
drop policy if exists "child-photos 조회"    on storage.objects;
drop policy if exists "child-photos 수정"    on storage.objects;
drop policy if exists "child-photos 삭제"    on storage.objects;


-- =============================================================
-- 업로드 (INSERT)
-- =============================================================
-- 교사·원장·관리자만 업로드 가능.
-- 업로드 경로 규칙: {kindergarten_id}/{child_id}/{uuid}.jpg

create policy "child-photos 업로드"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'child-photos'
    and exists (
      select 1 from public.profiles
      where id    = auth.uid()
        and role  in ('teacher', 'director', 'admin')
        and is_active = true
    )
  );


-- =============================================================
-- 조회 (SELECT)
-- =============================================================
-- 로그인한 사용자 전체 허용.
-- 세밀한 접근 제어는 DB RLS(files, note_photos 등)와
-- 앱에서 발급하는 Signed URL로 처리.

create policy "child-photos 조회"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'child-photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and is_active = true
    )
  );


-- =============================================================
-- 수정 (UPDATE)
-- =============================================================
-- 업로더 본인 또는 원장·관리자만 수정 가능.
-- 파일 메타데이터(캐시 제어 등) 수정 시 사용.

create policy "child-photos 수정"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'child-photos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('director', 'admin')
      )
    )
  );


-- =============================================================
-- 삭제 (DELETE)
-- =============================================================
-- 업로더 본인 또는 원장·관리자만 삭제 가능.
-- 앱에서 삭제 시 순서:
--   1. storage.objects 삭제 (이 정책 적용)
--   2. public.files 레코드 삭제 (DB RLS 적용)
--   ※ 두 단계 모두 Server Action에서 처리 필요

create policy "child-photos 삭제"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'child-photos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('director', 'admin')
      )
    )
  );
