/**
 * 종목 상세 정보 (네이버 모바일 비공식 API 기반)
 *
 * 한 종목코드로 아래 3개를 병렬 호출해 화면에 바로 쓸 형태로 가공한다.
 *  - /integration : 목표주가·투자의견·PER/PBR 등 지표·증권사 리포트 목록
 *  - /basic       : 실시간 현재가·등락률
 *  - /finance/summary : 연간 매출·영업이익 추이 (건강 태그 판정용)
 *
 * 비공식 API라 언제든 막힐 수 있다 → 타임아웃 + 실패 시 null 반환(섹션 숨김),
 * 종목코드 단위 메모리 캐시(10분)로 반복 조회를 줄인다.
 *
 * 출처: 목표주가·투자의견은 네이버가 에프앤가이드(FnGuide)에서 받아 제공하는 값이다.
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const BASE = 'https://m.stock.naver.com/api/stock';
const CACHE_TTL = 10 * 60 * 1000; // 10분

export type Tone = 'good' | 'watch' | 'caution';

export interface MetricItem {
  key: string;
  label: string;        // PER
  value: string;        // 15.15배
  explain: string;      // PER이 뭔지 (지표 자체의 정의)
  meaning?: string;     // 이 값이 투자자에게 좋은지/나쁜지 해석
  verdict?: string;     // "낮은 편이에요" 같은 한 줄 평가
  tone?: Tone;          // 평가 색상
}

export interface HealthTag {
  text: string;
  tone: Tone;
}

export interface Research {
  title: string;
  broker: string;
  date: string;         // YYYY.MM.DD
}

export interface TrendPoint { label: string; value: number; }

export interface StockDetail {
  code: string;
  name: string;
  price: {
    current: string;
    change: string;
    changePct: string;
    direction: 'up' | 'down' | 'flat';
    marketStatus: string;
  } | null;
  consensus: {
    targetPrice: string;
    recommMean: number;
    recommLabel: string;
    recommPct: number;        // 0~100, 5점 만점 바 위치
    upsidePct: number | null; // 현재가 대비 목표주가 괴리율
    asOf: string;
  } | null;
  metrics: MetricItem[];
  researches: Research[];
  health: { headline: string; tone: Tone; tags: HealthTag[] } | null;
  finance: { revenue: TrendPoint[]; profit: TrendPoint[] } | null;
}

const cache = new Map<string, { at: number; data: StockDetail | null }>();

async function getJson(path: string, ms = 4000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const numOf = (s: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ── 투자의견(1~5) → 라벨 ───────────────────────────────
function recommLabel(mean: number): string {
  if (mean < 1.5) return '적극 매도';
  if (mean < 2.5) return '매도';
  if (mean < 3.5) return '중립';
  if (mean < 4.5) return '매수';
  return '적극 매수';
}

// ── 배당 주기 판별 (분기/반기/연 1회) ─────────────────
// finance/quarter의 '주당배당금' 행에서 최근 4개 분기 중 배당이 들어온 분기 수로 추정한다.
function dividendFreqSentence(quarter: any): string {
  try {
    const fi = quarter?.financeInfo;
    if (!fi) return '';
    const settledKeys = (fi.trTitleList ?? [])
      .filter((t: any) => t.isConsensus === 'N')
      .map((t: any) => t.key);
    const last4 = settledKeys.slice(-4);
    const row = (fi.rowList ?? []).find((r: any) => r.title === '주당배당금');
    if (!row || !last4.length) return '';
    let count = 0;
    for (const k of last4) {
      const v = numOf(row.columns?.[k]?.value);
      if (v !== null && v > 0) count++;
    }
    if (count >= 4) return '배당은 분기마다 나눠서 줘요. (1년에 4번)';
    if (count === 3) return '배당은 1년에 세 번 나눠서 줘요.';
    if (count === 2) return '배당은 반기마다 나눠서 줘요. (1년에 2번)';
    if (count === 1) return '배당은 1년에 한 번 줘요.';
    return '';
  } catch {
    return '';
  }
}

// ── 지표별 친절 해설 + 한 줄 평가 ─────────────────────
function buildMetrics(ti: Record<string, string>, divFreq = ''): MetricItem[] {
  const out: MetricItem[] = [];
  const per = numOf(ti.per);
  const cnsPer = numOf(ti.cnsPer);
  const pbr = numOf(ti.pbr);
  const div = numOf(ti.dividendYieldRatio);

  if (ti.per && ti.per !== 'N/A') {
    let verdict = '보통 수준이에요', tone: Tone = 'watch', meaning = '';
    if (per !== null) {
      if (per < 0) {
        verdict = '적자라 평가 어려워요'; tone = 'caution';
        meaning = '지금은 회사가 이익을 못 내고 있어서 PER을 따질 수 없어요. 적자에서 흑자로 돌아서는지부터 봐야 해요.';
      } else if (per < 10) {
        verdict = '낮은 편이에요'; tone = 'good';
        meaning = '보통 10배에서 20배 사이를 무난하다고 봐요. 지금은 그보다 낮아서, 버는 돈에 비해 주가가 싼 편이에요. 저렴한 기회일 수도, 시장 기대가 낮다는 신호일 수도 있어요.';
      } else if (per < 20) {
        verdict = '보통 수준이에요'; tone = 'watch';
        meaning = '보통 10배에서 20배 사이를 무난하다고 보는데, 지금이 딱 그 범위예요. 비싸지도 싸지도 않은 평범한 수준이에요.';
      } else if (per < 40) {
        verdict = '다소 높은 편이에요'; tone = 'watch';
        meaning = '보통 10배에서 20배 사이를 무난하다고 봐요. 지금은 그보다 높아요. 시장이 앞으로 더 클 거라 믿고 미리 비싸게 사는 거라, 기대만큼 실적이 따라줘야 해요.';
      } else {
        verdict = '매우 높아요'; tone = 'caution';
        meaning = '보통 10배에서 20배를 무난하다고 보는데, 지금은 훨씬 높아요. 성장 기대가 잔뜩 실린 가격이라, 기대에 못 미치면 크게 떨어질 수 있어요.';
      }
    }
    out.push({
      key: 'per', label: 'PER', value: ti.per,
      explain: 'PER은 주가를 1주당 순이익으로 나눈 값이에요. 쉽게 말하면 지금 주가가 회사가 1년에 버는 돈의 몇 배인지를 보여줘요. 예를 들어 PER이 10배면, 회사가 지금처럼 벌 때 10년이면 주가만큼 번다는 뜻이에요. 숫자가 낮을수록 버는 돈에 비해 주가가 싸요. 단, 적정 수준은 업종마다 달라서 같은 업종끼리 비교하는 게 정확해요.',
      meaning, verdict, tone,
    });
  }

  if (ti.cnsPer && ti.cnsPer !== 'N/A' && cnsPer !== null) {
    // 추정PER < 현재PER 이면 앞으로 이익이 늘어날 전망
    let verdict = '비슷한 수준이에요', tone: Tone = 'watch';
    let meaning = '추정 PER이 지금과 비슷해요. 올해 이익이 지난해와 크게 다르지 않을 거란 전망이에요.';
    if (per !== null && cnsPer < per) {
      verdict = '이익이 늘어날 전망이에요'; tone = 'good';
      meaning = '추정 PER이 지금 PER보다 낮아요. 올해 이익이 늘어난다는 뜻이라 좋은 신호예요. 미래 기준으로 보면 지금 주가가 덜 비싼 셈이에요.';
    } else if (per !== null && cnsPer > per) {
      verdict = '이익이 줄어들 전망이에요'; tone = 'caution';
      meaning = '추정 PER이 지금 PER보다 높아요. 올해 이익이 줄어든다는 뜻이라 조심해야 해요.';
    }
    out.push({
      key: 'cnsPer', label: '추정 PER', value: ti.cnsPer,
      explain: '추정 PER은 올해 예상되는 이익으로 계산한 PER이에요. 지금 PER이 지난 실적 기준이라면, 추정 PER은 올해 예상 기준이에요. 두 값을 비교하면 회사 이익이 앞으로 늘지 줄지 방향을 알 수 있어요. 추정 PER이 더 낮으면 이익이 늘어난다는 뜻이라 좋은 신호예요.',
      meaning, verdict, tone,
    });
  }

  if (ti.pbr && ti.pbr !== 'N/A') {
    let verdict = '보통 수준이에요', tone: Tone = 'watch', meaning = '';
    if (pbr !== null) {
      if (pbr < 1) {
        verdict = '순자산보다 싸게 거래돼요'; tone = 'good';
        meaning = '보통 1배를 기준선으로 봐요. 지금은 1배 아래라, 회사가 가진 재산보다도 주가가 싸요. 저평가일 수도 있지만, 사업 전망이 약하다는 신호일 수도 있어요.';
      } else if (pbr < 2) {
        verdict = '순자산과 비슷한 수준이에요'; tone = 'watch';
        meaning = '보통 1배를 기준선으로 봐요. 지금은 그 근처라, 회사 재산 대비 무난한 수준이에요.';
      } else {
        verdict = '순자산보다 비싸게 평가받아요'; tone = 'watch';
        meaning = '보통 1배를 기준선으로 보는데, 지금은 그보다 높아요. 재산보다 비싸게 평가받는 건데, 브랜드나 기술처럼 눈에 안 보이는 가치를 시장이 쳐주는 거예요. 그만큼 기대가 실린 가격이고요.';
      }
    }
    out.push({
      key: 'pbr', label: 'PBR', value: ti.pbr,
      explain: 'PBR은 주가를 1주당 순자산으로 나눈 값이에요. 순자산은 회사 재산에서 빚을 뺀, 온전히 회사 몫인 재산이에요. PBR이 1배면 주가가 딱 그 재산만큼, 1배보다 낮으면 재산보다도 싸게 거래된다는 뜻이에요.',
      meaning, verdict, tone,
    });
  }

  if (ti.dividendYieldRatio && ti.dividendYieldRatio !== 'N/A') {
    let verdict = '배당이 있어요', tone: Tone = 'good', meaning = '';
    if (div !== null) {
      if (div <= 0) {
        verdict = '배당이 없어요'; tone = 'watch';
        meaning = '배당이 거의 없어요. 들고 있다고 들어오는 돈은 기대하기 어렵고, 주가가 올라야 수익이 나는 종목이에요.';
      } else if (div < 2) {
        verdict = '배당이 있어요'; tone = 'good';
        meaning = '예금 이자보다는 낮지만 약간의 배당이 있어요. 주가 상승에 더해 덤으로 받는 정도예요.';
      } else {
        verdict = '배당 매력이 높은 편이에요'; tone = 'good';
        meaning = '들고만 있어도 매년 이 정도를 현금으로 받아요. 은행 예금 이자와 견줘볼 만하고, 길게 보유할수록 유리해요.';
      }
    }
    // 배당이 있는 경우에만 배당 주기(분기/반기/연)를 덧붙인다.
    if (divFreq && (div === null || div > 0)) meaning += ' ' + divFreq;
    out.push({
      key: 'div', label: '배당수익률', value: ti.dividendYieldRatio,
      explain: '배당수익률은 1년간 받는 배당금을 현재 주가로 나눈 값이에요. 주식을 사두면 회사가 번 돈의 일부를 나눠주기도 하는데(배당), 그게 지금 주가의 몇 퍼센트인지를 보여줘요. 은행 예금 이자율과 비슷한 개념이에요.',
      meaning, verdict, tone,
    });
  }

  return out;
}

// ── 실적 기반 건강 태그 (방송 뉘앙스와 무관, 펀더멘털만) ─────
function buildHealth(
  revenue: TrendPoint[],
  profit: TrendPoint[],
  ti: Record<string, string>,
): { headline: string; tone: Tone; tags: HealthTag[] } | null {
  const tags: HealthTag[] = [];
  let pos = 0, neg = 0;

  // 영업이익 추세 (최근 확정 2개 비교 — 마지막은 추정치라 그 전 값까지 본다)
  if (profit.length >= 2) {
    const last = profit[profit.length - 1].value;
    const prev = profit[profit.length - 2].value;
    if (last < 0) { tags.push({ text: '영업적자 상태예요', tone: 'caution' }); neg += 2; }
    else if (last > prev) { tags.push({ text: '영업이익이 늘고 있어요', tone: 'good' }); pos++; }
    else if (last < prev) { tags.push({ text: '영업이익이 줄고 있어요', tone: 'watch' }); neg++; }
  }

  // 매출 추세
  if (revenue.length >= 2) {
    const last = revenue[revenue.length - 1].value;
    const prev = revenue[revenue.length - 2].value;
    if (last > prev) { tags.push({ text: '매출이 늘고 있어요', tone: 'good' }); pos++; }
    else if (last < prev) { tags.push({ text: '매출이 줄고 있어요', tone: 'watch' }); neg++; }
  }

  // 영업이익률
  if (revenue.length && profit.length) {
    const rev = revenue[revenue.length - 1].value;
    const prof = profit[profit.length - 1].value;
    if (rev > 0 && prof > 0) {
      const margin = (prof / rev) * 100;
      if (margin >= 15) { tags.push({ text: `이익률 ${margin.toFixed(0)}%로 탄탄해요`, tone: 'good' }); pos++; }
    }
  }

  // 배당
  const div = numOf(ti.dividendYieldRatio);
  if (div !== null && div >= 2) { tags.push({ text: '배당을 주는 회사예요', tone: 'good' }); pos++; }

  // 추정이익 방향
  const per = numOf(ti.per);
  const cnsPer = numOf(ti.cnsPer);
  if (per !== null && cnsPer !== null && per > 0 && cnsPer > 0 && cnsPer < per) {
    tags.push({ text: '올해 이익 개선 전망', tone: 'good' }); pos++;
  }

  if (!tags.length) return null;

  let headline = '괜찮은 편이에요', tone: Tone = 'watch';
  if (neg >= 2 && neg > pos) { headline = '주의가 필요해요'; tone = 'caution'; }
  else if (pos >= 2 && neg === 0) { headline = '건강한 회사예요'; tone = 'good'; }
  else if (pos > neg) { headline = '대체로 건강한 편이에요'; tone = 'good'; }
  else if (neg > pos) { headline = '지켜볼 필요가 있어요'; tone = 'watch'; }

  return { headline, tone, tags };
}

function parseTrend(columns: any): TrendPoint[] {
  // columns: [["x", "2023.12.", ...], ["매출액", "1626636", ...], ...]
  if (!Array.isArray(columns) || columns.length < 2) return [];
  const labels = columns[0].slice(1);
  const values = columns[1].slice(1);
  const out: TrendPoint[] = [];
  for (let i = 0; i < labels.length; i++) {
    const v = numOf(String(values[i]));
    if (v !== null) out.push({ label: String(labels[i]).replace(/\.$/, ''), value: v });
  }
  return out;
}

export async function getStockDetail(code: string, name: string): Promise<StockDetail | null> {
  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const [integration, basic, finance, quarter] = await Promise.all([
    getJson(`${code}/integration`),
    getJson(`${code}/basic`),
    getJson(`${code}/finance/summary`),
    getJson(`${code}/finance/quarter`),
  ]);

  // integration이 핵심. 없으면 통째로 실패 처리.
  if (!integration) {
    cache.set(code, { at: Date.now(), data: null });
    return null;
  }

  const ti: Record<string, string> = {};
  for (const item of (integration.totalInfos ?? [])) {
    if (item?.code) ti[item.code] = item.value;
  }

  // 가격
  let price: StockDetail['price'] = null;
  if (basic?.closePrice) {
    const dirCode = basic?.compareToPreviousPrice?.code;
    price = {
      current: basic.closePrice,
      change: basic.compareToPreviousClosePrice ?? '',
      changePct: basic.fluctuationsRatio ?? '',
      direction: dirCode === '2' || dirCode === '1' ? 'up' : dirCode === '4' || dirCode === '5' ? 'down' : 'flat',
      marketStatus: basic.marketStatus === 'OPEN' ? '장중' : '장마감',
    };
  }

  // 컨센서스(목표주가·투자의견)
  let consensus: StockDetail['consensus'] = null;
  const ci = integration.consensusInfo;
  if (ci?.priceTargetMean && ci?.recommMean) {
    const mean = numOf(ci.recommMean) ?? 0;
    const target = numOf(ci.priceTargetMean);
    const cur = price ? numOf(price.current) : numOf(ti.lastClosePrice);
    consensus = {
      targetPrice: ci.priceTargetMean,
      recommMean: mean,
      recommLabel: recommLabel(mean),
      recommPct: Math.max(0, Math.min(100, (mean / 5) * 100)),
      upsidePct: target !== null && cur ? Math.round(((target - cur) / cur) * 100) : null,
      asOf: ci.createDate ?? '',
    };
  }

  // 재무 추이
  let finData: StockDetail['finance'] = null;
  const annual = finance?.chartIncomeStatement?.annual?.columns;
  if (annual) {
    const cols = annual as any[];
    const labels = cols[0]?.slice(1) ?? [];
    const revRow = cols.find((c: any[]) => c[0] === '매출액');
    const profRow = cols.find((c: any[]) => c[0] === '영업이익');
    const toPoints = (row: any[]) =>
      row ? labels.map((l: string, i: number) => ({ label: String(l).replace(/\.$/, ''), value: numOf(String(row[i + 1])) ?? 0 })) : [];
    finData = { revenue: toPoints(revRow), profit: toPoints(profRow) };
  }

  const researches: Research[] = (integration.researches ?? []).slice(0, 5).map((r: any) => ({
    title: r.tit ?? '',
    broker: r.bnm ?? '',
    date: r.wdt ? `${r.wdt.slice(0, 4)}.${r.wdt.slice(4, 6)}.${r.wdt.slice(6, 8)}` : '',
  }));

  const data: StockDetail = {
    code,
    name,
    price,
    consensus,
    metrics: buildMetrics(ti, dividendFreqSentence(quarter)),
    researches,
    health: finData ? buildHealth(finData.revenue, finData.profit, ti) : null,
    finance: finData,
  };

  cache.set(code, { at: Date.now(), data });
  return data;
}
