# 내일 시장 예측 (Tomorrow Market Prediction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방송 요약을 AI가 분석해 내일 코스피·코스닥 상승/하락을 예측하고, 실제 지수 종가와 대조해 누적 적중률을 쌓아 피드 맨 위 하이브리드 카드로 보여준다.

**Architecture:** 기존 `market-flow.mjs`와 동일한 `gather → (Claude 작성) → save` 패턴에 `score`(채점) 단계를 더한 Node 스크립트 + `market_predictions` Supabase 테이블 + `index.astro` 인라인 카드. 채점은 네이버 지수 API(당일)와 야후 일봉(과거)로 실제 종가를 읽어 자동으로 한다.

**Tech Stack:** Astro v6, Supabase(JS, 서비스롤 키), Node ESM 스크립트, 네이버 지수 API, 야후 파이낸스 차트 API. **이 프로젝트엔 유닛 테스트 프레임워크가 없다** — 검증은 기존 기능들과 동일하게 스크립트 실행·DB 조회·프리뷰 스크린샷으로 한다.

**설계 문서:** `docs/superpowers/specs/2026-07-07-tomorrow-market-prediction-design.md`

---

## 파일 구조

| 파일 | 책임 |
|------|------|
| `supabase/market_predictions.sql` (생성) | 예측·채점 결과 테이블 정의 |
| `scripts/market-prediction.mjs` (생성) | gather(재료)·save(예측 저장)·score(채점) |
| `src/pages/index.astro` (수정) | 예측 조회·승률 계산·하이브리드 카드 렌더 |
| `CLAUDE.md` (수정) | 일일 워크플로우에 채점+예측 단계 문서화 |

참고 재사용: 네이버 지수 API(`m.stock.naver.com/api/index/{KOSPI|KOSDAQ}/basic`), 야후 차트(`query1.finance.yahoo.com`, 심볼 `^KS11`/`^KQ11`) — `src/lib/yahooFinance.ts`와 같은 파싱 방식.

---

## Task 1: `market_predictions` 테이블 생성

**Files:**
- Create: `supabase/market_predictions.sql`

- [ ] **Step 1: SQL 파일 작성**

`supabase/market_predictions.sql`:

```sql
-- 내일 시장 예측 + 채점 결과 테이블
-- 방송 분석으로 내일 코스피·코스닥 방향을 예측하고, 실제 종가와 대조해 적중 여부를 쌓는다.
-- 피드 맨 위 "내일 시장 예측" 카드가 이 표를 읽는다.
-- Supabase SQL Editor에 붙여넣어 실행. RLS 없이(공개 콘텐츠, anon 읽기) — market_flow와 동일.
-- 표 생성 시 "Run without RLS" 선택.

create table if not exists public.market_predictions (
  target_date   date primary key,   -- 예측 대상 거래일(내일)
  base_date     date,               -- 분석한 방송일(오늘)
  kospi_dir     text,               -- up | down (코스피 예측 방향)
  kosdaq_dir    text,               -- up | down (코스닥 예측 방향)
  reason        text,               -- 예측 근거 한 줄
  kospi_close   numeric,            -- 채점 후 실제 종가
  kospi_change  numeric,            -- 전일 대비 등락(부호로 상승/하락 판정)
  kosdaq_close  numeric,
  kosdaq_change numeric,
  kospi_hit     boolean,            -- 적중 여부
  kosdaq_hit    boolean,
  scored_at     timestamptz,        -- 채점 시각(NULL이면 미채점)
  created_at    timestamptz default now()
);
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/market_predictions.sql
git commit -m "feat: 내일 시장 예측 테이블 SQL 추가"
```

- [ ] **Step 3: Ted가 Supabase에서 실행 (수동)**

Ted에게 Supabase → SQL Editor에 이 파일 내용을 붙여넣고 **"Run without RLS"** 로 실행해 달라고 요청한다. (스크립트엔 DDL 권한이 없음 — `market_flow` 때와 동일.)

- [ ] **Step 4: 테이블 생성 확인**

Run:
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const fs=await import('fs');const e={};for(const l of fs.readFileSync('.env','utf8').split('\n')){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);if(m)e[m[1]]=m[2].replace(/^[\"']|[\"']$/g,'')}const s=createClient(e.SUPABASE_URL||e.PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);const{error}=await s.from('market_predictions').select('target_date').limit(1);console.log(error?('❌ '+error.message):'✅ 테이블 준비됨')})"
```
Expected: `✅ 테이블 준비됨`

---

## Task 2: `market-prediction.mjs` 스크립트 (gather·save·score)

**Files:**
- Create: `scripts/market-prediction.mjs`

- [ ] **Step 1: 스크립트 전체 작성**

`scripts/market-prediction.mjs`:

```js
#!/usr/bin/env node
/**
 * 내일 시장 예측 도구
 *
 * 방송 요약을 AI가 분석해 내일 코스피·코스닥 상승/하락을 예측하고,
 * 실제 지수 종가와 대조해 적중률을 쌓는다. market-flow.mjs와 같은
 * gather → (Claude 작성) → save 패턴에 score(채점)를 더했다.
 *
 * ── 사용법 ────────────────────────────────────────────────
 *   node scripts/market-prediction.mjs score            # 미채점 예측 채점(먼저)
 *   node scripts/market-prediction.mjs gather [--days 7] # 예측 재료 뽑기
 *   node scripts/market-prediction.mjs save prediction.json  # 예측 저장
 *
 * prediction.json 형식:
 *   { "base_date":"2026-07-06", "target_date":"2026-07-07",
 *     "kospi_dir":"up", "kosdaq_dir":"down", "reason":"…" }
 *   - target_date 생략 시 base_date의 다음 평일로 자동 계산(공휴일은 명시).
 *   - kospi_dir/kosdaq_dir 는 up|down 만.
 *
 * ⚠️ 저장 전 market_predictions 테이블이 있어야 한다 (supabase/market_predictions.sql).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(__dirname, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env 없으면 process.env 사용 */ }
  return { ...env, ...process.env };
}
const ENV = loadEnv();
const SUPABASE_URL = ENV.SUPABASE_URL || ENV.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ .env 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요해요. (vercel env pull .env)');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function isoDaysAgo(n) { return new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10); }
// 다음 평일 (토·일 스킵). 공휴일은 save 시 target_date 명시로 처리.
function nextWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

const INDEX = {
  kospi: { naver: 'KOSPI', yahoo: '^KS11' },
  kosdaq: { naver: 'KOSDAQ', yahoo: '^KQ11' },
};
const dirOf = (change) => (change >= 0 ? 'up' : 'down');

// 네이버 지수 현재가 (당일 채점·gather 표시용)
async function naverIndex(code) {
  const res = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`naver ${code} HTTP ${res.status}`);
  const d = await res.json();
  return {
    close: parseFloat(String(d.closePrice).replace(/,/g, '')),
    change: parseFloat(String(d.compareToPreviousClosePrice).replace(/,/g, '')),
  };
}

// 야후 지수 일봉에서 특정 날짜 종가 + 전일 대비 (과거 채점용)
async function yahooIndexOnDate(symbol, dateStr) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`yahoo ${symbol} HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const dt = new Date((ts[i] + 9 * 3600) * 1000).toISOString().slice(0, 10); // KST 날짜
    series.push({ date: dt, close: closes[i] });
  }
  const idx = series.findIndex((s) => s.date === dateStr);
  if (idx < 1) return null; // 해당 날짜 없거나 전일 없음
  return { close: series[idx].close, change: series[idx].close - series[idx - 1].close };
}

// target_date의 실제 종가·등락: 오늘이면 네이버, 과거면 야후
async function actualFor(which, targetDate) {
  if (targetDate === kstToday()) return await naverIndex(INDEX[which].naver);
  return await yahooIndexOnDate(INDEX[which].yahoo, targetDate);
}

// ── score: 미채점 예측 채점 ─────────────────────────────────
async function score() {
  const today = kstToday();
  const { data: rows } = await supabase.from('market_predictions')
    .select('*').is('scored_at', null).lte('target_date', today)
    .order('target_date', { ascending: true });
  if (!rows?.length) { console.log('채점할 예측이 없어요.'); return; }
  for (const row of rows) {
    try {
      const k = await actualFor('kospi', row.target_date);
      const q = await actualFor('kosdaq', row.target_date);
      if (!k || !q) { console.log(`[${row.target_date}] 종가 데이터 아직 없어요 — 건너뜀`); continue; }
      const patch = {
        kospi_close: k.close, kospi_change: k.change, kospi_hit: dirOf(k.change) === row.kospi_dir,
        kosdaq_close: q.close, kosdaq_change: q.change, kosdaq_hit: dirOf(q.change) === row.kosdaq_dir,
        scored_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('market_predictions').update(patch).eq('target_date', row.target_date);
      if (error) throw error;
      const f = (n) => (n >= 0 ? '+' : '') + n.toFixed(2);
      console.log(`✅ [${row.target_date}] 코스피 ${patch.kospi_hit ? '적중' : '실패'}(${f(k.change)}) · 코스닥 ${patch.kosdaq_hit ? '적중' : '실패'}(${f(q.change)})`);
    } catch (e) { console.error(`[${row.target_date}] 채점 실패:`, e.message); }
  }
}

// ── gather: 예측 재료 뽑기 ──────────────────────────────────
async function gather(days) {
  const from = isoDaysAgo(days), to = isoDaysAgo(0);
  const { data: reports } = await supabase.from('daily_reports')
    .select('date, headline, insight, sectors').eq('published', true)
    .gte('date', from).lte('date', to).order('date', { ascending: false });

  console.log(`\n📊 내일 예측 재료 (${from} ~ ${to})\n`);
  try {
    const k = await naverIndex('KOSPI'), q = await naverIndex('KOSDAQ');
    const f = (n) => (n >= 0 ? '+' : '') + n;
    console.log(`현재 지수: 코스피 ${k.close} (${f(k.change)}) · 코스닥 ${q.close} (${f(q.change)})\n`);
  } catch { console.log('현재 지수 조회 실패\n'); }

  for (const r of reports ?? []) {
    console.log(`━━━ ${r.date} ${r.headline ?? ''} ━━━`);
    const ins = Array.isArray(r.insight) ? r.insight.join('\n  ') : (r.insight ?? '');
    if (ins) console.log(`  🧭 ${ins}`);
    for (const s of r.sectors ?? []) if (s?.name) console.log(`  🔎 [${s.name}] ${s.flow ?? ''}`);
  }

  const { data: unscored } = await supabase.from('market_predictions')
    .select('target_date, kospi_dir, kosdaq_dir').is('scored_at', null).order('target_date');
  if (unscored?.length) console.log('\n미채점 예측:', unscored.map((u) => `${u.target_date}(코${u.kospi_dir}/닥${u.kosdaq_dir})`).join(', '));
  console.log('');
}

// ── save: 예측 저장 ─────────────────────────────────────────
async function save(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!r?.base_date || !r.reason) { console.error('❌ base_date, reason 은 필수예요.'); process.exit(1); }
  const dirs = ['up', 'down'];
  if (!dirs.includes(r.kospi_dir) || !dirs.includes(r.kosdaq_dir)) { console.error('❌ kospi_dir/kosdaq_dir 는 up|down 이어야 해요.'); process.exit(1); }
  const target_date = r.target_date || nextWeekday(r.base_date);
  const payload = {
    target_date, base_date: r.base_date, kospi_dir: r.kospi_dir, kosdaq_dir: r.kosdaq_dir,
    reason: r.reason, created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('market_predictions').upsert(payload, { onConflict: 'target_date' });
  if (error) { console.error('❌ 저장 실패:', error.message); process.exit(1); }
  const label = (d) => (d === 'up' ? '상승' : '하락');
  console.log(`✅ 예측 저장 [${target_date}]  코스피 ${label(r.kospi_dir)} · 코스닥 ${label(r.kosdaq_dir)}`);
  console.log(`   ${r.reason}`);
}

// ── 진입 ────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;
if (cmd === 'gather') {
  let days = 7; const di = args.indexOf('--days'); if (di >= 0) days = parseInt(args[di + 1], 10) || 7;
  await gather(days);
} else if (cmd === 'save') {
  if (!args[0]) { console.error('사용법: node scripts/market-prediction.mjs save prediction.json'); process.exit(1); }
  await save(args[0]);
} else if (cmd === 'score') {
  await score();
} else {
  console.log('사용법:\n  node scripts/market-prediction.mjs score\n  node scripts/market-prediction.mjs gather [--days 7]\n  node scripts/market-prediction.mjs save prediction.json');
}
```

- [ ] **Step 2: gather 실행 확인**

Run: `node scripts/market-prediction.mjs gather`
Expected: `📊 내일 예측 재료 ...` 헤더, `현재 지수: 코스피 … · 코스닥 …` 줄, 최근 방송별 `━━━ 날짜 …` 블록이 출력됨. (에러 없이 종료)

- [ ] **Step 3: score 빈 상태 확인**

Run: `node scripts/market-prediction.mjs score`
Expected: `채점할 예측이 없어요.` (아직 예측 없음)

- [ ] **Step 4: 커밋**

```bash
git add scripts/market-prediction.mjs
git commit -m "feat: 내일 시장 예측 스크립트(gather/save/score) 추가"
```

---

## Task 3: 첫 예측 저장 + 과거 채점 경로 검증

**Files:** (코드 변경 없음 — 스크립트 실행으로 데이터 생성·검증)

- [ ] **Step 1: gather 재료 읽고 예측 작성**

`node scripts/market-prediction.mjs gather` 출력을 읽고, Claude가 요약 작성 기준([[tedpick-summary-criteria]]: 실명 금지·시장 해설로 재구성·종목 권유 금지)에 맞춰 `/tmp/prediction.json` 작성. 예:

```json
{
  "base_date": "2026-07-06",
  "kospi_dir": "up",
  "kosdaq_dir": "down",
  "reason": "반도체가 숨 고르는 사이 실적 좋은 대형주로 온기가 옮겨가고 있어요. 코스피는 강보합, 중소형 중심 코스닥은 눌릴 수 있어요."
}
```
(target_date 생략 → base_date 다음 평일 자동 계산)

- [ ] **Step 2: 저장**

Run: `node scripts/market-prediction.mjs save /tmp/prediction.json`
Expected: `✅ 예측 저장 [2026-07-07]  코스피 상승 · 코스닥 하락` + 이유 줄

- [ ] **Step 3: 과거 채점 경로(야후) 검증 — 임시 과거 예측**

과거 날짜(예: 최근 지난 거래일) 예측을 임시로 넣어 채점이 야후 일봉으로 되는지 확인한다. `/tmp/pred_past.json`:
```json
{ "base_date": "2026-07-01", "target_date": "2026-07-02", "kospi_dir": "up", "kosdaq_dir": "up", "reason": "채점 경로 검증용 임시" }
```
Run:
```bash
node scripts/market-prediction.mjs save /tmp/pred_past.json
node scripts/market-prediction.mjs score
```
Expected: `✅ [2026-07-02] 코스피 적중/실패(±X.XX) · 코스닥 적중/실패(±X.XX)` — 실제 등락 숫자가 채워지면 야후 경로 정상.

- [ ] **Step 4: 임시 과거 예측 삭제**

Run:
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const fs=await import('fs');const e={};for(const l of fs.readFileSync('.env','utf8').split('\n')){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);if(m)e[m[1]]=m[2].replace(/^[\"']|[\"']$/g,'')}const s=createClient(e.SUPABASE_URL||e.PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);const{error}=await s.from('market_predictions').delete().eq('target_date','2026-07-02');console.log(error?error.message:'임시 예측 삭제 완료')})"
```
Expected: `임시 예측 삭제 완료`

(커밋 없음 — 데이터 작업)

---

## Task 4: `index.astro` 예측 조회 + 승률 계산

**Files:**
- Modify: `src/pages/index.astro` (프론트매터, `market_flow` 조회 블록 바로 뒤)

- [ ] **Step 1: 조회·계산 블록 추가**

`const flowSectors ...` 줄(‘시장 흐름’ 조회 끝) 바로 다음, `// 날짜 유틸` 주석 앞에 삽입:

```ts
// 내일 시장 예측 (최신 1건) + 누적 승률 — 피드 맨 위 카드
const { data: predRows } = await Astro.locals.supabase
  .from('market_predictions')
  .select('*')
  .order('target_date', { ascending: false });
const preds: any[] = predRows ?? [];
const latestPred: any = preds[0] ?? null;

// 채점된 예측만 모아 승률·점 계산 (코스피+코스닥 합산)
const scoredPreds = preds.filter((p: any) => p.scored_at);
let predHit = 0, predTotal = 0;
for (const p of scoredPreds) {
  for (const h of [p.kospi_hit, p.kosdaq_hit]) { if (h === true || h === false) { predTotal++; if (h) predHit++; } }
}
const predWinRate: number | null = predTotal ? Math.round((predHit / predTotal) * 100) : null;
// 지수별 최근 8회 점 (오래된→최신 순)
const scoredAsc = [...scoredPreds].reverse();
const kospiDots: boolean[] = scoredAsc.map((p: any) => p.kospi_hit).filter((h: any) => h === true || h === false).slice(-8);
const kosdaqDots: boolean[] = scoredAsc.map((p: any) => p.kosdaq_hit).filter((h: any) => h === true || h === false).slice(-8);
```

- [ ] **Step 2: 문법 확인 (dev 서버 리로드)**

Run: `curl -s "http://localhost:4321/" -o /dev/null -w "%{http_code}\n"` (dev 서버가 없으면 `preview_start`로 `tedpick-dev` 기동 후)
Expected: `200` (프론트매터 에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/pages/index.astro
git commit -m "feat: 내일 예측 조회·승률 계산 프론트매터 추가"
```

---

## Task 5: `index.astro` 하이브리드 카드 마크업 + CSS

**Files:**
- Modify: `src/pages/index.astro` (인트로 `</div>` 뒤, "지금 시장 흐름 카드" 마크업 **앞** — 예측이 위)
- Modify: `src/pages/index.astro` (`<style>` 내 `.feed-sub {…}` 뒤, `.mflow` 앞)

- [ ] **Step 1: 카드 마크업 삽입**

`<!-- ===== 지금 시장 흐름 카드 ... ===== -->` **바로 앞**에 삽입:

```astro
    <!-- ===== 내일 시장 예측 카드 (예측 있고 대상일이 오늘 이후일 때) ===== -->
    {latestPred && latestPred.target_date >= todayKey && (
      <div class="mpred">
        <div class="mpred-top">
          <span class="mpred-eyebrow">✨ AI의 내일 시장 예측</span>
          <span class="mpred-base">{formatDateShort(latestPred.base_date)} 방송 기준</span>
        </div>

        <div class="mpred-tiles">
          <div class="mpred-tile">
            <span class="mpred-wx">{latestPred.kospi_dir === 'up' ? '☀️' : '🌧️'}</span>
            <div>
              <div class="mpred-idx">코스피</div>
              <div class={`mpred-dir mpred-dir--${latestPred.kospi_dir}`}>
                {latestPred.kospi_dir === 'up' ? '상승 예상 ↗' : '하락 예상 ↘'}
              </div>
            </div>
          </div>
          <div class="mpred-tile">
            <span class="mpred-wx">{latestPred.kosdaq_dir === 'up' ? '☀️' : '🌧️'}</span>
            <div>
              <div class="mpred-idx">코스닥</div>
              <div class={`mpred-dir mpred-dir--${latestPred.kosdaq_dir}`}>
                {latestPred.kosdaq_dir === 'up' ? '상승 예상 ↗' : '하락 예상 ↘'}
              </div>
            </div>
          </div>
        </div>

        {latestPred.reason && <p class="mpred-reason">{latestPred.reason}</p>}

        {predWinRate !== null && (
          <div class="mpred-record">
            <div class="mpred-rate-row">
              <div class="mpred-rate-label">지금까지 적중률</div>
              <div class="mpred-gauge"><div class="mpred-gauge-fill" style={`width:${predWinRate}%`}></div></div>
              <div class="mpred-rate-num">{predWinRate}<span>%</span></div>
            </div>
            <div class="mpred-dots-row">
              <span class="mpred-dots-label">코스피</span>
              {kospiDots.map((h: boolean) => <span class={`mpred-dot${h ? ' hit' : ''}`}></span>)}
            </div>
            <div class="mpred-dots-row">
              <span class="mpred-dots-label">코스닥</span>
              {kosdaqDots.map((h: boolean) => <span class={`mpred-dot${h ? ' hit' : ''}`}></span>)}
            </div>
          </div>
        )}

        <div class="mpred-disc">AI가 방송을 분석한 재미 예측이에요. 투자 판단은 스스로 해요.</div>
      </div>
    )}
```

- [ ] **Step 2: CSS 삽입**

`<style>` 안, `.feed-sub { … }` 규칙 **뒤**(‘지금 시장 흐름 카드’ `.mflow` 주석 앞)에 삽입:

```css
  /* ── 내일 시장 예측 카드 ── */
  .mpred {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 16px 14px;
    margin-bottom: 14px;
  }
  .mpred-top {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    margin-bottom: 12px;
  }
  .mpred-eyebrow { font-size: 14px; font-weight: 800; color: var(--text-1); letter-spacing: -0.01em; }
  .mpred-base { font-size: 12px; color: var(--text-3); white-space: nowrap; }

  .mpred-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .mpred-tile {
    display: flex; align-items: center; gap: 12px;
    background: var(--bg, rgba(128,128,128,0.06)); border-radius: 12px; padding: 12px 14px;
  }
  .mpred-wx { font-size: 28px; line-height: 1; }
  .mpred-idx { font-size: 12px; color: var(--text-3); margin-bottom: 2px; }
  .mpred-dir { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
  .mpred-dir--up { color: #e5484d; }
  .mpred-dir--down { color: #3b7dd8; }

  .mpred-reason { font-size: 14px; color: var(--text-2); line-height: 1.6; margin-bottom: 14px; }

  .mpred-record { border-top: 1px solid var(--border); padding-top: 12px; }
  .mpred-rate-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .mpred-rate-label { font-size: 12px; color: var(--text-3); white-space: nowrap; }
  .mpred-gauge { flex: 1; height: 8px; background: rgba(128,128,128,0.15); border-radius: 999px; overflow: hidden; }
  .mpred-gauge-fill { height: 100%; background: #e5484d; }
  .mpred-rate-num { font-size: 20px; font-weight: 800; color: var(--text-1); }
  .mpred-rate-num span { font-size: 12px; color: var(--text-3); font-weight: 700; }

  .mpred-dots-row { display: flex; align-items: center; gap: 5px; margin-top: 6px; }
  .mpred-dots-label { font-size: 12px; color: var(--text-3); width: 42px; }
  .mpred-dot {
    width: 14px; height: 14px; border-radius: 4px;
    background: transparent; border: 1.5px solid rgba(128,128,128,0.35);
  }
  .mpred-dot.hit { background: var(--text-1); border-color: var(--text-1); }

  .mpred-disc { font-size: 11px; color: var(--text-3); margin-top: 12px; }
```

- [ ] **Step 3: 프리뷰로 카드 렌더 확인**

`preview_start`로 `tedpick-dev` 기동(이미 떠 있으면 재사용) → `preview_eval`로 `window.location.reload()` → `preview_screenshot`.
Expected: 피드 맨 위에 "✨ AI의 내일 시장 예측" 카드 — 코스피/코스닥 날씨 타일, 이유, (채점된 예측이 있으면) 적중률 게이지 + 코스피/코스닥 두 줄 점. 그 아래 기존 "지금 시장 흐름" 카드.

- [ ] **Step 4: 콘솔 에러 확인**

`preview_console_logs` (level: error).
Expected: 예측 카드 관련 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/pages/index.astro
git commit -m "feat: 내일 시장 예측 하이브리드 카드 렌더"
```

---

## Task 6: `CLAUDE.md` 워크플로우 문서화

**Files:**
- Modify: `CLAUDE.md` ("시장 흐름 예측" 섹션 뒤)

- [ ] **Step 1: 섹션 추가**

`CLAUDE.md`의 "## 시장 흐름 예측 (메인 피드 맨 위)" 섹션 전체(다음 `---` 까지) **뒤**에 삽입:

```markdown
## 내일 시장 예측 (메인 피드 맨 위, 흐름 카드 위)
방송을 AI가 분석해 내일 코스피·코스닥 상승/하락을 예측하고, 실제 종가와 대조해 누적 적중률을 쌓는다. "지금 시장 흐름"과 별개 카드로, 그 위에 노출.

- **테이블:** `market_predictions` (target_date PK) — `supabase/market_predictions.sql`. RLS 없이 생성.
- **채점 자동화:** 네이버 지수 API(당일)·야후 일봉(과거 백필)로 실제 종가를 읽어 적중 판정. 등락 부호로 상승/하락, `hit = 예측==실제`.
- **승률:** 코스피+코스닥 합산 하나. 카드엔 게이지 + 지수별 최근 8회 점(적중=꽉 찬 점).
- **준법:** 지수·재미 프레이밍, 종목 매수·매도 권유 금지. reason은 요약 작성 기준 준수.

### 갱신 워크플로우 (오늘의 픽 등록할 때마다)
```bash
# 1) 어제 만든 예측 채점 (오늘 장 마감 후)
node scripts/market-prediction.mjs score
# 2) 오늘 방송 재료로 내일 예측 작성 → 저장
node scripts/market-prediction.mjs gather
node scripts/market-prediction.mjs save prediction.json
```
- prediction.json: `{ "base_date":"YYYY-MM-DD", "kospi_dir":"up|down", "kosdaq_dir":"up|down", "reason":"…" }` (target_date 생략 시 다음 평일 자동)
- 공휴일 다음날을 예측할 땐 target_date를 명시(휴장일 판단은 `src/lib/marketHoliday.ts`).
```

- [ ] **Step 2: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: 내일 시장 예측 워크플로우 CLAUDE.md 추가"
```

---

## Task 7: 배포

- [ ] **Step 1: 푸시**

Run: `git push origin main`
Expected: main 갱신 성공.

- [ ] **Step 2: 프로덕션 배포**

Run: `vercel --prod`
Expected: `Deployment ... ready.`

- [ ] **Step 3: 프로덕션 확인**

Run: `curl -s "https://tedpick.vercel.app/" | grep -o "AI의 내일 시장 예측" | head -1`
Expected: `AI의 내일 시장 예측` (카드가 프로덕션에 노출)

---

## 메모리 갱신 (배포 후)

`feature-market-flow`와 나란히 `feature-market-prediction` 메모리 파일 생성 + `MEMORY.md` 인덱스 한 줄 추가. (테이블·스크립트·워크플로우·승률 방식 요약, `[[feature-market-flow]]` 링크.)
