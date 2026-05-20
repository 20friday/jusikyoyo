-- ============================================================
-- 테드픽 Supabase 스키마 v1
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================================


-- ── 기존 테이블/트리거 정리 ───────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
drop table if exists public.subscriptions;
drop table if exists public.posts;
drop table if exists public.profiles;


-- ── 1. profiles ──────────────────────────────────────────────
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'trial' check (role in ('trial', 'paid', 'free')),
  expires_at timestamptz not null default (now() + interval '3 days'),
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 가입 즉시 trial 프로필 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, role, expires_at)
  values (new.id, 'trial', now() + interval '3 days');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. posts ─────────────────────────────────────────────────
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  content       text not null default '',
  slug          text unique not null,
  is_premium    boolean not null default false,
  show          text,
  hosts         text[] default '{}',
  summary       text,
  tags          text[] default '{}',
  date          date,
  display_order integer default 999,
  published     boolean not null default true,
  published_at  timestamptz default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_updated_at
  before update on public.posts
  for each row execute procedure public.set_updated_at();


-- ── 3. subscriptions ─────────────────────────────────────────
create table public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  amount           integer not null,
  status           text not null check (status in ('paid', 'cancelled')),
  toss_billing_key text,
  toss_order_id    text,
  paid_at          timestamptz default now(),
  created_at       timestamptz not null default now()
);


-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

-- profiles
alter table public.profiles enable row level security;

create policy "본인 프로필 읽기" on public.profiles
  for select using (auth.uid() = user_id);

create policy "관리자 전체 읽기" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

create policy "관리자 업데이트" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

-- posts
alter table public.posts enable row level security;

create policy "무료 글 공개" on public.posts
  for select using (published = true and is_premium = false);

create policy "유료 글 — 유효 회원" on public.posts
  for select using (
    published = true
    and is_premium = true
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('trial', 'paid')
        and p.expires_at > now()
    )
  );

create policy "관리자 글 전체 접근" on public.posts
  for all using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );

-- subscriptions
alter table public.subscriptions enable row level security;

create policy "본인 결제 내역" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "관리자 전체 결제 내역" on public.subscriptions
  for select using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
  );


-- ============================================================
-- 관리자 계정 설정 (가입 후 아래 주석 해제하고 UUID 입력)
-- ============================================================

-- update public.profiles set is_admin = true
-- where user_id = '여기에-관리자-UUID-입력';
