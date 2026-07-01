/**
 * 코스피·코스닥 전체 종목 목록을 네이버 비공식 API로 받아와
 * public/stocks.json 으로 저장한다. (검색 페이지 인덱스용)
 *
 *   node scripts/fetch-stock-list.mjs
 *
 * 결과 포맷:  [{ n: "삼성전자", c: "005930", m: "KP" }, ...]
 *   n = 종목명 / c = 종목코드 / m = 시장(KP=코스피, KQ=코스닥)
 *
 * ETF·ETN·리츠 등은 제외하고 순수 종목(stockEndType==='stock')만 담는다.
 * 새 상장/상장폐지 반영이 필요할 때 다시 실행하면 된다.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'stocks.json');

async function fetchPage(market, page) {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' },
  });
  if (!r.ok) throw new Error(`${market} p${page} HTTP ${r.status}`);
  return r.json();
}

async function fetchMarket(market, mCode) {
  const first = await fetchPage(market, 1);
  const total = first.totalCount || 0;
  const pageSize = first.pageSize || 100;
  const pages = Math.ceil(total / pageSize);
  let all = first.stocks || [];
  for (let p = 2; p <= pages; p++) {
    const j = await fetchPage(market, p);
    all = all.concat(j.stocks || []);
    await new Promise(res => setTimeout(res, 120)); // 예의상 살짝 딜레이
  }
  return all
    .filter(s => s.stockEndType === 'stock' && s.stockType === 'domestic' && s.itemCode)
    .map(s => ({ n: s.stockName, c: s.itemCode, m: mCode }));
}

const kospi = await fetchMarket('KOSPI', 'KP');
const kosdaq = await fetchMarket('KOSDAQ', 'KQ');

// 코드 기준 중복 제거 (KOSPI 우선)
const byCode = new Map();
for (const s of [...kospi, ...kosdaq]) {
  if (!byCode.has(s.c)) byCode.set(s.c, s);
}
const list = [...byCode.values()].sort((a, b) => a.n.localeCompare(b.n, 'ko'));

writeFileSync(OUT, JSON.stringify(list));
console.log(`코스피 ${kospi.length} + 코스닥 ${kosdaq.length} → 중복제거 후 ${list.length}개 저장`);
console.log(`→ ${OUT}`);
