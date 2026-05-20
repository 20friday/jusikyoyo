-- ============================================================
-- RLS 무한 루프 수정
-- profiles 정책이 profiles를 재귀 조회하는 문제 해결
-- ============================================================

-- ── 1. 재귀 문제가 있는 기존 정책 제거 ───────────────────────
drop policy if exists "관리자 전체 읽기" on public.profiles;
drop policy if exists "관리자 업데이트" on public.profiles;
drop policy if exists "관리자 글 전체 접근" on public.posts;
drop policy if exists "관리자 전체 결제 내역" on public.subscriptions;
drop policy if exists "유료 글 — 유효 회원" on public.posts;


-- ── 2. security definer 함수 생성 ────────────────────────────
-- RLS를 우회(bypass)하여 profiles를 직접 조회하는 함수들

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.is_valid_member()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select role in ('trial', 'paid') and expires_at > now()
     from public.profiles where user_id = auth.uid()),
    false
  );
$$;


-- ── 3. profiles 정책 재생성 ───────────────────────────────────
create policy "관리자 업데이트" on public.profiles
  for update using (public.is_admin());

-- 관리자 전체 읽기: 함수로 자기 참조 없애기
create policy "관리자 전체 읽기" on public.profiles
  for select using (public.is_admin());


-- ── 4. posts 정책 재생성 ─────────────────────────────────────
create policy "유료 글 — 유효 회원" on public.posts
  for select using (
    published = true
    and is_premium = true
    and public.is_valid_member()
  );

create policy "관리자 글 전체 접근" on public.posts
  for all using (public.is_admin());


-- ── 5. subscriptions 정책 재생성 ─────────────────────────────
create policy "관리자 전체 결제 내역" on public.subscriptions
  for select using (public.is_admin());
