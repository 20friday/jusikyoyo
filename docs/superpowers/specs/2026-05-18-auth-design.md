# 테드픽 — SSR 전환 + Supabase 인증 설계

**날짜:** 2026-05-18
**범위:** 멤버십 구현 1~3단계 (SSR 전환 → Supabase 설정 → 인증)
**상태:** 승인됨

---

## 목표

Astro 정적 사이트를 SSR로 전환하고, Supabase Auth 기반 로그인·회원가입 시스템을 구축한다.
이메일/비밀번호와 소셜 로그인(구글, 네이버)을 지원하며, 가입 시 3일 무료 체험이 자동 설정된다.

---

## 1단계 — Astro SSR 전환

### 변경 사항

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 렌더링 | `output: 'static'` | `output: 'server'` |
| 어댑터 | 없음 | `@astrojs/vercel` |
| 세션 관리 | 없음 | `src/middleware.ts` |

### 추가 패키지

```
@astrojs/vercel
@supabase/supabase-js
@supabase/ssr
```

### 미들웨어 (`src/middleware.ts`)

모든 요청에서 실행. Supabase 클라이언트를 생성하고 세션·유저 정보를 `Astro.locals`에 주입.

```ts
// Astro.locals에 주입되는 값
Astro.locals.supabase  // SupabaseClient (쿠키 기반)
Astro.locals.session   // Session | null
Astro.locals.user      // User | null
```

쿠키 읽기/쓰기는 `@supabase/ssr`의 `createServerClient`가 처리.

### 환경변수

| 변수 | 용도 | 클라이언트 노출 |
|------|------|--------------|
| `PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 허용 |
| `PUBLIC_SUPABASE_ANON_KEY` | 공개 API 키 | 허용 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 관리 작업 | **절대 불가** |

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 코드(API 라우트, 서버사이드 함수)에서만 사용.
클라이언트 번들에 포함되거나 `PUBLIC_` 접두사를 붙여서는 안 된다.

---

## 2단계 — Supabase 설정

### profiles 테이블

`auth.users`와 1:1 대응. Supabase Auth가 생성한 users에 대한 추가 정보를 저장.

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `user_id` | uuid PK, FK → auth.users | | 사용자 식별자 |
| `role` | text | `'user'` | 권한 (`user` / `admin`) |
| `subscription_status` | text | `'trial'` | 구독 상태 (`trial` / `paid` / `expired`) |
| `trial_expires_at` | timestamptz | 가입일 + 3일 | 체험 만료일 |
| `created_at` | timestamptz | `now()` | 생성일 |

**`role` 필드 정의:**
- `user` — 일반 사용자 (기본값)
- `admin` — 관리자. `/admin` 접근 가능

**`subscription_status` 필드 정의:**
- `trial` — 체험 중. `trial_expires_at` 이전이면 전체 열람 가능
- `paid` — 유료 구독 중 (토스페이먼츠 연동 후 사용)
- `expired` — 체험/구독 만료. 무료 글만 열람 가능

### DB Trigger

`auth.users`에 새 row가 INSERT될 때 자동 실행.
이메일 가입과 소셜 가입(구글, 네이버) 모두 동일하게 처리.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, role, subscription_status, trial_expires_at)
  VALUES (
    NEW.id,
    'user',
    'trial',
    NOW() + INTERVAL '3 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### RLS 정책

```sql
-- 본인 row만 읽기 허용
CREATE POLICY "profiles: 본인 읽기"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 row만 업데이트 허용 (role 제외 — 서버에서만 변경)
CREATE POLICY "profiles: 본인 업데이트"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);
```

---

## 3단계 — 인증

### 페이지 구성

| 경로 | 설명 |
|------|------|
| `/login` | 로그인 (이메일 + 소셜) |
| `/signup` | 회원가입 (이메일 + 소셜) |
| `/auth/callback` | OAuth 세션 교환 처리 |

이미 로그인된 상태에서 `/login`, `/signup` 접근 시 `/`로 리다이렉트.
로그인/회원가입 성공 시 항상 `/`로 이동.

### `/login` 페이지

- 이메일 + 비밀번호 폼
- 구글 로그인 버튼
- 네이버 로그인 버튼
- "계정이 없으신가요? 회원가입" 링크 → `/signup`
- 에러 표시: URL 쿼리 `?error=auth_failed` 감지 시 인라인 메시지

### `/signup` 페이지

- 이메일 + 비밀번호 + 비밀번호 확인 폼
- 구글 로그인 버튼
- 네이버 로그인 버튼
- "이미 계정이 있으신가요? 로그인" 링크 → `/login`
- 가입 성공 → DB trigger가 profiles row 자동 생성 → `/`로 이동

### `/auth/callback` 페이지

소셜 로그인 후 Supabase가 리다이렉트하는 경로.

```
1. URL에서 code 파라미터 추출
2. supabase.auth.exchangeCodeForSession(code) 호출
3. 성공 → / 리다이렉트
4. 실패 → /login?error=auth_failed 리다이렉트
```

### 소셜 로그인

**구글:**
```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${origin}/auth/callback` },
})
```

**네이버:**
Supabase 대시보드에서 Custom OAuth/OIDC provider로 등록.
등록 시 부여받은 Custom Provider ID를 사용 (형식: `custom:naver`).

```ts
await supabase.auth.signInWithOAuth({
  provider: 'custom:naver', // 실제 등록 ID에 맞춰 조정
  options: { redirectTo: `${origin}/auth/callback` },
})
```

네이버 Developers에서 앱 등록 필요:
- 서비스 URL: 실제 도메인
- Callback URL: Supabase 대시보드에서 제공하는 redirect URI

---

## 파일 구조 (신규/변경)

```
astro.config.mjs          # output: 'server', vercel adapter 추가
src/
  middleware.ts            # 신규 — 세션 주입
  env.d.ts                 # Astro.locals 타입 정의 업데이트
  pages/
    login.astro            # 신규
    signup.astro           # 신규
    auth/
      callback.astro       # 신규
  lib/
    supabase.ts            # 신규 — 서버/클라이언트 Supabase 클라이언트 팩토리
```

---

## 보안 원칙

1. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용. 클라이언트 번들에 포함 금지.
2. 세션은 `@supabase/ssr`의 쿠키 기반 방식으로만 관리.
3. `profiles.role` 변경은 서버 코드(`SUPABASE_SERVICE_ROLE_KEY` 사용)에서만 허용.
4. RLS 활성화 필수. anon key로는 본인 데이터만 접근 가능.
