# 유료 리포트 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/report` 페이지에 교차분석 유료 리포트를 표시하고, 무료 사용자에게는 블러+그라데이션으로 일부만 공개한다.

**Architecture:** Astro content collection으로 리포트 데이터를 관리하고, `/report/index.astro`에서 최신 리포트를 렌더링한다. 구독 여부는 이번 MVP에서 다루지 않으며, 잠금 UI는 순수 CSS로만 처리한다.

**Tech Stack:** Astro 5, TypeScript, Zod, CSS (글로벌 CSS 파일 확장)

---

## 파일 구조

| 작업 | 파일 |
|---|---|
| 생성 | `src/content/reports/2026-05-14.md` — 샘플 리포트 데이터 |
| 수정 | `src/content.config.ts` — reports 컬렉션 스키마 추가 |
| 생성 | `src/pages/report/index.astro` — 리포트 페이지 |
| 수정 | `src/styles/global.css` — 리포트 전용 스타일 추가 |
| 수정 | `src/pages/index.astro` — 피드 상단에 리포트 진입 버튼 추가 |

---

## Task 1: reports 컬렉션 스키마 추가

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/content/reports/2026-05-14.md`

- [ ] **Step 1: reports 컬렉션 스키마를 content.config.ts에 추가**

`src/content.config.ts`를 아래와 같이 수정:

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    show: z.string(),
    hosts: z.array(z.string()),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(true),
  }),
});

const reports = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reports' }),
  schema: z.object({
    date: z.string(),
    headline: z.string(),
    shows: z.array(z.string()),
    stocks: z.array(z.object({
      name: z.string(),
      shows: z.array(z.string()),
    })),
    comparisons: z.array(z.object({
      stock: z.string(),
      points: z.array(z.object({
        show: z.string(),
        view: z.string(),
      })),
      pick: z.string(),
    })),
    sectors: z.array(z.object({
      name: z.string(),
      flow: z.string(),
    })),
    insight: z.string(),
  }),
});

export const collections = { posts, reports };
```

- [ ] **Step 2: 샘플 리포트 파일 생성**

`src/content/reports/2026-05-14.md` 생성:

```markdown
---
date: "2026-05-14"
headline: "반도체가 쉬고, 자동차·바이오가 시장을 받쳤어요."
shows:
  - "삼프로TV"
  - "12시에 만나요"
stocks:
  - name: "삼성전자"
    shows: ["삼프로TV", "12시에 만나요"]
  - name: "SK하이닉스"
    shows: ["삼프로TV", "12시에 만나요"]
  - name: "현대모비스"
    shows: ["삼프로TV"]
  - name: "알테오젠"
    shows: ["12시에 만나요"]
comparisons:
  - stock: "삼성전자"
    points:
      - show: "삼프로TV"
        view: "미국 반도체 조정 영향이 크다고 봤어요."
      - show: "12시에 만나요"
        view: "노사 협상·정책 발언 부담도 함께 봤어요."
    pick: "SK하이닉스도 같이 빠졌기 때문에, 개별 악재보다는 반도체 업종 조정 영향이 더 크게 반영된 흐름이에요."
sectors:
  - name: "반도체"
    flow: "삼성전자와 SK하이닉스가 함께 약세를 보이며 업종 조정 신호가 강했어요."
  - name: "자동차"
    flow: "현대모비스를 중심으로 시장 방어 흐름이 나타났어요."
  - name: "바이오"
    flow: "반도체가 쉬는 구간에서 대안 섹터로 부각됐어요."
insight: "오늘은 지수가 회복됐는지보다, 돈이 어디로 이동했는지가 더 중요해요. 반도체 대형주가 흔들리는 동안 자동차와 바이오가 상대적으로 부각됐어요. 내일은 SK하이닉스의 지지 여부와 현대모비스 중심의 자동차 부품주 확산 여부를 같이 봐야 해요."
---
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공. 타입 에러가 나면 스키마 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/content.config.ts src/content/reports/2026-05-14.md
git commit -m "feat: reports 컬렉션 스키마 및 샘플 데이터 추가"
```

---

## Task 2: 리포트 전용 스타일 추가

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: global.css 하단에 리포트 스타일 추가**

`src/styles/global.css` 파일 맨 끝에 추가:

```css
/* ===== 리포트 페이지 ===== */
.report-wrap {
  max-width: 680px;
  margin: 0 auto;
  padding: 0 0 80px;
}

/* 히어로 */
.report-hero {
  background: linear-gradient(135deg, #191f28 0%, #2d3748 100%);
  padding: 24px 20px 28px;
  color: #fff;
}
.report-hero-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}
.report-hero-headline {
  font-size: 20px;
  font-weight: 900;
  line-height: 1.45;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
}
.report-hero-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.report-hero-badge {
  background: rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
}

/* 섹션 카드 공통 */
.report-section {
  background: var(--card);
  margin: 10px 12px;
  border-radius: 14px;
  padding: 18px;
  border: 1px solid var(--border);
}
.report-section-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 14px;
}

/* 공통 언급 종목 */
.stock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.stock-row:last-of-type { border-bottom: none; }
.stock-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stock-rank {
  font-size: 12px;
  font-weight: 800;
  color: var(--blue);
  width: 20px;
}
.stock-name {
  font-size: 15px;
  font-weight: 700;
}
.stock-shows {
  font-size: 11px;
  color: var(--text-3);
}

/* 블러 잠금 */
.report-blur-wrap {
  position: relative;
  overflow: hidden;
}
.report-blur-content {
  filter: blur(4px);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
.report-blur-fade {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(to bottom, transparent 10%, var(--card) 72%);
}

/* 방송 비교 */
.comparison-stock-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
}
.comparison-point {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 6px;
  line-height: 1.55;
}
.comparison-point-show {
  font-weight: 700;
  color: var(--text-1);
}
.comparison-pick {
  font-size: 13px;
  font-weight: 600;
  color: var(--blue);
  margin-top: 8px;
  line-height: 1.55;
}

/* 섹터 흐름 */
.sector-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.sector-row:last-of-type { border-bottom: none; }
.sector-name {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 3px;
}
.sector-flow {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}

/* 인사이트 */
.report-insight {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.75;
}

/* 잠금 CTA 버튼 */
.report-lock-cta {
  text-align: center;
  margin-top: 12px;
}
.report-lock-btn {
  display: inline-block;
  background: #111;
  color: #fff;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

/* 구독 CTA 하단 */
.report-subscribe-cta {
  background: linear-gradient(135deg, #191f28 0%, #2d3748 100%);
  margin: 10px 12px 0;
  border-radius: 14px;
  padding: 22px 20px;
  text-align: center;
  color: #fff;
}
.report-subscribe-title {
  font-size: 16px;
  font-weight: 900;
  margin-bottom: 6px;
  letter-spacing: -0.02em;
}
.report-subscribe-desc {
  font-size: 12px;
  opacity: 0.65;
  margin-bottom: 16px;
}
.report-subscribe-btn {
  display: block;
  background: var(--blue);
  color: #fff;
  border-radius: 10px;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}
```

- [ ] **Step 2: 개발 서버에서 CSS 에러 없는지 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:4321` 접속 — 기존 피드 화면이 정상 표시되면 OK.

- [ ] **Step 3: 커밋**

```bash
git add src/styles/global.css
git commit -m "feat: 리포트 페이지 CSS 스타일 추가"
```

---

## Task 3: 리포트 페이지 구현

**Files:**
- Create: `src/pages/report/index.astro`

- [ ] **Step 1: 페이지 파일 생성**

`src/pages/report/index.astro` 생성:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';

const allReports = await getCollection('reports');
const report = allReports.sort((a, b) => b.data.date.localeCompare(a.data.date))[0];

const days = ['일', '월', '화', '수', '목', '금', '토'];
function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}
---
<Base title="PICK 리포트" description="오늘 방송 교차분석 리포트">
  {!report ? (
    <div style="text-align:center;padding:80px 24px;color:var(--text-3);">
      <p style="font-size:32px;margin-bottom:12px;">📭</p>
      <p style="font-size:16px;font-weight:700;">아직 리포트가 없어요</p>
    </div>
  ) : (
    <div class="report-wrap">

      <!-- 히어로 -->
      <div class="report-hero">
        <div class="report-hero-label">{formatDate(report.data.date)} · PICK 리포트</div>
        <div class="report-hero-headline">{report.data.headline}</div>
        <div class="report-hero-badges">
          <span class="report-hero-badge">비교한 방송 {report.data.shows.length}개</span>
          <span class="report-hero-badge">공통 종목 {report.data.stocks.length}개</span>
        </div>
      </div>

      <!-- 공통 언급 종목 -->
      <div class="report-section">
        <div class="report-section-label">공통 언급 종목</div>
        {report.data.stocks.slice(0, 2).map((stock, i) => (
          <div class="stock-row">
            <div class="stock-row-left">
              <span class="stock-rank">#{i + 1}</span>
              <span class="stock-name">{stock.name}</span>
            </div>
            <span class="stock-shows">{stock.shows.join(' · ')}</span>
          </div>
        ))}
        {report.data.stocks.length > 2 && (
          <div class="report-blur-wrap">
            <div class="report-blur-content">
              {report.data.stocks.slice(2).map((stock, i) => (
                <div class="stock-row">
                  <div class="stock-row-left">
                    <span class="stock-rank">#{i + 3}</span>
                    <span class="stock-name">{stock.name}</span>
                  </div>
                  <span class="stock-shows">{stock.shows.join(' · ')}</span>
                </div>
              ))}
            </div>
            <div class="report-blur-fade"></div>
          </div>
        )}
        <div class="report-lock-cta">
          <span class="report-lock-btn">🔒 전체 종목 + 해석 보기</span>
        </div>
      </div>

      <!-- 방송 간 의견 차이 -->
      <div class="report-section">
        <div class="report-section-label">방송 간 의견 차이</div>
        {report.data.comparisons.slice(0, 1).map(comp => (
          <div>
            <div class="comparison-stock-title">{comp.stock}</div>
            <div class="comparison-point">
              <span class="comparison-point-show">{comp.points[0].show}:</span>{' '}
              {comp.points[0].view}
            </div>
            <div class="report-blur-wrap">
              <div class="report-blur-content">
                {comp.points.slice(1).map(pt => (
                  <div class="comparison-point">
                    <span class="comparison-point-show">{pt.show}:</span>{' '}{pt.view}
                  </div>
                ))}
                <div class="comparison-pick">PICK: {comp.pick}</div>
                {report.data.comparisons.slice(1).map(c2 => (
                  <div style="margin-top:16px;">
                    <div class="comparison-stock-title">{c2.stock}</div>
                    {c2.points.map(pt => (
                      <div class="comparison-point">
                        <span class="comparison-point-show">{pt.show}:</span>{' '}{pt.view}
                      </div>
                    ))}
                    <div class="comparison-pick">PICK: {c2.pick}</div>
                  </div>
                ))}
                <div style="margin-top:20px;">
                  <div class="report-section-label">섹터 공통 흐름</div>
                  {report.data.sectors.map(sector => (
                    <div class="sector-row">
                      <div class="sector-name">{sector.name}</div>
                      <div class="sector-flow">{sector.flow}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div class="report-blur-fade"></div>
            </div>
          </div>
        ))}
        <div class="report-lock-cta">
          <span class="report-lock-btn">🔒 구독하고 전체 보기</span>
        </div>
      </div>

      <!-- 오늘의 투자 인사이트 -->
      <div class="report-section">
        <div class="report-section-label">오늘의 투자 인사이트</div>
        <div class="report-blur-wrap">
          <div class="report-blur-content report-insight">{report.data.insight}</div>
          <div class="report-blur-fade"></div>
        </div>
        <div class="report-lock-cta">
          <span class="report-lock-btn">🔒 내일 봐야 할 포인트 보기</span>
        </div>
      </div>

      <!-- 구독 CTA -->
      <div class="report-subscribe-cta">
        <div class="report-subscribe-title">PICK 리포트 구독</div>
        <div class="report-subscribe-desc">방송 비교 · 섹터 흐름 · 투자 인사이트</div>
        <a href="#" class="report-subscribe-btn">월 9,900원으로 시작하기</a>
      </div>

    </div>
  )}
</Base>
```

- [ ] **Step 2: 개발 서버에서 페이지 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:4321/report` 접속.

확인 항목:
- 히어로 어두운 배경 + 흰 텍스트 표시
- 공통 종목 상위 2개 표시, 이하 블러 처리
- 방송 비교 첫 줄만 표시, 이하 블러+페이드
- 인사이트 전체 블러
- 구독 CTA 하단 표시

- [ ] **Step 3: 커밋**

```bash
git add src/pages/report/index.astro
git commit -m "feat: 유료 리포트 페이지 구현"
```

---

## Task 4: 메인 피드에 리포트 진입 버튼 추가

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: 피드 헤더 아래에 리포트 진입 배너 추가**

`src/pages/index.astro`의 `<div class="feed-header">` 블록 바로 아래 (`<div class="feed-filters">` 위)에 아래 코드 추가:

```astro
<a href="/report" class="report-entry-banner">
  <div class="report-entry-left">
    <span class="report-entry-badge">PICK 리포트</span>
    <span class="report-entry-desc">오늘 방송 교차분석 · 공통 종목 · 투자 인사이트</span>
  </div>
  <span class="report-entry-arrow">→</span>
</a>
```

- [ ] **Step 2: 배너 스타일을 index.astro의 `<style>` 블록에 추가**

`src/pages/index.astro`의 `<style>` 블록 안에 추가:

```css
  .report-entry-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, #191f28 0%, #2d3748 100%);
    border-radius: 14px;
    padding: 14px 18px;
    margin-bottom: 16px;
    text-decoration: none;
    color: #fff;
    transition: opacity 160ms ease;
  }
  .report-entry-banner:hover { opacity: 0.9; }
  .report-entry-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .report-entry-badge {
    font-size: 12px;
    font-weight: 800;
    color: var(--blue);
    letter-spacing: -0.01em;
  }
  .report-entry-desc {
    font-size: 12px;
    opacity: 0.7;
  }
  .report-entry-arrow {
    font-size: 18px;
    opacity: 0.6;
  }
```

- [ ] **Step 3: 브라우저에서 피드 화면 확인**

`http://localhost:4321` 접속.

확인 항목:
- 피드 헤더 아래 어두운 배너 표시
- 배너 클릭 시 `/report` 이동
- 기존 필터 버튼·카드 정상 동작

- [ ] **Step 4: 빌드 최종 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 완료.

- [ ] **Step 5: 커밋 및 배포**

```bash
git add src/pages/index.astro
git commit -m "feat: 메인 피드에 리포트 진입 배너 추가"
```
