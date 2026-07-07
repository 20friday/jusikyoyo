#!/usr/bin/env node
/**
 * 시장 전체 "지금 흐름" 예측 도구
 *
 * 메인 피드 맨 위에 보여줄 시장 흐름 카드(한 줄 예측 + 섹터 방향 + 지속/전환 배지)를
 * 만들고 저장한다. 문단은 규칙으로 못 만드니, Claude가 아래 gather 재료(최근 며칠간
 * daily_reports의 시장 요약·섹터 흐름)를 읽고 직접 써서 save로 저장한다. (추가 비용 0원)
 *
 * ── 사용법 ────────────────────────────────────────────────
 * 1) 재료 뽑기 (최근 N거래일 시장 요약 + 섹터 흐름)
 *      node scripts/market-flow.mjs gather            # 기본 7일
 *      node scripts/market-flow.mjs gather --days 10
 *
 * 2) 흐름 예측 저장 (Claude가 쓴 JSON을 upsert)
 *      node scripts/market-flow.mjs save flow.json
 *    flow.json 형식 (하루치 1개):
 *      {
 *        "date": "2026-07-07",
 *        "status": "continue",          // continue(이어짐) | shift(오늘 전환)
 *        "tone": "good",                // good | watch | neutral
 *        "headline": "돈은 내수·방산으로 도는 중이에요",
 *        "body": "이번 주 방송들이 공통으로 짚은 건 …",
 *        "sectors": [
 *          { "name": "내수·유통", "dir": "up",      "label": "자금 유입" },
 *          { "name": "방산",      "dir": "up",      "label": "강세" },
 *          { "name": "반도체",    "dir": "down",    "label": "주춤" },
 *          { "name": "2차전지",   "dir": "neutral", "label": "중립" }
 *        ]
 *      }
 *    · status/tone/dir 값이 잘못되면 안전한 기본값으로 보정돼요.
 *    · streak(며칠째)는 저장할 때 이전 기록을 보고 자동 계산돼요.
 *      shift면 1로 리셋, continue면 직전 흐름 +1.
 *
 * ⚠️ 저장 전 market_flow 테이블이 있어야 한다 (supabase/market_flow.sql 실행).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env 에서 Supabase 접속 정보 읽기 (node는 .env를 자동 로드하지 않음)
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

function isoDaysAgo(n) {
  return new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
}

// ── gather: 최근 N일 시장 요약 + 섹터 흐름 모으기 ───────────
async function gather(days) {
  const from = isoDaysAgo(days);
  const to = isoDaysAgo(0);

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('date, headline, insight, sectors, stocks')
    .eq('published', true).gte('date', from).lte('date', to)
    .order('date', { ascending: false });

  if (!reports?.length) { console.log(`(${from} ~ ${to}) 일일 리포트가 없어요.`); return; }

  // 이미 등록된 시장 흐름(직전 기록)도 같이 보여줘 흐름 연속성 판단을 돕는다
  const { data: prevFlows } = await supabase
    .from('market_flow').select('date, status, streak, tone, headline, sectors')
    .lte('date', to).order('date', { ascending: false }).limit(5);

  console.log(`\n📈 최근 ${days}일 시장 흐름 재료 (${from} ~ ${to})\n`);

  if (prevFlows?.length) {
    console.log('── 지금까지 기록된 시장 흐름 (연속성 판단용) ──');
    for (const f of prevFlows) {
      const secs = (f.sectors ?? []).map((s) => `${s.name}(${s.label ?? s.dir})`).join(', ');
      console.log(`  [${f.date}] ${f.status ?? '?'}·${f.streak ?? 1}일째 · ${f.tone ?? '?'} · "${f.headline ?? ''}"`);
      if (secs) console.log(`     섹터: ${secs}`);
    }
    console.log('');
  }

  for (const r of reports) {
    console.log(`\n━━━ ${r.date}  ${r.headline ?? ''} ━━━`);
    // insight: 문자열 또는 배열(주간) 모두 대응
    const ins = Array.isArray(r.insight) ? r.insight.join('\n     ') : (r.insight ?? '');
    if (ins) console.log(`  🧭 시장 요약: ${ins}`);
    for (const s of r.sectors ?? []) {
      if (!s?.name) continue;
      console.log(`  🔎 [${s.name}] ${s.flow ?? ''}`);
    }
    // 그날 많이 언급된 종목 상위 6개 (방향 감 잡기용)
    const top = (r.stocks ?? [])
      .map((s) => ({ name: s.name, n: (s.shows ?? []).length }))
      .filter((s) => s.name).sort((a, b) => b.n - a.n).slice(0, 6);
    if (top.length) console.log(`  📌 많이 언급: ${top.map((s) => `${s.name}(${s.n})`).join(', ')}`);
  }
  console.log('\n');
}

// ── save: 흐름 예측 JSON upsert (streak 자동 계산) ───────────
async function save(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!r?.date || !r.headline || !r.body) {
    console.error('❌ date, headline, body 는 필수예요.'); process.exit(1);
  }
  const validTone = ['good', 'watch', 'neutral'];
  const validStatus = ['continue', 'shift'];
  const validDir = ['up', 'down', 'neutral'];

  const tone = validTone.includes(r.tone) ? r.tone : 'neutral';
  const status = validStatus.includes(r.status) ? r.status : 'continue';
  const sectors = Array.isArray(r.sectors)
    ? r.sectors.filter((s) => s?.name).map((s) => ({
        name: String(s.name),
        dir: validDir.includes(s.dir) ? s.dir : 'neutral',
        label: String(s.label ?? ''),
      }))
    : [];

  // streak: shift면 1로 리셋, continue면 직전 흐름 +1
  let streak = 1;
  if (status === 'continue') {
    const { data: prev } = await supabase
      .from('market_flow').select('streak')
      .lt('date', r.date).order('date', { ascending: false }).limit(1);
    streak = (prev?.[0]?.streak ?? 0) + 1;
  }

  const payload = {
    date: r.date, status, streak, tone,
    headline: r.headline, body: r.body, sectors,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('market_flow').upsert(payload, { onConflict: 'date' });
  if (error) { console.error('❌ 저장 실패:', error.message); process.exit(1); }
  const badge = status === 'shift' ? '🚩 흐름 전환' : `🔁 같은 흐름 ${streak}일째`;
  console.log(`✅ 시장 흐름 저장 완료 [${r.date}]  (${badge}, ${tone})`);
  console.log(`   "${r.headline}"`);
  console.log(`   섹터: ${sectors.map((s) => `${s.name}·${s.label}`).join(', ') || '-'}`);
}

// ── 진입 ────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;
if (cmd === 'gather') {
  let days = 7;
  const di = args.indexOf('--days');
  if (di >= 0) { days = parseInt(args[di + 1], 10) || 7; }
  await gather(days);
} else if (cmd === 'save') {
  if (!args[0]) { console.error('사용법: node scripts/market-flow.mjs save flow.json'); process.exit(1); }
  await save(args[0]);
} else {
  console.log('사용법:\n  node scripts/market-flow.mjs gather [--days 7]\n  node scripts/market-flow.mjs save flow.json');
}
