#!/usr/bin/env node
/**
 * 방송별 개별 글(posts) 등록 도구
 *
 * 매번 손으로 insert 스크립트를 짜다 보면 방송명(show) 같은 필드를 빠뜨리는 사고가
 * 반복됐다(2026-07-21, 2026-07-27 두 번 다 show 누락). 이 스크립트는 등록을 한 곳으로
 * 모아, 방송명을 slug에서 자동으로 채우고 빠진 필드가 있으면 아예 등록을 막는다.
 *
 * ── 사용법 ────────────────────────────────────────────────
 * 1) 글 JSON 파일을 만든다 (한 개 객체, 또는 여러 개 배열 둘 다 가능)
 *      node scripts/insert-post.mjs posts.json
 *
 *    posts.json 형식 (배열):
 *      [
 *        {
 *          "slug": "2026-07-27-samprotv",     // 필수. YYYY-MM-DD-방송슬러그
 *          "title": "문장형 제목 …",           // 필수
 *          "content": "## 📊 오늘의 시황 …",   // 필수 (마크다운 본문)
 *          "summary": "짧은 1~2문장 미리보기",  // 필수
 *          "tags": ["삼성전자", "반도체"],      // 선택 (기본 [])
 *          "date": "2026-07-27",              // 선택 (기본 slug 앞 날짜)
 *          "show": "삼프로TV",                 // 선택 (기본 slug로 자동 채움)
 *          "display_order": 1,                // 선택 (기본 1)
 *          "is_premium": false,               // 선택 (기본 false)
 *          "published": true                  // 선택 (기본 true)
 *        }
 *      ]
 *
 * · show를 안 써도 slug 뒷부분으로 자동으로 채워진다. 슬러그가 규칙 밖이면 등록을 멈춘다.
 * · slug가 이미 있으면 덮어쓴다(upsert). 다시 실행해도 중복 글이 안 생긴다.
 * · 등록 뒤 slug·show·display_order를 다시 읽어 눈으로 확인할 수 있게 출력한다.
 *
 * ── 미리보기(등록 안 함) ──────────────────────────────────
 *      node scripts/insert-post.mjs posts.json --dry
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

// 슬러그 뒷부분 → 방송명. show 누락 사고를 막는 핵심 매핑.
const SHOW_BY_SLUG = {
  hankyungtv: '한국경제TV',
  samprotv: '삼프로TV',
  yonhapeconomy: '연합뉴스경제TV',
  '12simannaayo': '12시에 만나요',
};
const VALID_SHOWS = new Set(Object.values(SHOW_BY_SLUG));

// slug에서 날짜(YYYY-MM-DD)와 방송 키를 뽑는다.
function parseSlug(slug) {
  const m = String(slug || '').match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!m) return { date: null, key: null };
  return { date: m[1], key: m[2] };
}

// 한 글을 검증하고 등록용 row로 정규화한다. 문제가 있으면 Error를 던져 등록을 멈춘다.
function normalize(raw, i) {
  const where = `[${i}] slug=${raw?.slug ?? '(없음)'}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: 글 객체가 아니에요.`);

  const { date: slugDate, key } = parseSlug(raw.slug);
  if (!slugDate) throw new Error(`${where}: slug는 'YYYY-MM-DD-방송슬러그' 형식이어야 해요.`);

  // show: 명시값 우선, 없으면 slug로 자동. 둘 다 안 되면 등록 중단.
  let show = raw.show || SHOW_BY_SLUG[key];
  if (!show) {
    throw new Error(
      `${where}: 방송명(show)을 정할 수 없어요. slug 뒷부분 '${key}'가 알 수 없는 방송이에요.\n` +
      `  → 알려진 슬러그: ${Object.keys(SHOW_BY_SLUG).join(', ')}`
    );
  }
  if (!VALID_SHOWS.has(show)) {
    throw new Error(`${where}: show='${show}'는 등록된 방송명이 아니에요. (${[...VALID_SHOWS].join(' / ')})`);
  }

  // 필수 텍스트 필드
  for (const f of ['title', 'content', 'summary']) {
    if (!raw[f] || !String(raw[f]).trim()) throw new Error(`${where}: '${f}'가 비어 있어요. (필수)`);
  }

  return {
    slug: raw.slug,
    title: raw.title,
    content: raw.content,
    summary: raw.summary,
    show,
    date: raw.date || slugDate,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    display_order: Number.isFinite(raw.display_order) ? raw.display_order : 1,
    is_premium: raw.is_premium === true,
    published: raw.published !== false, // 기본 true
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('사용법: node scripts/insert-post.mjs posts.json [--dry]');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ JSON을 읽지 못했어요: ${file}\n   ${e.message}`);
    process.exit(1);
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) {
    console.error('❌ 등록할 글이 없어요.');
    process.exit(1);
  }

  // 먼저 전부 검증 — 하나라도 문제면 아무것도 등록하지 않는다.
  let rows;
  try {
    rows = list.map(normalize);
  } catch (e) {
    console.error(`❌ 검증 실패 — 등록을 멈췄어요.\n   ${e.message}`);
    process.exit(1);
  }

  console.log(`검증 통과 (${rows.length}개):`);
  for (const r of rows) console.log(`  · ${r.slug}  → show=${r.show}, date=${r.date}, order=${r.display_order}`);

  if (dry) {
    console.log('\n(--dry) 실제 등록은 하지 않았어요.');
    return;
  }

  // slug 기준 upsert — 다시 실행해도 중복 글이 안 생긴다.
  const { error } = await supabase.from('posts').upsert(rows, { onConflict: 'slug' });
  if (error) {
    console.error(`❌ 등록 실패: ${error.message}`);
    process.exit(1);
  }

  // 등록 결과를 DB에서 다시 읽어 show가 실제로 채워졌는지 눈으로 확인.
  const slugs = rows.map((r) => r.slug);
  const { data: check } = await supabase
    .from('posts').select('slug,show,date,display_order').in('slug', slugs);
  console.log(`\n✅ 등록 완료 (${rows.length}개). DB 확인:`);
  for (const p of (check || []).sort((a, b) => a.slug.localeCompare(b.slug))) {
    const mark = p.show ? '✅' : '⚠️ show 비어 있음!';
    console.log(`  ${mark} ${p.slug} | show=${p.show} | date=${p.date} | order=${p.display_order}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
