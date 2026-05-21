# 조회수 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드 포스트·오늘의 픽·주간 픽 각 상세 페이지 로드 시 조회수를 1씩 증가시키고, 어드민 목록 페이지에서 조회수를 확인할 수 있게 한다.

**Architecture:** 각 테이블(`posts`, `daily_reports`, `weekly_reports`)에 `view_count` 컬럼을 추가하고 Supabase RPC 함수로 원자적 increment. 상세 페이지에서 `define:vars`로 식별자를 클라이언트에 전달한 뒤 Supabase REST API를 fetch로 직접 호출(fire-and-forget). 어드민 목록 페이지는 select 쿼리에 `view_count` 추가 후 컬럼 표시.

**Tech Stack:** Astro (SSR), Supabase (PostgreSQL + RPC), fetch API

---

## 파일 구조

| 파일 | 변경 내용 |
|---|---|
| Supabase SQL | `view_count` 컬럼 3개 + RPC 함수 3개 추가 |
| `src/pages/post/[slug].astro` | 조회수 증가 스크립트 추가 |
| `src/pages/report/[date].astro` | 조회수 증가 스크립트 추가 |
| `src/pages/weekly/[date].astro` | 조회수 증가 스크립트 추가 |
| `src/pages/admin/posts/index.astro` | select + 테이블에 조회수 컬럼 |
| `src/pages/admin/reports/index.astro` | select + 테이블에 조회수 컬럼 |
| `src/pages/admin/weekly/index.astro` | select + 테이블에 조회수 컬럼 |

---

### Task 1: Supabase DB 변경

**Files:**
- 없음 (Supabase 대시보드 SQL Editor에서 실행)

- [ ] **Step 1: SQL 실행**

Supabase 대시보드 → SQL Editor에서 아래 SQL을 실행한다.

```sql
-- 컬럼 추가
alter table posts add column view_count integer not null default 0;
alter table daily_reports add column view_count integer not null default 0;
alter table weekly_reports add column view_count integer not null default 0;

-- RPC 함수
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

- [ ] **Step 2: 확인**

Supabase → Table Editor에서 `posts` 테이블에 `view_count` 컬럼이 생겼는지 확인한다.

---

### Task 2: 피드 포스트 조회수 카운트

**Files:**
- Modify: `src/pages/post/[slug].astro`

현재 파일 구조: frontmatter에서 `const { slug } = Astro.params;` 로 slug를 가져온다. 파일 하단에 `<script define:vars={{ stockInfoJson }}>` 블록이 이미 있다.

- [ ] **Step 1: frontmatter에 env 변수 추출**

`src/pages/post/[slug].astro` frontmatter(`---` 안)에서 아래 두 줄을 추가한다. 기존 `const { slug } = Astro.params;` 바로 아래에 넣는다.

```typescript
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
```

- [ ] **Step 2: 조회수 스크립트 추가**

`src/pages/post/[slug].astro` 파일 최하단 `</style>` 태그 다음에 아래 스크립트를 추가한다.

```astro
<script define:vars={{ slug, supabaseUrl, supabaseKey }}>
  fetch(`${supabaseUrl}/rest/v1/rpc/increment_post_view`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_slug: slug }),
  });
</script>
```

- [ ] **Step 3: 개발 서버에서 동작 확인**

```bash
npm run dev
```

브라우저에서 아무 포스트 상세 페이지(`http://localhost:4321/post/2026-05-21-samprotv`)에 접속한 뒤, Supabase 대시보드 → Table Editor → `posts` 테이블에서 해당 slug 행의 `view_count`가 1 증가했는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add src/pages/post/\[slug\].astro
git commit -m "feat: track view count on post detail page"
```

---

### Task 3: 오늘의 픽 조회수 카운트

**Files:**
- Modify: `src/pages/report/[date].astro`

현재 파일 구조: frontmatter에서 `const { date } = Astro.params;` 로 date를 가져온다.

- [ ] **Step 1: frontmatter에 env 변수 추출**

`src/pages/report/[date].astro` frontmatter 안에서 `const { date } = Astro.params;` 바로 아래에 추가한다.

```typescript
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
```

- [ ] **Step 2: 조회수 스크립트 추가**

`src/pages/report/[date].astro` 파일 최하단에 추가한다.

```astro
<script define:vars={{ date, supabaseUrl, supabaseKey }}>
  fetch(`${supabaseUrl}/rest/v1/rpc/increment_daily_report_view`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_date: date }),
  });
</script>
```

- [ ] **Step 3: 동작 확인**

`http://localhost:4321/report/2026-05-21` 접속 후 `daily_reports` 테이블에서 `view_count` 증가 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/pages/report/\[date\].astro
git commit -m "feat: track view count on daily report page"
```

---

### Task 4: 주간 픽 조회수 카운트

**Files:**
- Modify: `src/pages/weekly/[date].astro`

현재 파일 구조: frontmatter에서 `const { date } = Astro.params;` 로 date를 가져온다.

- [ ] **Step 1: frontmatter에 env 변수 추출**

`src/pages/weekly/[date].astro` frontmatter 안에서 `const { date } = Astro.params;` 바로 아래에 추가한다.

```typescript
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
```

- [ ] **Step 2: 조회수 스크립트 추가**

`src/pages/weekly/[date].astro` 파일 최하단에 추가한다.

```astro
<script define:vars={{ date, supabaseUrl, supabaseKey }}>
  fetch(`${supabaseUrl}/rest/v1/rpc/increment_weekly_report_view`, {
    method: 'POST',
    headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_date: date }),
  });
</script>
```

- [ ] **Step 3: 동작 확인**

`http://localhost:4321/weekly/2026-05-15` 접속 후 `weekly_reports` 테이블에서 `view_count` 증가 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/pages/weekly/\[date\].astro
git commit -m "feat: track view count on weekly report page"
```

---

### Task 5: 어드민 피드 글 목록에 조회수 표시

**Files:**
- Modify: `src/pages/admin/posts/index.astro`

현재 select: `'id, title, show, date, published, is_premium, slug'`  
현재 컬럼: 제목 / 방송 / 날짜 / 상태 / (actions) — colspan 5

- [ ] **Step 1: select에 view_count 추가**

```typescript
// 변경 전
.select('id, title, show, date, published, is_premium, slug')

// 변경 후
.select('id, title, show, date, published, is_premium, slug, view_count')
```

- [ ] **Step 2: 테이블 헤더에 조회수 추가**

`<th></th>` (actions 헤더) 바로 앞에 추가한다.

```astro
// 변경 전
          <th>상태</th>
          <th></th>

// 변경 후
          <th>상태</th>
          <th class="th-views">조회수</th>
          <th></th>
```

- [ ] **Step 3: 테이블 바디에 조회수 셀 추가**

actions `<td>` 바로 앞에 추가한다.

```astro
// 변경 전
            <td class="td-actions">

// 변경 후
            <td class="td-views">{p.view_count ?? 0}</td>
            <td class="td-actions">
```

- [ ] **Step 4: colspan 업데이트**

```astro
// 변경 전
<tr><td colspan="5" class="td-empty">게시글이 없어요</td></tr>

// 변경 후
<tr><td colspan="6" class="td-empty">게시글이 없어요</td></tr>
```

- [ ] **Step 5: CSS 추가**

`<style>` 블록 안에 추가한다.

```css
.th-views { text-align: right; }
.td-views { color: #999; font-size: 13px; text-align: right; white-space: nowrap; }
```

- [ ] **Step 6: 브라우저 확인**

`http://localhost:4321/admin/posts` 에서 "조회수" 컬럼이 보이는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add src/pages/admin/posts/index.astro
git commit -m "feat: show view count in admin posts list"
```

---

### Task 6: 어드민 오늘의 픽 목록에 조회수 표시

**Files:**
- Modify: `src/pages/admin/reports/index.astro`

현재 select: `'id, date, headline, published'`  
현재 컬럼: 날짜 / 헤드라인 / 상태 / (actions) — colspan 4

- [ ] **Step 1: select에 view_count 추가**

```typescript
// 변경 전
.select('id, date, headline, published')

// 변경 후
.select('id, date, headline, published, view_count')
```

- [ ] **Step 2: 테이블 헤더에 조회수 추가**

```astro
// 변경 전
          <th>상태</th>
          <th></th>

// 변경 후
          <th>상태</th>
          <th class="th-views">조회수</th>
          <th></th>
```

- [ ] **Step 3: 테이블 바디에 조회수 셀 추가**

```astro
// 변경 전
            <td class="td-actions">
              <a href={`/report/${r.date}`}

// 변경 후
            <td class="td-views">{r.view_count ?? 0}</td>
            <td class="td-actions">
              <a href={`/report/${r.date}`}
```

- [ ] **Step 4: colspan 업데이트**

```astro
// 변경 전
<tr><td colspan="4" class="td-empty">리포트가 없어요</td></tr>

// 변경 후
<tr><td colspan="5" class="td-empty">리포트가 없어요</td></tr>
```

- [ ] **Step 5: CSS 추가**

`<style>` 블록 안에 추가한다.

```css
.th-views { text-align: right; }
.td-views { color: #999; font-size: 13px; text-align: right; white-space: nowrap; }
```

- [ ] **Step 6: 브라우저 확인**

`http://localhost:4321/admin/reports` 에서 "조회수" 컬럼이 보이는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add src/pages/admin/reports/index.astro
git commit -m "feat: show view count in admin reports list"
```

---

### Task 7: 어드민 주간 픽 목록에 조회수 표시

**Files:**
- Modify: `src/pages/admin/weekly/index.astro`

현재 select: `'id, date, period, headline, published'`  
현재 컬럼: 날짜 / 기간 / 헤드라인 / 상태 / (actions) — colspan 5

- [ ] **Step 1: select에 view_count 추가**

```typescript
// 변경 전
.select('id, date, period, headline, published')

// 변경 후
.select('id, date, period, headline, published, view_count')
```

- [ ] **Step 2: 테이블 헤더에 조회수 추가**

```astro
// 변경 전
          <th>상태</th>
          <th></th>

// 변경 후
          <th>상태</th>
          <th class="th-views">조회수</th>
          <th></th>
```

- [ ] **Step 3: 테이블 바디에 조회수 셀 추가**

```astro
// 변경 전
            <td class="td-actions">
              <a href={`/weekly/${r.date}`}

// 변경 후
            <td class="td-views">{r.view_count ?? 0}</td>
            <td class="td-actions">
              <a href={`/weekly/${r.date}`}
```

- [ ] **Step 4: colspan 업데이트**

```astro
// 변경 전
<tr><td colspan="5" class="td-empty">주간 픽이 없어요</td></tr>

// 변경 후
<tr><td colspan="6" class="td-empty">주간 픽이 없어요</td></tr>
```

- [ ] **Step 5: CSS 추가**

`<style>` 블록 안에 추가한다.

```css
.th-views { text-align: right; }
.td-views { color: #999; font-size: 13px; text-align: right; white-space: nowrap; }
```

- [ ] **Step 6: 브라우저 확인**

`http://localhost:4321/admin/weekly` 에서 "조회수" 컬럼이 보이는지 확인한다.

- [ ] **Step 7: 커밋 및 배포**

```bash
git add src/pages/admin/weekly/index.astro
git commit -m "feat: show view count in admin weekly list"
git push origin main
```
