#!/usr/bin/env node
/**
 * 종목 "최근 2주 방송 흐름" 요약 도구
 *
 * 방송언급 탭 맨 위에 보여줄 흐름 요약(후킹 한 줄 + 짧은 문단)을 만들고 저장한다.
 * 요약 문단은 규칙으로 짜맞추면 딱딱해지므로, Claude가 아래 gather 재료를 읽고
 * 직접 써서 save로 저장하는 방식이다. (추가 API 비용 0원)
 *
 * ── 사용법 ────────────────────────────────────────────────
 * 1) 재료 뽑기 (최근 14일 언급 종목 전체, 또는 특정 종목만)
 *      node scripts/stock-flows.mjs gather
 *      node scripts/stock-flows.mjs gather 삼성전자 SK하이닉스
 *      node scripts/stock-flows.mjs gather --days 14
 *
 * 2) 요약 저장 (Claude가 쓴 JSON을 upsert)
 *      node scripts/stock-flows.mjs save flows.json
 *    flows.json 형식:
 *      [
 *        { "name": "삼성전자", "tone": "good",
 *          "headline": "흐름 좋아요!",
 *          "body": "최근 2주 방송에서 …" }
 *      ]
 *    tone: good(긍정 흐름) | watch(주의) | neutral(중립·혼조)
 *    name: 반드시 KRX 정식명 (등록 전 check-stock-names.mjs로 검증)
 *
 * ⚠️ 저장 전 stock_flows 테이블이 있어야 한다 (supabase/stock_flows.sql 실행).
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

const SENT_LABEL = { pos: '긍정', neu: '중립', warn: '주의' };
const BROADCAST_LABEL = {
  hankyungtv: '한국경제TV', samprotv: '삼프로TV',
  yonhapeconomy: '연합뉴스경제TV', '12simannaayo': '12시에 만나요',
};

// 본문에서 종목이 나온 문장 1~2개 뽑기 (src/lib/stockRanking.ts snippetFor 축약판)
function snippetFor(content, name) {
  if (!content) return '';
  const plain = content.replace(/[*#>`]/g, '');
  const parts = plain.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const hits = parts.filter((p) => p.includes(name));
  const text = hits.slice(0, 2).join(' ');
  return text.length > 240 ? text.slice(0, 240) : text;
}

function isoDaysAgo(n) {
  return new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
}

// 실제 상장 종목 화이트리스트 (테마·키워드 노이즈 제거용)
const REAL_STOCKS = new Set(
  JSON.parse(readFileSync(join(__dirname, '../public/stocks.json'), 'utf8')).map((s) => s.n)
);

// ── gather: 최근 N일 언급 재료 모으기 ───────────────────────
async function gather(names, days) {
  const from = isoDaysAgo(days);
  const to = isoDaysAgo(0);
  const wanted = names.length ? new Set(names) : null;
  // 종목명 지정 없이 전체를 뽑을 땐 실제 상장 종목만 (반도체·코스피 같은 테마 제외)
  const keep = (name) => (wanted ? wanted.has(name) : REAL_STOCKS.has(name));

  const { data: reports } = await supabase
    .from('daily_reports').select('date, stocks, sentiment')
    .eq('published', true).gte('date', from).lte('date', to)
    .order('date', { ascending: false });
  const { data: posts } = await supabase
    .from('posts').select('date, slug, tags, content')
    .gte('date', from).lte('date', to)
    .order('date', { ascending: false });

  // 종목 → 날짜별 { shows, notes, sentiment }
  const map = new Map();
  const ent = (name) => {
    if (!map.has(name)) map.set(name, new Map());
    return map.get(name);
  };
  const dayOf = (name, date) => {
    const d = ent(name);
    if (!d.has(date)) d.set(date, { shows: new Set(), notes: [], sentiment: null });
    return d.get(date);
  };

  for (const r of reports ?? []) {
    for (const s of r.stocks ?? []) {
      if (!s.name || !keep(s.name)) continue;
      const day = dayOf(s.name, r.date);
      for (const sh of s.shows ?? []) day.shows.add(sh);
      for (const n of s.notes ?? []) if (n?.view) day.notes.push({ show: n.show, view: n.view });
    }
    const sent = r.sentiment ?? {};
    for (const [nm, sv] of Object.entries(sent)) {
      if (!sv?.status || !keep(nm)) continue;
      dayOf(nm, r.date).sentiment = sv;
    }
  }
  for (const p of posts ?? []) {
    const tags = Array.isArray(p.tags) ? p.tags
      : typeof p.tags === 'string' ? p.tags.split(',').map((t) => t.trim()) : [];
    const show = BROADCAST_LABEL[String(p.slug ?? '').slice(11)] ?? String(p.slug ?? '');
    for (const tag of tags) {
      if (!keep(tag)) continue;
      const view = snippetFor(p.content ?? '', tag);
      const day = dayOf(tag, p.date);
      day.shows.add(show);
      if (view && !day.notes.some((n) => n.view === view)) day.notes.push({ show, view });
    }
  }

  // 언급일 많은 순으로 정렬해 출력
  const sorted = [...map.entries()].sort((a, b) => b[1].size - a[1].size);
  if (!sorted.length) { console.log(`(${from} ~ ${to}) 언급된 종목이 없어요.`); return; }

  console.log(`\n📻 최근 ${days}일 방송 흐름 재료 (${from} ~ ${to})\n`);
  for (const [name, byDate] of sorted) {
    console.log(`\n━━━ ${name}  (${byDate.size}일 언급) ━━━`);
    const dates = [...byDate.keys()].sort().reverse();
    for (const date of dates) {
      const d = byDate.get(date);
      const s = d.sentiment;
      const sTag = s ? `${SENT_LABEL[s.status] ?? s.status}(강도${s.intensity ?? '?'})${s.reason ? ' — ' + s.reason : ''}` : '감정 없음';
      console.log(`  [${date}] ${sTag}`);
      console.log(`     방송: ${[...d.shows].join(', ') || '-'}`);
      for (const n of d.notes) console.log(`     · ${n.show}: ${n.view}`);
    }
  }
  console.log('\n');
}

// ── save: 요약 JSON upsert ──────────────────────────────────
async function save(file) {
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(rows) ? rows : [rows];
  const valid = ['good', 'watch', 'neutral'];
  const now = new Date().toISOString();
  const payload = [];
  for (const r of list) {
    if (!r.name || !r.headline || !r.body) { console.error(`⚠️  건너뜀(필드 부족): ${JSON.stringify(r)}`); continue; }
    const tone = valid.includes(r.tone) ? r.tone : 'neutral';
    payload.push({ name: r.name, tone, headline: r.headline, body: r.body, updated_at: now });
  }
  if (!payload.length) { console.error('❌ 저장할 항목이 없어요.'); process.exit(1); }
  const { error } = await supabase.from('stock_flows').upsert(payload, { onConflict: 'name' });
  if (error) { console.error('❌ 저장 실패:', error.message); process.exit(1); }
  console.log(`✅ ${payload.length}개 종목 흐름 요약 저장 완료`);
  for (const p of payload) console.log(`   [${p.tone}] ${p.name}: ${p.headline}`);
}

// ── 진입 ────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;
if (cmd === 'gather') {
  let days = 14;
  const di = args.indexOf('--days');
  if (di >= 0) { days = parseInt(args[di + 1], 10) || 14; args.splice(di, 2); }
  await gather(args, days);
} else if (cmd === 'save') {
  if (!args[0]) { console.error('사용법: node scripts/stock-flows.mjs save flows.json'); process.exit(1); }
  await save(args[0]);
} else {
  console.log('사용법:\n  node scripts/stock-flows.mjs gather [종목명...] [--days 14]\n  node scripts/stock-flows.mjs save flows.json');
}
