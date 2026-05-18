# Weekly Report 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/weekly/[date]` 페이지와 `weekly_reports` 컬렉션을 추가해 주간 PICK 리포트를 제공한다.

**Architecture:** `weekly_reports` Astro Content Collection(MD 파일)을 신설하고, 기존 `reports` 패턴을 그대로 따라 `/weekly/index.astro`(최신으로 리다이렉트)와 `/weekly/[date].astro`(상세 페이지)를 만든다. 기존 `report-hero`, `report-section` 등 CSS 클래스를 재사용해 새 CSS를 최소화한다.

**Tech Stack:** Astro v6, TypeScript, Zod (astro:content), 기존 global.css 디자인 토큰

---

## 파일 구조

| 작업 | 경로 |
|------|------|
| 수정 | `src/content.config.ts` |
| 생성 | `src/content/weekly_reports/2026-05-15.md` |
| 생성 | `src/pages/weekly/index.astro` |
| 생성 | `src/pages/weekly/[date].astro` |

---

### Task 1: weekly_reports 컬렉션 스키마 추가

**Files:**
- Modify: `src/content.config.ts`

- [ ] **Step 1: `content.config.ts`에 `weekly_reports` 컬렉션 추가**

`src/content.config.ts`를 아래처럼 수정한다. 기존 `posts`, `reports` 선언 뒤에 추가하고 `collections` export에 포함시킨다.

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
    order: z.number().optional(),
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
      notes: z.array(z.object({
        show: z.string(),
        view: z.string(),
      })).optional(),
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

const weeklyReports = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/weekly_reports' }),
  schema: z.object({
    date: z.string(),
    period: z.string(),
    headline: z.string(),
    insight: z.array(z.string()),
    sectors: z.array(z.object({
      name: z.string(),
      flow: z.string(),
    })),
    stocks: z.array(z.object({
      name: z.string(),
      days: z.number(),
      reason: z.string().optional(),
    })),
    splits: z.array(z.object({
      name: z.string(),
      desc: z.string(),
    })),
    gaps: z.array(z.string()),
    watchlist: z.array(z.object({
      name: z.string(),
      reason: z.string().optional(),
    })),
    checkpoints: z.array(z.string()),
  }),
});

export const collections = { posts, reports, weeklyReports };
```

- [ ] **Step 2: 타입 오류 없는지 확인**

```bash
cd /Users/ted/git/tedpick && npx astro check
```

오류 없이 완료되면 OK. `weekly_reports` 관련 경고가 있을 수 있으나 컬렉션 디렉토리가 아직 없어서 나는 것이면 다음 Task 후 해소된다.

- [ ] **Step 3: 커밋**

```bash
git add src/content.config.ts
git commit -m "feat: weekly_reports 컬렉션 스키마 추가"
```

---

### Task 2: 샘플 주간 리포트 MD 파일 작성

**Files:**
- Create: `src/content/weekly_reports/2026-05-15.md`

- [ ] **Step 1: 디렉토리 생성 및 샘플 파일 작성**

```bash
mkdir -p /Users/ted/git/tedpick/src/content/weekly_reports
```

`src/content/weekly_reports/2026-05-15.md` 파일을 아래 내용으로 생성한다.

```markdown
---
date: "2026-05-15"
period: "2026-05-11 – 05-15"
headline: "반도체 중심 흐름은 유지됐지만, 수급은 로봇·조선·K컬처·증권주로 넓게 퍼졌어요."

insight:
  - "이번 주는 반도체가 쉬어도 시장은 무너지지 않았어요."
  - "코스피 8,000을 찍었지만 반도체 대신 로봇·조선·증권·소비주가 받쳤어요."
  - "아직 뚜렷한 주도 테마가 정해지지 않았다는 신호이기도 해요."

sectors:
  - name: "반도체"
    flow: "계속 중심"
  - name: "로봇"
    flow: "반도체 다음 수급처로 부각"
  - name: "조선"
    flow: "중장기 섹터로 재확인"
  - name: "K컬처"
    flow: "푸드·엔터·게임 중심으로 재등장"
  - name: "증권주"
    flow: "코스피 고점 돌파 기대와 연결"

stocks:
  - name: "삼성전자"
    days: 5
    reason: "파업 리스크와 AI 수혜 기대가 함께 언급"
  - name: "SK하이닉스"
    days: 4
    reason: "AI 메모리 수요 기대가 유지"
  - name: "HD현대중공업"
    days: 3
    reason: "조선 중장기 흐름 재확인"
  - name: "엔비디아"
    days: 3
    reason: "미중 회담 후 H200 기대감 부각"

splits:
  - name: "삼성전자"
    desc: "파업 리스크 vs. AI 수혜"
  - name: "LG에너지솔루션"
    desc: "재고 우려 vs. 수주 기대"
  - name: "현대차"
    desc: "로봇 기대 vs. 단기 부담"

gaps:
  - "반도체는 계속 간다는 의견은 같지만, <strong>삼성전자냐 SK하이닉스냐</strong>는 갈림"
  - "조선은 <strong>중장기 긍정이지만 단기 추격은 부담</strong>"
  - "K컬처는 <strong>다시 볼 만하지만 실적 확인이 필요</strong>"
  - "전력·전선은 <strong>AI 수혜는 맞지만 밸류 부담 존재</strong>"

watchlist:
  - name: "삼성전자"
    reason: "파업 이슈와 AI 수혜 기대가 동시에 남아 있음"
  - name: "HD현대중공업"
    reason: "조선 섹터의 중장기 흐름 확인 필요"
  - name: "미래에셋증권"
    reason: "코스피 고점 돌파 시 수혜 여부 확인"
  - name: "엔비디아"
    reason: "H200 중국 판매 관련 후속 발표 대기"

checkpoints:
  - "삼성전자 파업 이슈 실제 진행 여부"
  - "미중 회담 후속 발표"
  - "반도체 수급이 로봇·조선·K컬처로 이어지는지"
  - "코스피 8,000선 안착 여부"
  - "외국인 매도세 완화 여부"
---
```

- [ ] **Step 2: 타입 검증**

```bash
cd /Users/ted/git/tedpick && npx astro check
```

오류 없이 통과되어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add src/content/weekly_reports/2026-05-15.md
git commit -m "feat: 2026-05-15 주간 리포트 샘플 데이터 추가"
```

---

### Task 3: `/weekly/index.astro` — 최신 리포트로 리다이렉트

**Files:**
- Create: `src/pages/weekly/index.astro`

- [ ] **Step 1: 페이지 파일 작성**

`src/pages/weekly/index.astro`를 아래 내용으로 생성한다. 기존 `src/pages/report/index.astro`와 동일한 패턴.

```astro
---
import { getCollection } from 'astro:content';

const allReports = await getCollection('weeklyReports');
const latest = allReports.sort((a, b) => b.data.date.localeCompare(a.data.date))[0];

if (latest) {
  return Astro.redirect(`/weekly/${latest.data.date}`);
}
---
<div style="text-align:center;padding:80px 24px;color:var(--text-3);">
  <p style="font-size:32px;margin-bottom:12px;">📭</p>
  <p style="font-size:16px;font-weight:700;">아직 주간 리포트가 없어요</p>
</div>
```

- [ ] **Step 2: 개발 서버에서 확인**

```bash
cd /Users/ted/git/tedpick && npm run dev
```

브라우저에서 `http://localhost:4321/weekly` 접속 → `/weekly/2026-05-15`로 리다이렉트되는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/pages/weekly/index.astro
git commit -m "feat: /weekly 최신 주간 리포트 리다이렉트 페이지 추가"
```

---

### Task 4: `/weekly/[date].astro` — 주간 리포트 상세 페이지

**Files:**
- Create: `src/pages/weekly/[date].astro`

- [ ] **Step 1: 페이지 파일 작성**

`src/pages/weekly/[date].astro`를 아래 내용으로 생성한다.

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';

export async function getStaticPaths() {
  const allReports = await getCollection('weeklyReports');
  return allReports.map(r => ({ params: { date: r.data.date } }));
}

const { date } = Astro.params;
const allReports = await getCollection('weeklyReports');
const report = allReports.find(r => r.data.date === date);
---
<Base title="주간 PICK 리포트" description="이번 주 방송 종합 리포트">
  {!report ? (
    <div style="text-align:center;padding:80px 24px;color:var(--text-3);">
      <p style="font-size:32px;margin-bottom:12px;">📭</p>
      <p style="font-size:16px;font-weight:700;">리포트를 찾을 수 없어요</p>
    </div>
  ) : (
    <div class="report-wrap">

      <!-- 1. 주간 한 줄 요약 (히어로) -->
      <div class="report-hero">
        <div class="report-hero-label">
          <span class="report-hero-label-pick">주간 PICK 리포트</span> · {report.data.period}
        </div>
        <div class="report-hero-headline">{report.data.headline}</div>
      </div>

      <!-- 2. 주간 인사이트 -->
      <div class="report-section">
        <div class="report-section-label">주간 인사이트</div>
        <div class="weekly-insight">
          {report.data.insight.map(para => (
            <p class="weekly-insight-para">{para}</p>
          ))}
        </div>
      </div>

      <!-- 3. 이번 주 반복 언급 섹터 -->
      <div class="report-section">
        <div class="report-section-label">이번 주 반복 언급 섹터</div>
        {report.data.sectors.map(sector => (
          <div class="sector-row">
            <div class="sector-name">{sector.name}</div>
            <div class="sector-flow">{sector.flow}</div>
          </div>
        ))}
      </div>

      <!-- 4. 이번 주 공통 언급 종목 -->
      <div class="report-section">
        <div class="report-section-label">이번 주 공통 언급 종목</div>
        {report.data.stocks.map((stock, i) => (
          <div class="stock-row">
            <div class="stock-row-left">
              <span class="stock-rank">#{i + 1}</span>
              <span class="stock-name">{stock.name}</span>
            </div>
            <span class="stock-shows">{stock.days === 5 ? '5일 내내' : `${stock.days}일`}</span>
          </div>
        ))}
      </div>

      <!-- 5. 여러 방송에서 관점이 갈린 종목 -->
      <div class="report-section">
        <div class="report-section-label">여러 방송에서 관점이 갈린 종목</div>
        {report.data.splits.map(split => (
          <div class="sector-row">
            <div class="sector-name">{split.name}</div>
            <div class="sector-flow">{split.desc}</div>
          </div>
        ))}
      </div>

      <!-- 6. 이번 주 전문가들이 갈린 지점 -->
      <div class="report-section">
        <div class="report-section-label">이번 주 전문가들이 갈린 지점</div>
        {report.data.gaps.map(gap => (
          <div class="weekly-gap" set:html={gap} />
        ))}
      </div>

      <!-- 7. 다음 주까지 이어서 봐야 할 종목 -->
      <div class="report-section">
        <div class="report-section-label">다음 주까지 이어서 봐야 할 종목</div>
        <div class="weekly-chips">
          {report.data.watchlist.map(item => (
            <span class="weekly-chip">{item.name}</span>
          ))}
        </div>
      </div>

      <!-- 8. 다음 주 체크 포인트 -->
      <div class="report-section">
        <div class="report-section-label">다음 주 체크 포인트</div>
        {report.data.checkpoints.map(point => (
          <div class="weekly-checkpoint">
            <span class="weekly-checkpoint-dot">·</span>
            <span class="weekly-checkpoint-text">{point}</span>
          </div>
        ))}
      </div>

    </div>
  )}
</Base>

<style>
  /* 기존 report-* 클래스 재사용. 아래는 weekly 전용 최소 추가분 */

  .weekly-insight-para {
    font-size: 17px;
    color: var(--text-2);
    line-height: 1.8;
    margin-bottom: 8px;
  }
  .weekly-insight-para:last-child { margin-bottom: 0; }

  .weekly-gap {
    font-size: 17px;
    color: var(--text-2);
    line-height: 1.75;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .weekly-gap:last-child { border-bottom: none; padding-bottom: 0; }
  .weekly-gap strong { color: var(--text-1); font-weight: 700; }

  .weekly-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .weekly-chip {
    background: #fff3ea;
    border: 1.5px solid var(--blue);
    border-radius: 20px;
    padding: 7px 16px;
    font-size: 15px;
    font-weight: 700;
    color: var(--blue);
  }

  .weekly-checkpoint {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .weekly-checkpoint:last-child { border-bottom: none; padding-bottom: 0; }
  .weekly-checkpoint-dot {
    color: var(--blue);
    font-weight: 700;
    flex-shrink: 0;
    line-height: 1.75;
  }
  .weekly-checkpoint-text {
    font-size: 17px;
    color: var(--text-2);
    line-height: 1.75;
  }
</style>

<script>
  const hero = document.querySelector('.report-hero') as HTMLElement;
  const hdrInner = document.querySelector('.hdr-inner') as HTMLElement;

  if (hero && hdrInner) {
    const label = document.createElement('span');
    label.className = 'hdr-ctx-label';
    label.textContent = '주간 PICK 리포트';
    hdrInner.appendChild(label);

    const observer = new IntersectionObserver(
      ([entry]) => {
        hdrInner.classList.toggle('is-scrolled', !entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-56px 0px 0px 0px' }
    );
    observer.observe(hero);
  }
</script>
```

- [ ] **Step 2: 개발 서버에서 전체 페이지 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:4321/weekly/2026-05-15` 접속 후 확인:
- 히어로 다크 배경 + 한 줄 요약 표시
- 8개 섹션 순서대로 렌더링
- 다음 주 이어서 봐야 할 종목 → 오렌지 칩 배지
- 다음 주 체크 포인트 → 오렌지 dot bullet
- 전문가들이 갈린 지점 → `<strong>` bold 렌더링 확인
- 스크롤 시 헤더에 "주간 PICK 리포트" 컨텍스트 라벨 표시

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

오류 없이 완료되어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add src/pages/weekly/
git commit -m "feat: 주간 PICK 리포트 페이지 추가 (/weekly/[date])"
```
