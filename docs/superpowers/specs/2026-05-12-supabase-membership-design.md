# 테드픽 — Supabase 멤버십 & 관리자 페이지 설계

**날짜:** 2026-05-12  
**상태:** 승인됨

---

## 목표

주식 방송 정리 블로그 테드픽에 멤버십 구독 시스템과 관리자 페이지를 추가한다.

- 일부 글은 유료 회원 전용으로 잠금
- 신규 가입자에게 3일 무료 체험 제공
- 토스페이먼츠로 월정액 자동 결제
- 관리자(Ted)가 회원 등급·유효기간을 직접 관리 가능

---

## 기술 스택 변경

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 렌더링 | Astro 정적(Static) | Astro SSR (Vercel) |
| 콘텐츠 저장 | 마크다운 파일 → GitHub API | Supabase DB (posts 테이블) |
| 인증 | 없음 | Supabase Auth |
| 결제 | 없음 | 토스페이먼츠 정기결제 |
| 방문 통계 | 없음 | Vercel Analytics (내장) |

---

## 사용자 유형

| 유형 | 조건 | 접근 범위 |
|------|------|----------|
| 비회원 | 미로그인 | 무료 글만 |
| 체험 회원 | 가입 후 3일 이내 | 전체 |
| 유료 회원 | 결제 완료, 만료일 이내 | 전체 |
| 만료 회원 | 체험/구독 만료 | 무료 글만 |
| 관리자 | is_admin = true | 전체 + /admin |

---

## 회원 흐름

```
회원가입 → 3일 무료 체험(전체 열람) → 만료 → 유료 구독(토스 결제) → 자동 갱신
```

### 체험 만료 알림 (부담 없는 방식)
- **D-2일:** 상단 배너 (보라색, X 버튼으로 숨기기 가능)
- **D-1일:** 상단 배너 (노란색, X 버튼으로 숨기기 가능)
- **만료 후:** 유료 글 진입 시 인라인 안내 (팝업 없음)
- 무료 글은 항상 제한 없이 열람 가능

---

## 데이터베이스 스키마

### users
Supabase Auth가 자동 생성.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | 사용자 식별자 |
| email | text | 이메일 |
| created_at | timestamp | 가입일 |

### profiles
회원 등급 및 상태 관리.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| user_id | uuid FK → users | |
| role | text | trial / paid / free |
| expires_at | timestamp | 체험 또는 구독 만료일 |
| is_admin | boolean | 관리자 여부 |

가입 시 `role=trial`, `expires_at=가입일+3일` 자동 설정.  
만료 후 별도 처리 없이 `expires_at` 초과 여부로 접근 제어.

### posts
기존 마크다운 파일을 DB로 이전.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| title | text | 제목 |
| content | text | 마크다운 본문 |
| slug | text unique | URL용 식별자 |
| is_premium | boolean | 유료 여부 |
| show | text | 방송 이름 |
| hosts | text[] | 출연진 |
| summary | text | 한 줄 요약 |
| tags | text[] | 태그 |
| published_at | timestamp | 발행일 |

### subscriptions
토스페이먼츠 webhook으로 자동 기록.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → users | |
| amount | integer | 결제 금액 |
| status | text | paid / cancelled |
| toss_billing_key | text | 토스 자동결제 키 |
| paid_at | timestamp | 결제일 |

---

## 접근 제어 규칙

Astro SSR 서버에서 매 요청마다 확인.

```
글 상세 페이지 진입 시:
  if post.is_premium == false → 누구나 열람
  if post.is_premium == true:
    if 미로그인 → 로그인 유도
    if profile.role == 'trial' or 'paid' AND expires_at > now() → 열람 허용
    else → 구독 유도 화면
```

---

## 페이지 구성

### 공개 페이지
| 경로 | 설명 |
|------|------|
| `/` | 피드 (무료/유료 뱃지 표시) |
| `/post/[slug]` | 글 상세 (접근 제어 적용) |
| `/login` | 로그인 / 회원가입 |
| `/subscribe` | 구독 안내 + 토스 결제 |
| `/mypage` | 내 구독 현황, 만료일 확인 |

### 관리자 페이지 `/admin` (is_admin 필수)
| 경로 | 설명 |
|------|------|
| `/admin` | 대시보드 (구독자 수, 최근 결제) |
| `/admin/posts` | 글 목록 + 무료/유료 토글 |
| `/admin/posts/new` | 글 쓰기 (기존 에디터 이전) |
| `/admin/posts/[id]` | 글 수정 |
| `/admin/members` | 회원 목록, 등급·만료일 수동 설정 |
| `/admin/subscriptions` | 결제 내역 |

---

## 토스페이먼츠 연동

- **방식:** 정기결제 (빌링키 방식)
- **흐름:** 결제 완료 → webhook → `/api/toss/webhook` → `profiles.role=paid`, `expires_at=+1개월` 업데이트
- **취소 시:** webhook → `profiles.role=free` 업데이트
- **환경변수:** `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`

---

## 구현 순서 (단계별)

1. **Astro SSR 전환** — `output: 'server'` 설정, Vercel adapter
2. **Supabase 설정** — 프로젝트 생성, 테이블 4개 생성, RLS 정책
3. **인증** — 로그인/회원가입 페이지, 가입 시 trial 자동 설정
4. **콘텐츠 이전** — 기존 MD 파일 → posts 테이블 마이그레이션
5. **에디터 이전** — GitHub API 저장 → Supabase DB 저장으로 교체
6. **접근 제어** — 글 상세 페이지 서버사이드 접근 제어
7. **체험 만료 알림 배너**
8. **관리자 페이지** — 글/회원/구독 관리
9. **토스페이먼츠 연동** — 결제, webhook, 자동 갱신
10. **Vercel Analytics** 활성화

---

## 미결 사항

- 월정액 가격 미정 (구현 전 결정 필요)
- 소셜 로그인 포함 여부 (이메일만으로 시작 권장)
