# 테드픽 Supabase 멤버십 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테드픽 블로그에 Supabase 기반 멤버십 시스템을 추가한다 — 회원가입, 3일 무료 체험, 토스페이먼츠 유료 구독, 관리자 페이지.

**Architecture:** Astro v6을 정적 빌드에서 SSR로 전환하고 `@astrojs/vercel` adapter를 추가한다. Supabase Auth로 이메일 인증, Supabase DB로 콘텐츠·구독 정보를 관리한다. 접근 제어는 Astro 미들웨어(서버사이드)에서 처리한다. 프리미엄 콘텐츠 조회는 서비스 롤 키를 사용해 서버에서만 수행한다.

**Tech Stack:** Astro v6 SSR, @astrojs/vercel, @supabase/supabase-js, @supabase/ssr, 토스페이먼츠 정기결제 API, @vercel/analytics

---

## 파일 구조 맵

### 신규 생성
```
.env                                         # 환경변수 (gitignore에 이미 있음)
.env.example                                 # 환경변수 템플릿
src/
  middleware.ts                              # 인증 세션 주입 + /admin 보호
  lib/
    supabase.ts                              # Supabase 서버/브라우저 클라이언트
    access.ts                                # 접근 제어 유틸 함수
  pages/
    login.astro                              # 로그인 / 회원가입
    subscribe.astro                          # 구독 안내 + 토스 결제 시작
    mypage.astro                             # 내 구독 현황 + 만료일
    api/
      auth/
        callback.astro                       # Supabase Auth 이메일 콜백
      toss/
        billing.ts                           # 빌링키 발급 + 첫 결제
        webhook.ts                           # 토스 webhook 수신
    admin/
      index.astro                            # 대시보드 (구독자 수, 최근 결제)
      posts/
        index.astro                          # 글 목록 + 유/무료 토글
        new.astro                            # 새 글 작성
        [id].astro                           # 글 수정
      members/
        index.astro                          # 회원 목록 + 등급/만료일 수동 조정
      subscriptions/
        index.astro                          # 결제 내역
  components/
    TrialBanner.astro                        # 체험 만료 D-2/D-1 배너
    LoginGate.astro                          # 유료 글 접근 차단 화면
    AdminNav.astro                           # 어드민 네비게이션
  layouts/
    AdminBase.astro                          # 어드민 공통 레이아웃
supabase/
  migrations/
    001_initial.sql                          # 스키마 + RLS + signup 트리거
scripts/
  migrate-posts.ts                           # 기존 MD 파일 → Supabase posts 이전
```

### 수정 예정
```
astro.config.mjs             output: 'server' + @astrojs/vercel adapter 추가
package.json                 새 패키지 추가
vercel.json                  SSR 설정으로 업데이트
src/layouts/Base.astro       헤더에 로그인/로그아웃 버튼, TrialBanner 삽입
src/pages/index.astro        Supabase DB에서 글 목록 가져오기
src/pages/post/[slug].astro  SSR 동적 라우트 + 접근 제어
src/components/editor/EditorApp.tsx  GitHub API 제거 → Supabase 저장으로 교체
src/content.config.ts        (Task 4 완료 후 삭제)
```

---

## Task 1: Astro SSR 전환

**Context:** 현재 `astro.config.mjs`는 `output` 설정이 없어 기본값인 정적 빌드다. SSR로 바꿔야 Supabase 인증 세션을 서버에서 처리할 수 있다.

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json`
- Modify: `vercel.json`

- [ ] **Step 1: 패키지 설치**

```bash
npm install @astrojs/vercel
```

Expected output: `added 1 package` (or similar)

- [ ] **Step 2: astro.config.mjs 업데이트**

현재 파일 전체를 아래로 교체한다:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from './src/lib/remarkBlocks.mjs';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkBlocks],
    shikiConfig: { theme: 'github-light' },
  },
});
```

- [ ] **Step 3: vercel.json 업데이트**

```json
{
  "buildCommand": "npm run build",
  "framework": "astro"
}
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```

Expected: `✓ Completed` 메시지, 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs package.json package-lock.json vercel.json
git commit -m "feat: Astro SSR 전환 + Vercel adapter 추가"
```

---

## Task 2: Supabase 프로젝트 & DB 설정

**Context:** Supabase 대시보드에서 프로젝트를 생성하고, SQL Editor에서 마이그레이션을 실행한다.

**Files:**
- Create: `supabase/migrations/001_initial.sql`
- Create: `.env`
- Create: `.env.example`

- [ ] **Step 1: Supabase 프로젝트 생성 (수동)**

1. https://supabase.com → 로그인 → New Project
2. 이름: `tedpick`, 비밀번호 저장해두기, Region: Northeast Asia (Seoul)
3. 생성 완료 후 Settings → API 에서 복사:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 2: 마이그레이션 SQL 파일 생성**

```sql
-- supabase/migrations/001_initial.sql

-- profiles: 회원 등급/만료일/관리자 여부
create table profiles (
  user_id uuid references auth.users(id) on delete cascade primary key,
  role text not null default 'trial' check (role in ('trial', 'paid', 'free')),
  expires_at timestamptz not null default (now() + interval '3 days'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- posts: 글 콘텐츠 (기존 MD 파일 대체)
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  content text not null default '',
  is_premium boolean not null default false,
  show text not null default '',
  hosts text[] not null default '{}',
  summary text not null default '',
  tags text[] not null default '{}',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- subscriptions: 토스페이먼츠 결제 내역
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount integer not null,
  status text not null check (status in ('paid', 'cancelled')),
  toss_billing_key text,
  toss_order_id text,
  paid_at timestamptz not null default now()
);

-- 가입 시 profile 자동 생성 (role=trial, expires_at=+3일)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (user_id, role, expires_at)
  values (new.id, 'trial', now() + interval '3 days');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- updated_at 자동 갱신
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
  before update on posts
  for each row execute procedure handle_updated_at();

-- RLS 활성화
alter table profiles enable row level security;
alter table posts enable row level security;
alter table subscriptions enable row level security;

-- profiles: 본인 프로필만 읽기
create policy "users can read own profile"
  on profiles for select
  using (auth.uid() = user_id);

-- posts: 발행된 무료 글은 누구나 읽기 (anon 키용)
create policy "anyone reads free published posts"
  on posts for select
  using (published = true and is_premium = false);

-- subscriptions: 본인 구독 내역만 읽기
create policy "users read own subscriptions"
  on subscriptions for select
  using (auth.uid() = user_id);
```

- [ ] **Step 3: Supabase SQL Editor에서 실행 (수동)**

1. Supabase 대시보드 → SQL Editor → New query
2. `supabase/migrations/001_initial.sql` 내용 전체 붙여넣기 → Run
3. 오류 없이 완료 확인

- [ ] **Step 4: Supabase Auth 설정 (수동)**

1. Supabase → Authentication → Providers → Email: 활성화 확인
2. Authentication → URL Configuration:
   - Site URL: `https://tedpick.vercel.app` (또는 실제 도메인)
   - Redirect URLs 추가: `http://localhost:4321/api/auth/callback`
   - Redirect URLs 추가: `https://tedpick.vercel.app/api/auth/callback`

- [ ] **Step 5: 환경변수 파일 생성**

`.env` 파일 생성 (gitignore 확인 — 이미 `.env`가 gitignore에 있어야 함):

```bash
# .env
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TOSS_SECRET_KEY=
TOSS_WEBHOOK_SECRET=
```

`.env.example` 파일 생성 (값 없이 키만):

```bash
# .env.example
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOSS_SECRET_KEY=
TOSS_WEBHOOK_SECRET=
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/001_initial.sql .env.example
git commit -m "feat: Supabase DB 스키마 + RLS 정책 설정"
```

---

## Task 3: Supabase 클라이언트 + 미들웨어 + 인증 페이지

**Context:** SSR에서 Supabase Auth는 쿠키 기반으로 동작한다. `@supabase/ssr` 패키지가 쿠키 읽기/쓰기를 처리한다. Astro 미들웨어(`src/middleware.ts`)가 모든 요청에서 세션을 확인하고, `/admin` 라우트는 `is_admin=true`인 사용자만 통과시킨다.

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/middleware.ts`
- Create: `src/pages/login.astro`
- Create: `src/pages/api/auth/callback.astro`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: 패키지 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Supabase 클라이언트 모듈 생성**

```typescript
// src/lib/supabase.ts
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroGlobal } from 'astro';

// 서버 컴포넌트/미들웨어에서 사용 (쿠키 기반 세션)
export function createSupabaseServerClient(context: AstroGlobal | { request: Request; cookies: any }) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.request.headers.get('Cookie') ?? '');
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            context.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );
}

// 서버에서 service_role 키로 사용 (RLS 우회, admin 작업용)
export function createSupabaseAdminClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// 브라우저에서 사용 (React 컴포넌트)
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  );
}
```

- [ ] **Step 3: Astro env.d.ts에 locals 타입 추가**

`src/env.d.ts`가 없으면 생성한다:

```typescript
// src/env.d.ts
/// <reference types="astro/client" />
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';

declare namespace App {
  interface Locals {
    supabase: SupabaseClient;
    session: Session | null;
    user: User | null;
  }
}
```

- [ ] **Step 4: 미들웨어 생성**

```typescript
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, createSupabaseAdminClient } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(context);

  // 세션 갱신 (쿠키 자동 업데이트 포함)
  const { data: { session } } = await supabase.auth.getSession();

  context.locals.supabase = supabase;
  context.locals.session = session;
  context.locals.user = session?.user ?? null;

  // /admin 라우트 보호
  if (context.url.pathname.startsWith('/admin')) {
    if (!session) {
      return context.redirect('/login?next=' + encodeURIComponent(context.url.pathname));
    }
    const adminClient = createSupabaseAdminClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_admin')
      .eq('user_id', session.user.id)
      .single();

    if (!profile?.is_admin) {
      return context.redirect('/');
    }
  }

  return next();
});
```

- [ ] **Step 5: 로그인 페이지 생성**

```astro
---
// src/pages/login.astro
import Base from '../layouts/Base.astro';

const { session } = Astro.locals;
if (session) return Astro.redirect('/');

const next = Astro.url.searchParams.get('next') || '/';
const mode = Astro.url.searchParams.get('mode') || 'login';
const error = Astro.url.searchParams.get('error');
---
<Base title="로그인">
  <div class="auth-wrap">
    <div class="auth-card">
      <h1 class="auth-title">{mode === 'signup' ? '회원가입' : '로그인'}</h1>
      <p class="auth-desc">테드픽 멤버십</p>

      {error && <p class="auth-error">{decodeURIComponent(error)}</p>}

      <form class="auth-form" method="POST" action="/api/auth/login" id="auth-form">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} id="mode-input" />
        <label class="auth-label">
          이메일
          <input type="email" name="email" class="auth-input" placeholder="me@example.com" required />
        </label>
        <label class="auth-label">
          비밀번호
          <input type="password" name="password" class="auth-input" placeholder="8자 이상" required minlength="8" />
        </label>
        <button type="submit" class="btn-pill primary auth-submit" id="submit-btn">
          {mode === 'signup' ? '가입하기' : '로그인'}
        </button>
      </form>

      <p class="auth-toggle">
        {mode === 'login'
          ? <><span>처음 오셨나요? </span><a href="/login?mode=signup&next={next}" class="auth-toggle-link">회원가입</a></>
          : <><span>이미 계정이 있으신가요? </span><a href="/login?mode=login&next={next}" class="auth-toggle-link">로그인</a></>
        }
      </p>
    </div>
  </div>
</Base>

<style>
  .auth-wrap {
    min-height: calc(100vh - 57px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px;
  }
  .auth-card {
    width: 100%; max-width: 400px;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 36px 32px;
  }
  .auth-title { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .auth-desc { font-size: 14px; color: var(--text-3); margin-bottom: 28px; }
  .auth-error {
    background: #fff0ef; border: 1px solid #ffd0cc;
    border-radius: 8px; padding: 10px 14px;
    font-size: 13px; color: var(--up); margin-bottom: 16px;
  }
  .auth-form { display: flex; flex-direction: column; gap: 16px; }
  .auth-label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-3); }
  .auth-input {
    padding: 10px 14px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg);
    font-size: 15px; color: var(--text-1); outline: none;
  }
  .auth-input:focus { border-color: var(--blue); }
  .auth-submit { width: 100%; justify-content: center; margin-top: 4px; padding: 12px; }
  .auth-toggle { font-size: 13px; color: var(--text-3); text-align: center; margin-top: 20px; }
  .auth-toggle-link { color: var(--blue); font-weight: 600; }
</style>
```

- [ ] **Step 6: 로그인/회원가입 API 라우트 생성**

```typescript
// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get('email') as string;
  const password = form.get('password') as string;
  const mode = form.get('mode') as string;
  const next = form.get('next') as string || '/';

  const supabase = createSupabaseServerClient(context);

  if (mode === 'signup') {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return context.redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
    }
    // 이메일 확인 없이 바로 로그인 (Supabase 설정에서 Confirm email 비활성화 필요)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return context.redirect(`/login?mode=signup&error=${encodeURIComponent('가입은 완료됐어요. 로그인해주세요.')}`);
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return context.redirect(`/login?error=${encodeURIComponent('이메일 또는 비밀번호를 확인해주세요.')}`);
    }
  }

  return context.redirect(next);
};
```

- [ ] **Step 7: 로그아웃 API 라우트 생성**

```typescript
// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);
  await supabase.auth.signOut();
  return context.redirect('/');
};
```

- [ ] **Step 8: Base.astro 헤더에 로그인/로그아웃 버튼 추가**

`src/layouts/Base.astro`의 `<header>` 섹션을 교체한다:

```astro
---
// src/layouts/Base.astro
interface Props {
  title?: string;
  description?: string;
}
const { title = '테드픽', description = '매일 12시, 장 정리' } = Astro.props;
const { session } = Astro.locals;
---
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} — 테드픽</title>
  <meta name="description" content={description} />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div class="app">
    <header class="hdr">
      <div class="hdr-inner">
        <a href="/" class="brand">
          <div class="brand-mark">T</div>
          <span class="brand-name">테드픽</span>
        </a>
        <div class="hdr-spacer"></div>
        {session ? (
          <>
            <a href="/mypage" class="btn-pill ghost">내 구독</a>
            <form method="POST" action="/api/auth/logout" style="display:inline">
              <button type="submit" class="btn-pill ghost">로그아웃</button>
            </form>
          </>
        ) : (
          <a href="/login" class="btn-pill primary">로그인</a>
        )}
      </div>
    </header>
    <slot name="banner" />
    <main>
      <slot />
    </main>
  </div>
</body>
</html>

<style is:global>
  @import '../styles/global.css';
</style>
```

- [ ] **Step 9: Supabase 설정에서 이메일 확인 비활성화 (수동)**

1. Supabase 대시보드 → Authentication → Providers → Email
2. "Confirm email" 토글 OFF (개발 편의를 위해)
3. 나중에 프로덕션에서는 켜도 됨

- [ ] **Step 10: 로컬에서 인증 흐름 확인**

```bash
npm run dev
```

브라우저에서:
1. `http://localhost:4321/login` → 회원가입 탭 → 이메일/비밀번호 입력 → 가입
2. 헤더에 "내 구독" + "로그아웃" 버튼이 표시되는지 확인
3. 로그아웃 → 다시 "로그인" 버튼으로 돌아오는지 확인

- [ ] **Step 11: Commit**

```bash
git add src/lib/supabase.ts src/middleware.ts src/env.d.ts \
  src/pages/login.astro src/pages/api/auth/login.ts src/pages/api/auth/logout.ts \
  src/layouts/Base.astro package.json package-lock.json
git commit -m "feat: Supabase Auth 인증 구현 (로그인/회원가입/로그아웃)"
```

---

## Task 4: 콘텐츠 이전 (MD 파일 → Supabase posts)

**Context:** 현재 글이 `src/content/posts/` 마크다운 파일에 저장돼 있다. 현재 파일은 `2026-05-08-12si.md` 한 개. 이 파일을 Supabase `posts` 테이블로 이전하고, 피드·글 상세 페이지가 DB에서 데이터를 읽도록 변경한다.

**Files:**
- Create: `scripts/migrate-posts.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/post/[slug].astro`
- Delete: `src/content.config.ts` (이전 완료 후)

- [ ] **Step 1: 마이그레이션 스크립트 작성**

```typescript
// scripts/migrate-posts.ts
// 실행: npx tsx scripts/migrate-posts.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 환경변수를 .env에서 직접 읽기
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8');
const env: Record<string, string> = {};
for (const line of envFile.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
}

const supabase = createClient(
  env['PUBLIC_SUPABASE_URL'],
  env['SUPABASE_SERVICE_ROLE_KEY']
);

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const fm = match[1];
  const content = match[2].trimStart();
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const getArr = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*\\[(.*)\\]$`, 'm'));
    return m ? m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  };
  return {
    title: get('title'),
    date: get('date'),
    show: get('show'),
    hosts: getArr('hosts'),
    summary: get('summary'),
    tags: getArr('tags'),
    published: fm.includes('published: true'),
    content,
  };
}

const postsDir = path.join(__dirname, '../src/content/posts');
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8');
  const data = parseFrontmatter(raw);
  if (!data) { console.log(`Skip: ${file} (frontmatter 없음)`); continue; }

  const { error } = await supabase.from('posts').upsert({
    slug,
    title: data.title,
    content: data.content,
    is_premium: false,
    show: data.show,
    hosts: data.hosts,
    summary: data.summary,
    tags: data.tags,
    published: data.published,
    published_at: data.published ? new Date(data.date + 'T00:00:00').toISOString() : null,
  }, { onConflict: 'slug' });

  if (error) {
    console.error(`Error: ${file}`, error.message);
  } else {
    console.log(`OK: ${slug}`);
  }
}

console.log('마이그레이션 완료');
```

- [ ] **Step 2: tsx 설치 후 스크립트 실행**

```bash
npm install -D tsx
npx tsx scripts/migrate-posts.ts
```

Expected output:
```
OK: 2026-05-08-12si
마이그레이션 완료
```

Supabase 대시보드 → Table Editor → posts 에서 데이터 확인.

- [ ] **Step 3: 피드 페이지(index.astro) Supabase로 교체**

`src/pages/index.astro`의 `---` frontmatter 부분을 교체한다:

```astro
---
import Base from '../layouts/Base.astro';
import { createSupabaseAdminClient } from '../lib/supabase';

const supabase = createSupabaseAdminClient();
const { data: posts } = await supabase
  .from('posts')
  .select('slug, title, show, hosts, summary, tags, is_premium, published_at')
  .eq('published', true)
  .order('published_at', { ascending: false });

const safePost = posts ?? [];
const shows = ['전체', ...new Set(safePost.map(p => p.show))];

const days = ['일', '월', '화', '수', '목', '금', '토'];
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
---
```

카드 부분에서 `post.data.xxx` → `post.xxx` 로 변경하고, `href={'/post/${post.id}'}` → `href={'/post/${post.slug}'}` 로 변경. `data-show` 속성도 `post.show`로 교체. `is_premium` 뱃지 추가:

```astro
{safePost.map(post => (
  <a href={`/post/${post.slug}`} class="post-card" data-show={post.show}>
    <div class="card-meta">
      <span class="card-show">{post.show}</span>
      <span class="card-dot"></span>
      <span class="card-date">{formatDate(post.published_at)}</span>
      <span class="card-dot"></span>
      <span class="card-hosts">{post.hosts.join(' · ')}</span>
      {post.is_premium && <span class="card-premium">유료</span>}
    </div>
    <h2 class="card-title">{post.title}</h2>
    <p class="card-summary">{post.summary}</p>
    {post.tags.length > 0 && (
      <div class="card-tags">
        {post.tags.map(t => <span class="tag">{t}</span>)}
      </div>
    )}
  </a>
))}
```

`<style>` 태그에 `.card-premium` 스타일 추가:

```css
.card-premium {
  font-size: 11px; font-weight: 700; color: #fff;
  background: var(--blue); border-radius: 4px; padding: 2px 6px;
}
```

- [ ] **Step 4: 글 상세 페이지(post/[slug].astro) SSR 동적 라우트로 교체**

현재 파일 전체를 교체한다 (getStaticPaths 제거, SSR 동적 라우트로 변경):

```astro
---
import Base from '../../layouts/Base.astro';
import { createSupabaseAdminClient } from '../../lib/supabase';

const { slug } = Astro.params;
const supabase = createSupabaseAdminClient();

const { data: post } = await supabase
  .from('posts')
  .select('*')
  .eq('slug', slug)
  .eq('published', true)
  .single();

if (!post) return Astro.redirect('/');

const days = ['일', '월', '화', '수', '목', '금', '토'];
const d = new Date(post.published_at);
const dateKo = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
---
<Base title={post.title} description={post.summary}>
  <div class="post-wrap">
    <article>
      <div class="detail-meta">
        <span class="detail-show">{post.show}</span>
        <span class="card-dot"></span>
        <span class="detail-date">{dateKo}</span>
        <span class="card-dot"></span>
        <span class="detail-hosts">{post.hosts.join(' · ')}</span>
        {post.is_premium && <span class="card-premium">유료</span>}
      </div>
      <h1 class="detail-title">{post.title}</h1>
      <p class="detail-summary">{post.summary}</p>
      {post.tags.length > 0 && (
        <div class="detail-tags">
          {post.tags.map((t: string) => <span class="tag">{t}</span>)}
        </div>
      )}
      <hr class="detail-divider" />
      <div class="prose" set:html={await renderMarkdown(post.content)} />
    </article>
    <div class="post-footer">
      <a href="/" class="btn-pill ghost">← 피드로</a>
    </div>
  </div>
</Base>
```

`renderMarkdown` 함수를 frontmatter에 추가:

```typescript
import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from '../../lib/remarkBlocks.mjs';
import remarkHtml from 'remark-html';

async function renderMarkdown(content: string): Promise<string> {
  const file = await remark()
    .use(remarkDirective)
    .use(remarkBlocks)
    .use(remarkHtml, { sanitize: false })
    .process(content);
  return String(file);
}
```

- [ ] **Step 5: remark-html 패키지 설치**

```bash
npm install remark-html
```

- [ ] **Step 6: 로컬에서 확인**

```bash
npm run dev
```

브라우저에서:
1. `http://localhost:4321/` → 글 목록이 DB에서 로드되는지 확인
2. 글 카드 클릭 → 상세 페이지 렌더링 확인
3. 마크다운 포맷(표, 주식 블록)이 올바르게 렌더링되는지 확인

- [ ] **Step 7: 기존 content config 파일 삭제 (선택)**

MD 파일 기반 시스템이 완전히 대체됐으면:

```bash
# 나중에 Supabase 완전히 확인 후 삭제
# git rm src/content.config.ts
# git rm -r src/content/posts/
```

지금은 삭제하지 않고 Task 5 이후에 정리.

- [ ] **Step 8: Commit**

```bash
git add scripts/migrate-posts.ts src/pages/index.astro src/pages/post/[slug].astro \
  package.json package-lock.json
git commit -m "feat: 콘텐츠 Supabase DB 이전 + SSR 동적 라우트"
```

---

## Task 5: 에디터 Supabase 연동 (GitHub API 제거)

**Context:** 현재 `/editor`의 `EditorApp.tsx`는 GitHub API로 마크다운 파일을 저장한다. 이것을 Supabase `posts` 테이블에 저장하도록 교체한다. 에디터는 `/admin/posts/new`와 `/admin/posts/[id]` 로 이전한다. TipTap 에디터는 그대로 유지하되 저장 로직만 교체한다.

**Files:**
- Create: `src/pages/admin/posts/new.astro`
- Create: `src/pages/admin/posts/[id].astro`
- Create: `src/components/editor/AdminEditorApp.tsx`
- Delete: `src/pages/editor/index.astro` (기존 에디터 페이지)

- [ ] **Step 1: AdminEditorApp.tsx 생성**

기존 `EditorApp.tsx`에서 GitHub 관련 코드를 제거하고 Supabase 저장으로 교체한다:

```typescript
// src/components/editor/AdminEditorApp.tsx
import React, { useState, useEffect } from 'react';
import { NotionEditor } from './NotionEditor';
import { createSupabaseBrowserClient } from '../../lib/supabase';

interface PostMeta {
  title: string;
  show: string;
  hosts: string;
  summary: string;
  tags: string;
  is_premium: boolean;
  published: boolean;
  published_at: string;
}

interface Props {
  postId?: string;
}

function emptyMeta(): PostMeta {
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: '', show: '', hosts: '', summary: '', tags: '',
    is_premium: false, published: false, published_at: today,
  };
}

function AdminEditorApp({ postId }: Props) {
  const [meta, setMeta] = useState<PostMeta>(emptyMeta());
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!postId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('posts').select('*').eq('id', postId).single();
      if (data) {
        setMeta({
          title: data.title,
          show: data.show,
          hosts: data.hosts.join(', '),
          summary: data.summary,
          tags: data.tags.join(', '),
          is_premium: data.is_premium,
          published: data.published,
          published_at: data.published_at ? data.published_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        });
        setBody(data.content);
      }
      setLoading(false);
    })();
  }, [postId]);

  async function save(publish: boolean) {
    const finalMeta = { ...meta, published: publish };
    const hosts = meta.hosts.split(',').map(s => s.trim()).filter(Boolean);
    const tags = meta.tags.split(',').map(s => s.trim()).filter(Boolean);
    const slug = postId
      ? undefined
      : `${finalMeta.published_at}-${finalMeta.show.replace(/\s+/g, '')}`;

    setStatus('저장 중...');
    try {
      if (postId) {
        const { error } = await supabase.from('posts').update({
          title: finalMeta.title,
          content: body,
          is_premium: finalMeta.is_premium,
          show: finalMeta.show,
          hosts,
          summary: finalMeta.summary,
          tags,
          published: publish,
          published_at: publish ? new Date(finalMeta.published_at).toISOString() : null,
        }).eq('id', postId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('posts').insert({
          slug: slug!,
          title: finalMeta.title,
          content: body,
          is_premium: finalMeta.is_premium,
          show: finalMeta.show,
          hosts,
          summary: finalMeta.summary,
          tags,
          published: publish,
          published_at: publish ? new Date(finalMeta.published_at).toISOString() : null,
        });
        if (error) throw error;
      }
      setStatus(publish ? '발행 완료!' : '저장 완료!');
      setTimeout(() => { window.location.href = '/admin/posts'; }, 1000);
    } catch (e: any) {
      setStatus(`오류: ${e.message}`);
    }
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>불러오는 중...</div>;

  return (
    <div className="notion-shell">
      <div className="notion-topbar">
        <button className="btn-pill ghost" style={{ fontSize: 13 }}
          onClick={() => window.location.href = '/admin/posts'}>← 목록</button>
        <span className="notion-status">{status}</span>
        <button className="btn-pill ghost" style={{ fontSize: 13 }} onClick={() => save(false)}>임시저장</button>
        <button className="btn-pill primary" style={{ fontSize: 13 }} onClick={() => save(true)}>발행</button>
      </div>
      <div className="notion-scroll">
        <div className="notion-page">
          <textarea
            className="notion-title" placeholder="제목 없음" value={meta.title} rows={1}
            onChange={e => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
              setMeta(m => ({ ...m, title: e.target.value }));
            }}
          />
          <div className="notion-meta-block">
            <div className="notion-meta-row">
              <span className="notion-meta-key">방송</span>
              <input className="notion-meta-val" value={meta.show} onChange={e => setMeta(m => ({ ...m, show: e.target.value }))} placeholder="12시에 만나요" />
            </div>
            <div className="notion-meta-row">
              <span className="notion-meta-key">날짜</span>
              <input className="notion-meta-val" value={meta.published_at} onChange={e => setMeta(m => ({ ...m, published_at: e.target.value }))} placeholder="2026-05-08" />
            </div>
            <div className="notion-meta-row">
              <span className="notion-meta-key">진행자</span>
              <input className="notion-meta-val" value={meta.hosts} onChange={e => setMeta(m => ({ ...m, hosts: e.target.value }))} placeholder="이광수, 권다영" />
            </div>
            <div className="notion-meta-row">
              <span className="notion-meta-key">요약</span>
              <input className="notion-meta-val" style={{ flex: 1 }} value={meta.summary} onChange={e => setMeta(m => ({ ...m, summary: e.target.value }))} placeholder="한 줄 요약..." />
            </div>
            <div className="notion-meta-row">
              <span className="notion-meta-key">태그</span>
              <input className="notion-meta-val" value={meta.tags} onChange={e => setMeta(m => ({ ...m, tags: e.target.value }))} placeholder="반도체, 현대차" />
            </div>
            <div className="notion-meta-row">
              <span className="notion-meta-key">유료 글</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={meta.is_premium}
                  onChange={e => setMeta(m => ({ ...m, is_premium: e.target.checked }))} />
                <span className="notion-meta-val" style={{ color: meta.is_premium ? 'var(--blue)' : 'var(--text-3)' }}>
                  {meta.is_premium ? '유료 회원 전용' : '무료 공개'}
                </span>
              </label>
            </div>
          </div>
          <div className="notion-divider" />
          <NotionEditor value={body} onChange={setBody} />
        </div>
      </div>
    </div>
  );
}

export default AdminEditorApp;
```

- [ ] **Step 2: 관리자 새 글 페이지 생성**

```astro
---
// src/pages/admin/posts/new.astro
import AdminBase from '../../../layouts/AdminBase.astro';
import AdminEditorApp from '../../../components/editor/AdminEditorApp';
---
<AdminBase title="새 글 작성">
  <div style="height: calc(100vh - 57px);">
    <AdminEditorApp client:only="react" />
  </div>
</AdminBase>
```

- [ ] **Step 3: 관리자 글 수정 페이지 생성**

```astro
---
// src/pages/admin/posts/[id].astro
import AdminBase from '../../../layouts/AdminBase.astro';
import AdminEditorApp from '../../../components/editor/AdminEditorApp';
const { id } = Astro.params;
---
<AdminBase title="글 수정">
  <div style="height: calc(100vh - 57px);">
    <AdminEditorApp postId={id} client:only="react" />
  </div>
</AdminBase>
```

- [ ] **Step 4: AdminBase 레이아웃 생성**

```astro
---
// src/layouts/AdminBase.astro
interface Props { title?: string; }
const { title = '관리자' } = Astro.props;
---
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} — 테드픽 관리자</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div class="app">
    <header class="hdr">
      <div class="hdr-inner">
        <a href="/" class="brand">
          <div class="brand-mark">T</div>
          <span class="brand-name">테드픽 관리자</span>
        </a>
        <div class="hdr-spacer"></div>
        <a href="/admin" class="btn-pill ghost">대시보드</a>
        <a href="/admin/posts" class="btn-pill ghost">글 관리</a>
        <a href="/admin/members" class="btn-pill ghost">회원 관리</a>
        <form method="POST" action="/api/auth/logout" style="display:inline">
          <button type="submit" class="btn-pill ghost">로그아웃</button>
        </form>
      </div>
    </header>
    <main><slot /></main>
  </div>
</body>
</html>
<style is:global>
  @import '../styles/global.css';
</style>
```

- [ ] **Step 5: 로컬에서 에디터 확인**

```bash
npm run dev
```

1. `http://localhost:4321/admin/posts/new` 접속
2. 로그인 안 돼 있으면 `/login`으로 리다이렉트되는지 확인
3. 로그인 후 is_admin이 false면 `/`로 리다이렉트되는지 확인
4. Supabase 대시보드에서 profiles 테이블에서 본인 user_id의 `is_admin`을 `true`로 수동 업데이트
5. 에디터에서 새 글 작성 → 발행 → DB에 저장되는지 확인

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/AdminEditorApp.tsx src/pages/admin/ \
  src/layouts/AdminBase.astro
git commit -m "feat: 에디터 Supabase 연동 + /admin/posts 이전"
```

---

## Task 6: 접근 제어 구현

**Context:** `post.is_premium === true` 인 글은 체험/유료 회원만 읽을 수 있다. 서버사이드에서 사용자 프로필을 확인해 접근을 허용하거나 차단 화면(`LoginGate`)을 보여준다. 접근 제어 로직을 `src/lib/access.ts`에 순수 함수로 분리한다.

**Files:**
- Create: `src/lib/access.ts`
- Create: `src/components/LoginGate.astro`
- Modify: `src/pages/post/[slug].astro`

- [ ] **Step 1: 접근 제어 유틸 작성**

```typescript
// src/lib/access.ts

export type UserRole = 'trial' | 'paid' | 'free' | null;

export interface AccessProfile {
  role: UserRole;
  expires_at: string;
  is_admin: boolean;
}

export function canAccessPremium(profile: AccessProfile | null): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.role === 'trial' || profile.role === 'paid') {
    return new Date(profile.expires_at) > new Date();
  }
  return false;
}

export function trialDaysLeft(profile: AccessProfile | null): number | null {
  if (!profile || profile.role !== 'trial') return null;
  const diff = new Date(profile.expires_at).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 2: 접근 제어 유닛 테스트 (vitest)**

```bash
npm install -D vitest
```

`vitest.config.ts` 생성:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

```typescript
// src/lib/access.test.ts
import { describe, it, expect } from 'vitest';
import { canAccessPremium, trialDaysLeft } from './access';

const future = new Date(Date.now() + 2 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

describe('canAccessPremium', () => {
  it('null profile → false', () => {
    expect(canAccessPremium(null)).toBe(false);
  });
  it('trial, not expired → true', () => {
    expect(canAccessPremium({ role: 'trial', expires_at: future, is_admin: false })).toBe(true);
  });
  it('trial, expired → false', () => {
    expect(canAccessPremium({ role: 'trial', expires_at: past, is_admin: false })).toBe(false);
  });
  it('paid, not expired → true', () => {
    expect(canAccessPremium({ role: 'paid', expires_at: future, is_admin: false })).toBe(true);
  });
  it('free → false', () => {
    expect(canAccessPremium({ role: 'free', expires_at: past, is_admin: false })).toBe(false);
  });
  it('is_admin → true regardless', () => {
    expect(canAccessPremium({ role: 'free', expires_at: past, is_admin: true })).toBe(true);
  });
});

describe('trialDaysLeft', () => {
  it('trial with 2 days left → 2', () => {
    const result = trialDaysLeft({ role: 'trial', expires_at: future, is_admin: false });
    expect(result).toBe(2);
  });
  it('paid → null', () => {
    expect(trialDaysLeft({ role: 'paid', expires_at: future, is_admin: false })).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실행 (실패 확인)**

```bash
npx vitest run src/lib/access.test.ts
```

Expected: FAIL (파일이 아직 없으므로)

- [ ] **Step 4: access.ts 작성 후 테스트 재실행**

Step 1의 `access.ts`를 저장한 후:

```bash
npx vitest run src/lib/access.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: LoginGate 컴포넌트 생성**

```astro
---
// src/components/LoginGate.astro
interface Props {
  isLoggedIn: boolean;
}
const { isLoggedIn } = Astro.props;
---
<div class="gate-wrap">
  <div class="gate-card">
    <div class="gate-icon">🔒</div>
    <h2 class="gate-title">유료 회원 전용 글이에요</h2>
    {isLoggedIn ? (
      <>
        <p class="gate-desc">체험 기간이 끝났거나 구독이 만료됐어요.</p>
        <a href="/subscribe" class="btn-pill primary gate-btn">구독하기</a>
        <a href="/mypage" class="btn-pill ghost gate-btn">내 구독 확인</a>
      </>
    ) : (
      <>
        <p class="gate-desc">가입 후 3일간 모든 글을 무료로 읽어보세요.</p>
        <a href="/login?mode=signup" class="btn-pill primary gate-btn">무료로 시작하기</a>
        <a href="/login" class="btn-pill ghost gate-btn">이미 계정이 있어요</a>
      </>
    )}
  </div>
</div>

<style>
  .gate-wrap {
    min-height: 60vh; display: flex; align-items: center; justify-content: center;
    padding: 48px 16px;
  }
  .gate-card {
    max-width: 360px; width: 100%; text-align: center;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 40px 32px;
  }
  .gate-icon { font-size: 48px; margin-bottom: 16px; }
  .gate-title { font-size: 20px; font-weight: 800; margin-bottom: 12px; }
  .gate-desc { font-size: 14px; color: var(--text-3); margin-bottom: 24px; line-height: 1.6; }
  .gate-btn { width: 100%; justify-content: center; margin-bottom: 8px; }
</style>
```

- [ ] **Step 6: 글 상세 페이지에 접근 제어 적용**

`src/pages/post/[slug].astro`의 frontmatter에 접근 제어 로직 추가:

```astro
---
import Base from '../../layouts/Base.astro';
import LoginGate from '../../components/LoginGate.astro';
import { createSupabaseAdminClient } from '../../lib/supabase';
import { canAccessPremium } from '../../lib/access';
import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from '../../lib/remarkBlocks.mjs';
import remarkHtml from 'remark-html';

const { slug } = Astro.params;
const { user, supabase: userSupabase } = Astro.locals;
const adminSupabase = createSupabaseAdminClient();

const { data: post } = await adminSupabase
  .from('posts')
  .select('*')
  .eq('slug', slug)
  .eq('published', true)
  .single();

if (!post) return Astro.redirect('/');

// 접근 제어
let canAccess = !post.is_premium;
let profile = null;

if (post.is_premium && user) {
  const { data } = await adminSupabase
    .from('profiles')
    .select('role, expires_at, is_admin')
    .eq('user_id', user.id)
    .single();
  profile = data;
  canAccess = canAccessPremium(profile);
}

async function renderMarkdown(content: string): Promise<string> {
  const file = await remark()
    .use(remarkDirective)
    .use(remarkBlocks)
    .use(remarkHtml, { sanitize: false })
    .process(content);
  return String(file);
}

const days = ['일', '월', '화', '수', '목', '금', '토'];
const d = new Date(post.published_at);
const dateKo = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
const htmlContent = canAccess ? await renderMarkdown(post.content) : '';
---
<Base title={post.title} description={post.summary}>
  <div class="post-wrap">
    <article>
      <div class="detail-meta">
        <span class="detail-show">{post.show}</span>
        <span class="card-dot"></span>
        <span class="detail-date">{dateKo}</span>
        <span class="card-dot"></span>
        <span class="detail-hosts">{post.hosts.join(' · ')}</span>
        {post.is_premium && <span class="card-premium">유료</span>}
      </div>
      <h1 class="detail-title">{post.title}</h1>
      <p class="detail-summary">{post.summary}</p>
      {post.tags.length > 0 && (
        <div class="detail-tags">
          {post.tags.map((t: string) => <span class="tag">{t}</span>)}
        </div>
      )}
      {canAccess ? (
        <>
          <hr class="detail-divider" />
          <div class="prose" set:html={htmlContent} />
        </>
      ) : (
        <LoginGate isLoggedIn={!!user} />
      )}
    </article>
    <div class="post-footer">
      <a href="/" class="btn-pill ghost">← 피드로</a>
    </div>
  </div>
</Base>
```

- [ ] **Step 7: 로컬에서 접근 제어 확인**

1. Supabase 대시보드에서 특정 글의 `is_premium`을 `true`로 변경
2. 로그아웃 상태에서 해당 글 접속 → LoginGate 화면 표시 확인
3. 로그인 후 접속 → 체험 기간 내이면 전체 내용 표시 확인

- [ ] **Step 8: Commit**

```bash
git add src/lib/access.ts src/lib/access.test.ts src/components/LoginGate.astro \
  src/pages/post/[slug].astro vitest.config.ts package.json package-lock.json
git commit -m "feat: 프리미엄 글 접근 제어 + LoginGate 컴포넌트"
```

---

## Task 7: 체험 만료 알림 배너

**Context:** 체험 기간이 D-2일 또는 D-1일 남은 사용자에게 상단 배너를 표시한다. 배너는 X 버튼으로 숨길 수 있다(localStorage 기반). 팝업은 없다.

**Files:**
- Create: `src/components/TrialBanner.astro`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: TrialBanner 컴포넌트 생성**

```astro
---
// src/components/TrialBanner.astro
import { trialDaysLeft } from '../lib/access';
import type { AccessProfile } from '../lib/access';

interface Props {
  profile: AccessProfile | null;
}
const { profile } = Astro.props;
const daysLeft = trialDaysLeft(profile);
const showBanner = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

if (!showBanner) return;

const isUrgent = daysLeft <= 1;
const bgColor = isUrgent ? '#f39c12' : '#9b59b6';
const message = daysLeft === 0
  ? '오늘 자정에 체험 기간이 끝나요. 계속 읽으시려면 구독해주세요.'
  : `체험 기간이 ${daysLeft}일 남았어요. 만료 전에 구독하면 이어서 읽을 수 있어요.`;
---

<div
  class="trial-banner"
  id="trial-banner"
  style={`background: ${bgColor};`}
>
  <span class="trial-banner-text">{message}</span>
  <a href="/subscribe" class="trial-banner-link">구독하기 →</a>
  <button class="trial-banner-close" id="trial-banner-close" aria-label="닫기">✕</button>
</div>

<style>
  .trial-banner {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; color: #fff;
    font-size: 13px; font-weight: 600;
  }
  .trial-banner-text { flex: 1; }
  .trial-banner-link {
    color: #fff; text-decoration: underline; white-space: nowrap;
    font-weight: 700;
  }
  .trial-banner-close {
    background: none; border: none; color: rgba(255,255,255,0.8);
    cursor: pointer; font-size: 16px; padding: 0 4px; flex-shrink: 0;
  }
</style>

<script>
  const key = 'trial_banner_dismissed_' + new Date().toDateString();
  const banner = document.getElementById('trial-banner');
  const closeBtn = document.getElementById('trial-banner-close');

  if (localStorage.getItem(key)) {
    banner?.remove();
  }

  closeBtn?.addEventListener('click', () => {
    localStorage.setItem(key, '1');
    banner?.remove();
  });
</script>
```

- [ ] **Step 2: Base.astro에서 TrialBanner 표시**

`src/layouts/Base.astro`에서 프로필을 가져와 배너에 전달한다. frontmatter 부분을 업데이트:

```astro
---
import TrialBanner from '../components/TrialBanner.astro';
import { createSupabaseAdminClient } from '../lib/supabase';
import type { AccessProfile } from '../lib/access';

interface Props {
  title?: string;
  description?: string;
}
const { title = '테드픽', description = '매일 12시, 장 정리' } = Astro.props;
const { session } = Astro.locals;

let profile: AccessProfile | null = null;
if (session) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('role, expires_at, is_admin')
    .eq('user_id', session.user.id)
    .single();
  profile = data;
}
---
```

`<header>` 위에 TrialBanner 삽입:

```astro
<body>
  <div class="app">
    <TrialBanner profile={profile} />
    <header class="hdr">
    ...
```

- [ ] **Step 3: 체험 만료 알림 수동 테스트**

Supabase 대시보드에서 본인 profiles의 `expires_at`을 `now() + interval '1 day'`로 변경:

```sql
UPDATE profiles
SET expires_at = now() + interval '1 day'
WHERE user_id = '본인-uuid';
```

브라우저 새로고침 → 노란 배너 표시 확인. X 버튼 클릭 → 배너 숨겨지는지 확인. 새로고침 시 배너 안 나오는지 확인(localStorage).

테스트 후 `expires_at`을 원래대로 복구:
```sql
UPDATE profiles
SET expires_at = now() + interval '3 days'
WHERE user_id = '본인-uuid';
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TrialBanner.astro src/layouts/Base.astro
git commit -m "feat: 체험 만료 D-2/D-1 알림 배너"
```

---

## Task 8: 관리자 페이지

**Context:** `/admin` 이하 페이지는 middleware에서 `is_admin=true`인 사용자만 접근 가능하다(Task 3에서 구현됨). 관리자는 글 목록/유료 토글, 회원 등급 수동 조정, 구독 내역, 대시보드를 볼 수 있다.

**Files:**
- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/posts/index.astro`
- Create: `src/pages/admin/members/index.astro`
- Create: `src/pages/admin/subscriptions/index.astro`

- [ ] **Step 1: 관리자 대시보드 생성**

```astro
---
// src/pages/admin/index.astro
import AdminBase from '../../layouts/AdminBase.astro';
import { createSupabaseAdminClient } from '../../lib/supabase';

const supabase = createSupabaseAdminClient();

const [{ count: totalPosts }, { count: paidMembers }, { data: recentSubs }] = await Promise.all([
  supabase.from('posts').select('*', { count: 'exact', head: true }).eq('published', true),
  supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'paid'),
  supabase.from('subscriptions').select('*, profiles(*)').eq('status', 'paid').order('paid_at', { ascending: false }).limit(5),
]);
---
<AdminBase title="대시보드">
  <div class="admin-wrap">
    <h1 class="admin-heading">대시보드</h1>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num">{totalPosts ?? 0}</div>
        <div class="stat-label">발행된 글</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{paidMembers ?? 0}</div>
        <div class="stat-label">유료 구독자</div>
      </div>
    </div>
    <h2 class="admin-section-title">최근 결제</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>날짜</th><th>금액</th><th>상태</th></tr></thead>
        <tbody>
          {(recentSubs ?? []).map(s => (
            <tr>
              <td>{new Date(s.paid_at).toLocaleDateString('ko-KR')}</td>
              <td>{s.amount.toLocaleString()}원</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</AdminBase>

<style>
  .admin-wrap { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
  .admin-heading { font-size: 24px; font-weight: 800; margin-bottom: 24px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .stat-num { font-size: 32px; font-weight: 800; color: var(--blue); }
  .stat-label { font-size: 13px; color: var(--text-3); margin-top: 4px; }
  .admin-section-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
  .admin-table-wrap { overflow-x: auto; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th, .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
  .admin-table th { font-weight: 700; color: var(--text-3); font-size: 12px; }
</style>
```

- [ ] **Step 2: 관리자 글 목록 + 유료 토글**

```astro
---
// src/pages/admin/posts/index.astro
import AdminBase from '../../../layouts/AdminBase.astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

const supabase = createSupabaseAdminClient();
const { data: posts } = await supabase
  .from('posts')
  .select('id, slug, title, show, published_at, is_premium, published')
  .order('published_at', { ascending: false });
---
<AdminBase title="글 관리">
  <div class="admin-wrap">
    <div class="admin-header">
      <h1 class="admin-heading">글 관리</h1>
      <a href="/admin/posts/new" class="btn-pill primary">+ 새 글</a>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>제목</th><th>방송</th><th>날짜</th><th>유료</th><th>상태</th><th></th></tr>
        </thead>
        <tbody>
          {(posts ?? []).map(p => (
            <tr>
              <td><a href={`/post/${p.slug}`} class="post-link">{p.title}</a></td>
              <td>{p.show}</td>
              <td>{p.published_at ? new Date(p.published_at).toLocaleDateString('ko-KR') : '-'}</td>
              <td>
                <button
                  class={`badge-toggle ${p.is_premium ? 'badge-paid' : 'badge-free'}`}
                  data-id={p.id}
                  data-premium={String(p.is_premium)}
                >
                  {p.is_premium ? '유료' : '무료'}
                </button>
              </td>
              <td>{p.published ? '발행' : '임시저장'}</td>
              <td><a href={`/admin/posts/${p.id}`} class="btn-pill ghost" style="font-size:12px">편집</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</AdminBase>

<style>
  .admin-wrap { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
  .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .admin-heading { font-size: 24px; font-weight: 800; }
  .admin-table-wrap { overflow-x: auto; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th, .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
  .admin-table th { font-weight: 700; color: var(--text-3); font-size: 12px; }
  .post-link { color: var(--text-1); font-weight: 600; }
  .badge-toggle {
    padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;
    cursor: pointer; border: none; transition: all 140ms;
  }
  .badge-free { background: #f1f2f6; color: var(--text-3); }
  .badge-paid { background: var(--blue); color: #fff; }
</style>

<script>
  document.querySelectorAll<HTMLButtonElement>('.badge-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id!;
      const isPremium = btn.dataset.premium === 'true';
      const res = await fetch('/api/admin/toggle-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_premium: !isPremium }),
      });
      if (res.ok) {
        btn.dataset.premium = String(!isPremium);
        btn.textContent = !isPremium ? '유료' : '무료';
        btn.className = `badge-toggle ${!isPremium ? 'badge-paid' : 'badge-free'}`;
      }
    });
  });
</script>
```

- [ ] **Step 3: 유료/무료 토글 API 생성**

```typescript
// src/pages/api/admin/toggle-premium.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.session) return new Response('Unauthorized', { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', locals.session.user.id)
    .single();

  if (!profile?.is_admin) return new Response('Forbidden', { status: 403 });

  const { id, is_premium } = await request.json();
  const { error } = await supabase.from('posts').update({ is_premium }).eq('id', id);
  if (error) return new Response(error.message, { status: 500 });

  return new Response('ok');
};
```

- [ ] **Step 4: 회원 관리 페이지**

```astro
---
// src/pages/admin/members/index.astro
import AdminBase from '../../../layouts/AdminBase.astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

const supabase = createSupabaseAdminClient();
const { data: members } = await supabase
  .from('profiles')
  .select('user_id, role, expires_at, is_admin, created_at, users:auth.users(email)')
  .order('created_at', { ascending: false });
---
<AdminBase title="회원 관리">
  <div class="admin-wrap">
    <h1 class="admin-heading">회원 관리</h1>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>이메일</th><th>등급</th><th>만료일</th><th>관리자</th><th></th></tr>
        </thead>
        <tbody>
          {(members ?? []).map(m => (
            <tr>
              <td>{(m as any).users?.email ?? '-'}</td>
              <td>
                <span class={`role-badge role-${m.role}`}>{m.role}</span>
              </td>
              <td>{new Date(m.expires_at).toLocaleDateString('ko-KR')}</td>
              <td>{m.is_admin ? '✓' : ''}</td>
              <td>
                <button
                  class="btn-pill ghost"
                  style="font-size:12px"
                  data-userid={m.user_id}
                  data-role={m.role}
                  data-expires={m.expires_at}
                  onclick="openEdit(this)"
                >수정</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>

  <!-- 수정 모달 -->
  <div id="edit-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:100; display:none; align-items:center; justify-content:center;">
    <div style="background:var(--card); border-radius:16px; padding:32px; width:320px;">
      <h3 style="font-size:16px; font-weight:700; margin-bottom:20px;">회원 등급 수정</h3>
      <input type="hidden" id="edit-userid" />
      <label style="display:block; margin-bottom:12px; font-size:12px; font-weight:700; color:var(--text-3);">
        등급
        <select id="edit-role" style="display:block; width:100%; padding:8px; margin-top:4px; border:1px solid var(--border); border-radius:8px;">
          <option value="trial">trial</option>
          <option value="paid">paid</option>
          <option value="free">free</option>
        </select>
      </label>
      <label style="display:block; margin-bottom:20px; font-size:12px; font-weight:700; color:var(--text-3);">
        만료일
        <input type="datetime-local" id="edit-expires" style="display:block; width:100%; padding:8px; margin-top:4px; border:1px solid var(--border); border-radius:8px;" />
      </label>
      <div style="display:flex; gap:8px;">
        <button class="btn-pill primary" style="flex:1" onclick="saveEdit()">저장</button>
        <button class="btn-pill ghost" style="flex:1" onclick="closeEdit()">취소</button>
      </div>
    </div>
  </div>
</AdminBase>

<style>
  .admin-wrap { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
  .admin-heading { font-size: 24px; font-weight: 800; margin-bottom: 24px; }
  .admin-table-wrap { overflow-x: auto; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th, .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
  .admin-table th { font-weight: 700; color: var(--text-3); font-size: 12px; }
  .role-badge { padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
  .role-trial { background: #e8f0fe; color: #1a73e8; }
  .role-paid { background: #e6f4ea; color: #1e8e3e; }
  .role-free { background: #f1f2f6; color: var(--text-3); }
</style>

<script>
  function openEdit(btn: any) {
    const modal = document.getElementById('edit-modal')!;
    document.getElementById('edit-userid')!.value = btn.dataset.userid;
    (document.getElementById('edit-role') as HTMLSelectElement).value = btn.dataset.role;
    (document.getElementById('edit-expires') as HTMLInputElement).value =
      new Date(btn.dataset.expires).toISOString().slice(0, 16);
    modal.style.display = 'flex';
  }
  function closeEdit() {
    document.getElementById('edit-modal')!.style.display = 'none';
  }
  async function saveEdit() {
    const userId = (document.getElementById('edit-userid') as HTMLInputElement).value;
    const role = (document.getElementById('edit-role') as HTMLSelectElement).value;
    const expiresAt = (document.getElementById('edit-expires') as HTMLInputElement).value;
    await fetch('/api/admin/update-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role, expires_at: new Date(expiresAt).toISOString() }),
    });
    closeEdit();
    window.location.reload();
  }
  (window as any).openEdit = openEdit;
  (window as any).closeEdit = closeEdit;
  (window as any).saveEdit = saveEdit;
</script>
```

- [ ] **Step 5: 회원 수정 API 생성**

```typescript
// src/pages/api/admin/update-member.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.session) return new Response('Unauthorized', { status: 401 });

  const adminSupabase = createSupabaseAdminClient();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', locals.session.user.id)
    .single();

  if (!profile?.is_admin) return new Response('Forbidden', { status: 403 });

  const { user_id, role, expires_at } = await request.json();
  const { error } = await adminSupabase
    .from('profiles')
    .update({ role, expires_at })
    .eq('user_id', user_id);

  if (error) return new Response(error.message, { status: 500 });
  return new Response('ok');
};
```

- [ ] **Step 6: 결제 내역 페이지**

```astro
---
// src/pages/admin/subscriptions/index.astro
import AdminBase from '../../../layouts/AdminBase.astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

const supabase = createSupabaseAdminClient();
const { data: subs } = await supabase
  .from('subscriptions')
  .select('*, users:auth.users(email)')
  .order('paid_at', { ascending: false });
---
<AdminBase title="결제 내역">
  <div class="admin-wrap">
    <h1 class="admin-heading">결제 내역</h1>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>날짜</th><th>이메일</th><th>금액</th><th>상태</th></tr>
        </thead>
        <tbody>
          {(subs ?? []).map(s => (
            <tr>
              <td>{new Date(s.paid_at).toLocaleDateString('ko-KR')}</td>
              <td>{(s as any).users?.email ?? '-'}</td>
              <td>{s.amount.toLocaleString()}원</td>
              <td>
                <span class={`role-badge ${s.status === 'paid' ? 'role-paid' : 'role-free'}`}>
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</AdminBase>

<style>
  .admin-wrap { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
  .admin-heading { font-size: 24px; font-weight: 800; margin-bottom: 24px; }
  .admin-table-wrap { overflow-x: auto; }
  .admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .admin-table th, .admin-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
  .admin-table th { font-weight: 700; color: var(--text-3); font-size: 12px; }
  .role-badge { padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
  .role-paid { background: #e6f4ea; color: #1e8e3e; }
  .role-free { background: #f1f2f6; color: var(--text-3); }
</style>
```

- [ ] **Step 7: 로컬에서 관리자 페이지 확인**

```bash
npm run dev
```

1. `http://localhost:4321/admin` → 대시보드 확인
2. `/admin/posts` → 글 목록, 유료/무료 토글 동작 확인
3. `/admin/members` → 회원 목록, 등급 수정 확인

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/ src/pages/api/admin/
git commit -m "feat: 관리자 페이지 (대시보드/글/회원/구독 관리)"
```

---

## Task 9: 토스페이먼츠 연동

**Context:** 토스페이먼츠 정기결제(빌링키 방식)를 사용한다. 월정액 가격은 미확정이므로 환경변수 `TOSS_MONTHLY_PRICE`로 관리한다. 흐름: `/subscribe` → 토스 결제창 → 빌링키 발급 → `/api/toss/billing` → webhook → profiles 업데이트.

**주의:** 토스페이먼츠 테스트 모드 키로 개발하고, 프로덕션 키는 출시 직전에 교체.

**Files:**
- Create: `src/pages/subscribe.astro`
- Create: `src/pages/mypage.astro`
- Create: `src/pages/api/toss/billing.ts`
- Create: `src/pages/api/toss/webhook.ts`

- [ ] **Step 1: 토스페이먼츠 테스트 키 발급 (수동)**

1. https://developers.tosspayments.com → 로그인 → 내 개발정보
2. 테스트 키 복사:
   - 클라이언트 키 → 프론트엔드에서 사용 (PUBLIC)
   - 시크릿 키 → `.env`의 `TOSS_SECRET_KEY`
3. `.env`에 추가:

```bash
TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...
TOSS_WEBHOOK_SECRET=임의의-긴-문자열
TOSS_MONTHLY_PRICE=9900
```

- [ ] **Step 2: 구독 안내 페이지 생성**

```astro
---
// src/pages/subscribe.astro
import Base from '../layouts/Base.astro';

const { user } = Astro.locals;
const price = Number(import.meta.env.TOSS_MONTHLY_PRICE ?? 9900);
const clientKey = import.meta.env.TOSS_CLIENT_KEY;
---
<Base title="구독하기">
  <div class="subscribe-wrap">
    <div class="subscribe-card">
      <h1 class="subscribe-title">테드픽 멤버십</h1>
      <div class="subscribe-price">
        <span class="price-amount">{price.toLocaleString()}</span>
        <span class="price-unit">원 / 월</span>
      </div>
      <ul class="subscribe-benefits">
        <li>✓ 모든 유료 글 무제한 열람</li>
        <li>✓ 매일 오전 방송 정리 즉시 발행</li>
        <li>✓ 언제든지 취소 가능</li>
      </ul>
      {user ? (
        <button class="btn-pill primary subscribe-btn" id="toss-btn" data-amount={price}>
          {price.toLocaleString()}원으로 시작하기
        </button>
      ) : (
        <a href="/login?mode=signup&next=/subscribe" class="btn-pill primary subscribe-btn">
          무료 체험 후 구독
        </a>
      )}
      <p class="subscribe-note">첫 달 결제 후 매월 자동 갱신. 언제든 취소 가능해요.</p>
    </div>
  </div>
</Base>

<style>
  .subscribe-wrap {
    min-height: calc(100vh - 57px);
    display: flex; align-items: center; justify-content: center; padding: 24px 16px;
  }
  .subscribe-card {
    max-width: 400px; width: 100%; text-align: center;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 20px; padding: 48px 32px;
  }
  .subscribe-title { font-size: 24px; font-weight: 800; margin-bottom: 24px; }
  .subscribe-price { margin-bottom: 24px; }
  .price-amount { font-size: 48px; font-weight: 900; color: var(--blue); }
  .price-unit { font-size: 18px; color: var(--text-3); }
  .subscribe-benefits { list-style: none; text-align: left; margin-bottom: 32px; }
  .subscribe-benefits li { padding: 8px 0; font-size: 15px; border-bottom: 1px solid var(--border); }
  .subscribe-btn { width: 100%; justify-content: center; padding: 14px; font-size: 16px; }
  .subscribe-note { font-size: 12px; color: var(--text-3); margin-top: 16px; }
</style>

<script define:vars={{ clientKey }}>
  const btn = document.getElementById('toss-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      const amount = Number(btn.dataset.amount);
      const { loadTossPayments } = await import('https://js.tosspayments.com/v2/payment');
      const toss = await loadTossPayments(clientKey);
      const payment = toss.payment({ customerKey: crypto.randomUUID() });
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/api/toss/billing?amount=${amount}`,
        failUrl: `${window.location.origin}/subscribe?error=fail`,
        customerEmail: '',
        customerName: '',
      });
    });
  }
</script>
```

- [ ] **Step 3: 빌링키 결제 API 생성**

```typescript
// src/pages/api/toss/billing.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.session) return new Response(null, { status: 302, headers: { Location: '/login' } });

  const authKey = url.searchParams.get('authKey');
  const customerKey = url.searchParams.get('customerKey');
  const amount = Number(url.searchParams.get('amount') ?? import.meta.env.TOSS_MONTHLY_PRICE ?? 9900);

  if (!authKey || !customerKey) return new Response(null, { status: 302, headers: { Location: '/subscribe?error=missing' } });

  // 빌링키 발급
  const billingRes = await fetch(`https://api.tosspayments.com/v1/billing/authorizations/${authKey}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(import.meta.env.TOSS_SECRET_KEY + ':')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customerKey }),
  });

  if (!billingRes.ok) {
    return new Response(null, { status: 302, headers: { Location: '/subscribe?error=billing' } });
  }

  const billing = await billingRes.json();
  const billingKey = billing.billingKey;
  const orderId = `order_${Date.now()}_${locals.session.user.id.slice(0, 8)}`;

  // 첫 번째 결제
  const payRes = await fetch('https://api.tosspayments.com/v1/billing/' + billingKey, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(import.meta.env.TOSS_SECRET_KEY + ':')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerKey,
      amount,
      orderId,
      orderName: '테드픽 멤버십 월정액',
      customerEmail: locals.session.user.email,
      customerName: '',
    }),
  });

  if (!payRes.ok) {
    return new Response(null, { status: 302, headers: { Location: '/subscribe?error=payment' } });
  }

  const pay = await payRes.json();
  const supabase = createSupabaseAdminClient();

  // subscriptions 기록
  await supabase.from('subscriptions').insert({
    user_id: locals.session.user.id,
    amount,
    status: 'paid',
    toss_billing_key: billingKey,
    toss_order_id: orderId,
  });

  // profiles 업데이트: paid + 1개월 연장
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  await supabase.from('profiles').update({
    role: 'paid',
    expires_at: expiresAt.toISOString(),
  }).eq('user_id', locals.session.user.id);

  return new Response(null, { status: 302, headers: { Location: '/mypage?success=1' } });
};
```

- [ ] **Step 4: 토스 Webhook 수신 API 생성**

```typescript
// src/pages/api/toss/webhook.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';
import { createHmac } from 'crypto';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();

  // webhook 서명 검증
  const signature = request.headers.get('toss-signature') ?? '';
  const expected = createHmac('sha256', import.meta.env.TOSS_WEBHOOK_SECRET)
    .update(body)
    .digest('base64');

  if (signature !== expected) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);
  const supabase = createSupabaseAdminClient();

  if (event.eventType === 'PAYMENT_STATUS_CHANGED') {
    const { orderId, status } = event.data;

    if (status === 'DONE') {
      // 구독 갱신: subscriptions 업데이트 + profiles 만료일 +1개월
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('toss_order_id', orderId)
        .single();

      if (sub) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        await supabase.from('profiles').update({
          role: 'paid',
          expires_at: expiresAt.toISOString(),
        }).eq('user_id', sub.user_id);
      }
    } else if (status === 'CANCELED') {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('toss_order_id', orderId)
        .single();

      if (sub) {
        await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('toss_order_id', orderId);
        await supabase.from('profiles').update({ role: 'free' }).eq('user_id', sub.user_id);
      }
    }
  }

  return new Response('ok', { status: 200 });
};
```

- [ ] **Step 5: 내 구독 현황 페이지 생성**

```astro
---
// src/pages/mypage.astro
import Base from '../layouts/Base.astro';
import { createSupabaseAdminClient } from '../lib/supabase';

const { user } = Astro.locals;
if (!user) return Astro.redirect('/login');

const supabase = createSupabaseAdminClient();
const { data: profile } = await supabase
  .from('profiles')
  .select('role, expires_at')
  .eq('user_id', user.id)
  .single();

const { data: subs } = await supabase
  .from('subscriptions')
  .select('amount, status, paid_at')
  .eq('user_id', user.id)
  .order('paid_at', { ascending: false })
  .limit(10);

const success = Astro.url.searchParams.get('success');
const expiresStr = profile ? new Date(profile.expires_at).toLocaleDateString('ko-KR') : '-';
const isActive = profile && ['trial', 'paid'].includes(profile.role) && new Date(profile.expires_at) > new Date();
---
<Base title="내 구독">
  <div class="mypage-wrap">
    <h1 class="mypage-title">내 구독</h1>
    {success && <div class="success-banner">구독이 시작됐어요! 이제 모든 글을 읽을 수 있어요.</div>}

    <div class="mypage-card">
      <div class="status-row">
        <span class="status-label">현재 상태</span>
        <span class={`status-badge ${isActive ? 'status-active' : 'status-inactive'}`}>
          {isActive ? (profile?.role === 'trial' ? '체험 중' : '구독 중') : '만료됨'}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">{profile?.role === 'trial' ? '체험 만료일' : '구독 만료일'}</span>
        <span class="status-value">{expiresStr}</span>
      </div>
      {!isActive && (
        <a href="/subscribe" class="btn-pill primary" style="width:100%; justify-content:center; margin-top:16px;">
          구독하기
        </a>
      )}
    </div>

    {(subs ?? []).length > 0 && (
      <>
        <h2 class="mypage-section">결제 내역</h2>
        <div class="mypage-table-wrap">
          <table class="mypage-table">
            <thead><tr><th>날짜</th><th>금액</th><th>상태</th></tr></thead>
            <tbody>
              {subs!.map(s => (
                <tr>
                  <td>{new Date(s.paid_at).toLocaleDateString('ko-KR')}</td>
                  <td>{s.amount.toLocaleString()}원</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
</Base>

<style>
  .mypage-wrap { max-width: 480px; margin: 0 auto; padding: 32px 16px; }
  .mypage-title { font-size: 22px; font-weight: 800; margin-bottom: 24px; }
  .success-banner {
    background: #e6f4ea; border: 1px solid #a8d5b5; border-radius: 10px;
    padding: 12px 16px; font-size: 14px; color: #1e8e3e; font-weight: 600;
    margin-bottom: 20px;
  }
  .mypage-card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 24px;
  }
  .status-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .status-row:last-of-type { border-bottom: none; }
  .status-label { font-size: 14px; color: var(--text-3); }
  .status-badge { font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
  .status-active { background: #e6f4ea; color: #1e8e3e; }
  .status-inactive { background: #f1f2f6; color: var(--text-3); }
  .status-value { font-size: 14px; font-weight: 600; }
  .mypage-section { font-size: 16px; font-weight: 700; margin: 24px 0 12px; }
  .mypage-table-wrap { overflow-x: auto; }
  .mypage-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .mypage-table th, .mypage-table td { padding: 10px 0; border-bottom: 1px solid var(--border); text-align: left; }
  .mypage-table th { font-size: 12px; font-weight: 700; color: var(--text-3); }
</style>
```

- [ ] **Step 6: Vercel에서 Webhook URL 등록 (수동)**

배포 후:
1. 토스페이먼츠 대시보드 → Webhook 설정
2. URL: `https://tedpick.vercel.app/api/toss/webhook`
3. 이벤트: `PAYMENT_STATUS_CHANGED` 선택

- [ ] **Step 7: 테스트 결제 확인 (수동)**

토스 테스트 키 상태에서:
1. `http://localhost:4321/subscribe` 접속 (로그인 상태)
2. "구독하기" 클릭 → 토스 테스트 결제창 진행
3. 테스트 카드번호: `4330000000000000`
4. `/mypage` 에서 `구독 중` 상태 확인
5. Supabase profiles 테이블에서 `role=paid`, `expires_at=+1개월` 확인

- [ ] **Step 8: Commit**

```bash
git add src/pages/subscribe.astro src/pages/mypage.astro \
  src/pages/api/toss/ package.json
git commit -m "feat: 토스페이먼츠 정기결제 연동"
```

---

## Task 10: Vercel Analytics 활성화

**Context:** Vercel Analytics는 `@vercel/analytics` 패키지 하나로 바로 사용 가능하다. Vercel 프로젝트 대시보드에서도 활성화해야 한다.

**Files:**
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: 패키지 설치**

```bash
npm install @vercel/analytics
```

- [ ] **Step 2: Base.astro에 Analytics 삽입**

`src/layouts/Base.astro`의 `</body>` 바로 앞에 추가:

```astro
---
import { Analytics } from '@vercel/analytics/astro';
---
<!-- ... 기존 코드 ... -->
    <Analytics />
  </div>
</body>
```

(frontmatter import 추가, body 닫기 전 컴포넌트 삽입)

- [ ] **Step 3: Vercel 대시보드에서 Analytics 활성화 (수동)**

1. Vercel 대시보드 → tedpick 프로젝트 → Analytics 탭
2. "Enable" 클릭

- [ ] **Step 4: 배포 후 확인**

```bash
git add src/layouts/Base.astro package.json package-lock.json
git commit -m "feat: Vercel Analytics 활성화"
```

Vercel에 push 후 Analytics 탭에서 데이터 수집 확인.

---

## Task 11: 콘텐츠 파일 정리 (마무리)

**Context:** Task 4에서 MD 파일을 DB로 이전했다. 이제 기존 파일 기반 시스템을 제거한다.

**Files:**
- Delete: `src/content.config.ts`
- Delete: `src/content/posts/` (디렉토리 전체)
- Modify: `src/layouts/Base.astro` 헤더 (기존 `/editor` 링크 제거)

- [ ] **Step 1: 기존 파일 시스템 제거**

```bash
git rm src/content.config.ts
git rm -r src/content/
# 기존 /editor 페이지도 제거 (이제 /admin/posts/new 사용)
git rm src/pages/editor/index.astro
```

- [ ] **Step 2: astro:content import 제거 확인**

```bash
grep -r "astro:content" src/
```

Expected: 결과 없음 (모두 제거됨)

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 오류 없이 완료

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: 기존 MD 파일 기반 시스템 제거"
```

---

## 전체 환경변수 목록

Vercel 대시보드 → Settings → Environment Variables 에 아래를 등록해야 한다:

| 키 | 예시 | 필요 환경 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | All |
| `TOSS_CLIENT_KEY` | `test_ck_...` | All |
| `TOSS_SECRET_KEY` | `test_sk_...` | All |
| `TOSS_WEBHOOK_SECRET` | `임의의 긴 문자열` | All |
| `TOSS_MONTHLY_PRICE` | `9900` | All |

---

## 구현 후 필수 체크리스트

- [ ] Supabase → Authentication → Email confirm: 프로덕션에서는 ON 으로 켜기
- [ ] 토스페이먼츠 키를 테스트 → 실제 키로 교체
- [ ] Supabase RLS 재확인 (service_role 이외의 경로로 프리미엄 콘텐츠 노출 없는지)
- [ ] 월정액 가격 결정 후 `TOSS_MONTHLY_PRICE` 업데이트
- [ ] Vercel Analytics 대시보드 확인
