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
