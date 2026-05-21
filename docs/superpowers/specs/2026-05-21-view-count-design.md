# 조회수 기능 설계

**날짜:** 2026-05-21  
**상태:** 승인됨

---

## 개요

피드 포스트, 오늘의 픽, 주간 픽 각 페이지의 조회수를 집계하고 어드민에서 확인한다.

---

## 접근 방식

- 각 테이블에 `view_count integer default 0` 컬럼 추가
- Supabase RPC 함수로 원자적 increment
- 각 상세 페이지 로드 시 클라이언트 스크립트에서 RPC 호출 (fire-and-forget)
- 어드민 글 관리 페이지 테이블에 조회수 컬럼 표시
- 중복 제거 없음 — 페이지 로드마다 카운트

---

## 대상 테이블 및 페이지

| 테이블 | 사용자 페이지 | 어드민 페이지 | 식별자 |
|---|---|---|---|
| `posts` | `/post/[slug]` | `/admin/posts` | `slug` |
| `daily_reports` | `/report/[date]` | `/admin/reports` | `date` |
| `weekly_reports` | `/weekly/[date]` | `/admin/weekly` | `date` |

---

## Supabase 변경

### 컬럼 추가

```sql
alter table posts add column view_count integer not null default 0;
alter table daily_reports add column view_count integer not null default 0;
alter table weekly_reports add column view_count integer not null default 0;
```

### RPC 함수 3개

```sql
create or replace function increment_post_view(post_slug text)
returns void language sql security definer as $$
  update posts set view_count = view_count + 1 where slug = post_slug;
$$;

create or replace function increment_daily_report_view(report_date text)
returns void language sql security definer as $$
  update daily_reports set view_count = view_count + 1 where date = report_date::date;
$$;

create or replace function increment_weekly_report_view(report_date text)
returns void language sql security definer as $$
  update weekly_reports set view_count = view_count + 1 where date = report_date::date;
$$;
```

`security definer`로 anon 유저도 호출 가능.

---

## 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `src/pages/post/[slug].astro` | RPC `increment_post_view` 호출 스크립트 추가 |
| `src/pages/report/[date].astro` | RPC `increment_daily_report_view` 호출 스크립트 추가 |
| `src/pages/weekly/[date].astro` | RPC `increment_weekly_report_view` 호출 스크립트 추가 |
| `src/pages/admin/posts/index.astro` | view_count 컬럼 추가 |
| `src/pages/admin/reports/index.astro` | view_count 컬럼 추가 |
| `src/pages/admin/weekly/index.astro` | view_count 컬럼 추가 |

---

## 클라이언트 스크립트 패턴

각 상세 페이지에 동일한 패턴 적용 (slug/date는 페이지마다 다름):

```javascript
// fire-and-forget, 실패해도 UX 영향 없음
fetch('/api/...') // 또는 supabase.rpc() 직접 호출
```

Supabase anon key는 `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` 환경 변수로 클라이언트에서 접근 가능.

---

## 어드민 표시

각 어드민 목록 페이지 테이블에 "조회수" 컬럼 추가 (숫자, 우측 정렬). select 쿼리에 `view_count` 필드만 추가하면 됨.
