/**
 * Yahoo Finance 주가 조회
 * - IP 제한 없음, 인증 불필요
 * - 15분 지연 데이터
 * - 한국 종목: 종목코드 + ".KS" (코스피) 또는 ".KQ" (코스닥)
 */

export interface StockPrice {
  code: string;
  todayPct: number;   // 오늘 등락률
  d5Pct: number;      // 5거래일 수익률
  m1Pct: number;      // 1개월 수익률
}

// 시장이 확인 안 된 코드의 폴백용 코스닥 목록 (보통은 resolveStockCode가 시장을 넘겨줌)
const KOSDAQ_CODES = new Set([
  '277810', // 레인보우로보틱스
  '108490', // 로보티즈
  '090360', // 로보스타
  '058610', // 에스피지
  '039030', // 이오테크닉스
  '058470', // 리노공업
  '357780', // 솔브레인
  '240810', // 원익IPS
  '036930', // 주성엔지니어링
  '247540', // 에코프로비엠
  '086520', // 에코프로
  '066970', // 엘앤에프
  '067310', // 하나마이크론
  '128940', // 한미약품
  '009420', // 한올바이오파마
  '126640', // 화신정공
]);

function toYahooSymbol(code: string, market?: 'KOSPI' | 'KOSDAQ'): string {
  // 시장 정보가 있으면 그대로 사용, 없을 때만 폴백 목록으로 추정
  if (market === 'KOSDAQ') return code + '.KQ';
  if (market === 'KOSPI') return code + '.KS';
  return code + (KOSDAQ_CODES.has(code) ? '.KQ' : '.KS');
}

async function fetchQuote(symbol: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2mo`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function calcPct(current: number, base: number): number {
  if (!base || base === 0) return 0;
  return Math.round(((current - base) / base) * 1000) / 10;
}

export async function fetchStockPrice(code: string, market?: 'KOSPI' | 'KOSDAQ'): Promise<StockPrice | null> {
  try {
    const symbol = toYahooSymbol(code, market);
    const data = await fetchQuote(symbol);

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];

    if (closes.length < 2) return null;

    // 유효한 종가만 (null 제거)
    const validCloses = closes.filter((v: number | null) => v !== null && v !== undefined);
    if (validCloses.length < 2) return null;

    const cur = validCloses[validCloses.length - 1];
    const prev = validCloses[validCloses.length - 2];
    const d5Base = validCloses[Math.max(0, validCloses.length - 6)]; // 5거래일 전
    const m1Base = validCloses[Math.max(0, validCloses.length - 23)]; // 1개월 전

    const todayPct = calcPct(cur, prev);
    const d5Pct = calcPct(cur, d5Base);
    const m1Pct = calcPct(cur, m1Base);

    return { code, todayPct, d5Pct, m1Pct };
  } catch (e: any) {
    console.warn(`[yahoo] ${code} 조회 실패:`, e?.message ?? e);
    return null;
  }
}

export async function fetchStockPrices(
  items: { code: string; market?: 'KOSPI' | 'KOSDAQ' }[]
): Promise<Map<string, StockPrice>> {
  const result = new Map<string, StockPrice>();
  const BATCH = 5;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(it => fetchStockPrice(it.code, it.market)));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) result.set(batch[j].code, results[j]!);
    }
  }

  return result;
}
