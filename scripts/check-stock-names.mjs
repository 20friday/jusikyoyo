#!/usr/bin/env node
/**
 * 종목명 검증기 — 글/오늘의픽 등록 전에 반드시 돌린다.
 *
 * 방송 자막은 종목을 약칭·영문(APR, 하닉스, KAI…)으로 부르는 경우가 많은데,
 * 랭킹·검색·종목상세는 KRX 정식 종목명(public/stocks.json)으로만 매칭한다.
 * 정식명이 아니면 isRealStock=false로 "조용히" 랭킹에서 누락되므로,
 * 등록 전에 이 스크립트로 걸러 정식명으로 바꿔 써야 한다.
 *
 * 사용법:
 *   node scripts/check-stock-names.mjs "삼성전자, 에이피알, APR, 하닉스"
 *   node scripts/check-stock-names.mjs --file names.txt   (줄바꿈/쉼표 구분)
 *
 * 출력:
 *   ✅ 삼성전자            정식명
 *   ↪︎ APR → 에이피알      별칭(자동 교정 대상)
 *   ❌ 하닉스              마스터에 없음  (후보: SK하이닉스 …)
 *
 * 종료코드: 정식명이 아닌 항목(❌ 또는 ↪︎)이 하나라도 있으면 1.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stocks = JSON.parse(readFileSync(join(__dirname, '../public/stocks.json'), 'utf8'));
const OFFICIAL = new Set(stocks.map((s) => s.n));

// 약칭/영문/구(舊)명 → KRX 정식명. 방송에서 자주 나오는 별칭을 여기에 모은다.
// (src/lib/stockCodes.ts 의 RENAMED_STOCKS 와 같은 목적 — 둘 다 최신으로 유지)
const ALIASES = {
  'APR': '에이피알',
  '에이피알뷰티': '에이피알',
  'LS일렉트릭': 'LS ELECTRIC',
  '하닉스': 'SK하이닉스',
  'SK하닉스': 'SK하이닉스',
  '삼전': '삼성전자',
  'KAI': '한국항공우주',
  '한화에어로': '한화에어로스페이스',
  'LIG넥스원': 'LIG디펜스앤에어로스페이스',
  'SM': '에스엠',
  'JYP': 'JYP Ent.',
  '네이버': 'NAVER',
};

function suggest(name) {
  const cands = stocks
    .filter((s) => s.n.includes(name) || name.includes(s.n))
    .map((s) => s.n)
    .slice(0, 5);
  return cands;
}

function normalizeList(raw) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const args = process.argv.slice(2);
let input = '';
if (args[0] === '--file') input = readFileSync(args[1], 'utf8');
else input = args.join(' ');

const names = [...new Set(normalizeList(input))];
if (names.length === 0) {
  console.error('사용법: node scripts/check-stock-names.mjs "삼성전자, 에이피알, ..."');
  process.exit(2);
}

let bad = 0;
for (const name of names) {
  if (OFFICIAL.has(name)) {
    console.log(`✅ ${name}`);
  } else if (ALIASES[name]) {
    bad++;
    console.log(`↪︎  ${name} → ${ALIASES[name]}  (정식명으로 바꿔 등록)`);
  } else {
    bad++;
    const sg = suggest(name);
    console.log(`❌ ${name}  마스터에 없음${sg.length ? `  (후보: ${sg.join(', ')})` : ''}`);
  }
}

console.log(`\n${names.length}개 중 정식명 아님: ${bad}개`);
process.exit(bad ? 1 : 0);
