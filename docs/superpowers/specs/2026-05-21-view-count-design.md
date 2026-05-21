# 조회수 기능 설계

**날짜:** 2026-05-21  
**상태:** 승인됨

---

## 개요

각 피드 포스트의 조회수를 집계하고 어드민 글 관리 페이지에서 확인할 수 있게 한다.

---

## 접근 방식

- `posts` 테이블에 `view_count` 컬럼 추가
- Supabase RPC 함수로 원자적 increment
- 포스트 상세 페이지 로드 시 클라이언트에서 RPC 호출
- 어드민 글 관리 페이지 테이블에 조회수 컬럼 표시
- 중복 제거 없음 — 페이지 로드마다 카운트

---

## Supabase 변경

### 컬럼 추가

```sql
alter table posts add column view_count integer not null default 0;
```

### RPC 함수

```sql
create or replace function increment_post_view(post_slug text)
returns void
language sql
security definer
as $$
  update posts set view_count = view_count + 1 where slug = post_slug;
$$;
```

`security definer`로 anon 유저도 호출 가능.

---

## 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `src/pages/post/[slug].astro` | 페이지 로드 시 RPC 호출 클라이언트 스크립트 추가 |
| `src/pages/admin/posts/index.astro` | select에 view_count 추가, 테이블에 조회수 컬럼 표시 |

---

## 포스트 상세 페이지

`/post/[slug].astro` 클라이언트 스크립트에서 페이지 로드 직후 RPC 호출:

```javascript
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
supabase.rpc('increment_post_view', { post_slug: slug });
```

- 응답을 기다리지 않음 (fire-and-forget)
- 실패해도 사용자 경험에 영향 없음

---

## 어드민 글 관리 페이지

`/admin/posts/index.astro`에서:
- select 쿼리에 `view_count` 추가
- 테이블에 "조회수" 컬럼 추가 (숫자, 우측 정렬)
