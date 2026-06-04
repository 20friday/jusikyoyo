/**
 * 키움 REST API 클라이언트
 * - 토큰 발급 (메모리 캐시, 만료 전 자동 갱신)
 * - 현재가·등락률 조회 (ka10001)
 * - 일봉 데이터 조회 → 5일·1개월 수익률 계산 (ka10081)
 */

const BASE = 'https://api.kiwoom.com';

// ── 토큰 캐시 ────────────────────────────────────────────────
let _token: string | null = null;
let _tokenExpires: number = 0; // unix ms

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_token && now < _tokenExpires - 60_000) return _token; // 1분 여유

  const appKey = process.env.KIWOOM_APP_KEY ?? import.meta.env.KIWOOM_APP_KEY;
  const appSecret = process.env.KIWOOM_APP_SECRET ?? import.meta.env.KIWOOM_APP_SECRET;

  if (!appKey || !appSecret) throw new Error('키움 API 키가 설정되지 않았어요.');

  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      secretkey: appSecret,
    }),
  });
  const data = await res.json();
  if (data.return_code !== 0) throw new Error(`키움 토큰 발급 실패: ${data.return_msg}`);

  _token = data.token;
  // expires_dt: "20260605101805" (yyyyMMddHHmmss, KST)
  const e = data.expires_dt as string;
  const expStr = `${e.slice(0,4)}-${e.slice(4,6)}-${e.slice(6,8)}T${e.slice(8,10)}:${e.slice(10,12)}:${e.slice(12,14)}+09:00`;
  _tokenExpires = new Date(expStr).getTime();

  return _token!;
}

// ── 공통 POST 헬퍼 ───────────────────────────────────────────
async function kiwoomPost(path: string, apiId: string, body: Record<string, string>) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'authorization': `Bearer ${token}`,
      'api-id': apiId,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── 주가 결과 타입 ───────────────────────────────────────────
export interface StockPrice {
  code: string;
  todayPct: number;   // 오늘 등락률 (e.g. 2.1, -0.42)
  d5Pct: number;      // 5거래일 수익률
  m1Pct: number;      // 1개월(약 22거래일) 수익률
}

// ── 등락률 파싱 ──────────────────────────────────────────────
function parsePct(s: string): number {
  // "+2.10" or "-0.42" → 2.1 or -0.42
  return parseFloat(s.replace(/[^0-9.\-]/g, '')) * (s.startsWith('-') ? -1 : 1);
}

function calcChangePct(current: number, base: number): number {
  if (base === 0) return 0;
  return Math.round(((current - base) / base) * 1000) / 10;
}

// ── 단일 종목 주가 조회 ──────────────────────────────────────
export async function fetchStockPrice(code: string): Promise<StockPrice | null> {
  try {
    // 일봉 조회 (최근 30일이면 충분)
    const today = new Date(Date.now() + 9 * 3600 * 1000)
      .toISOString().slice(0, 10).replace(/-/g, '');

    const data = await kiwoomPost('/api/dostk/chart', 'ka10081', {
      stk_cd: code,
      base_dt: today,
      upd_stkpc_tp: '1',
    });

    const rows: any[] = data.stk_dt_pole_chart_qry ?? [];
    if (rows.length < 2) return null;

    const todayRow = rows[0];
    const cur = parseInt(todayRow.cur_prc);
    const predPre = parseFloat(todayRow.pred_pre); // 전일 대비 (부호 포함)
    const prevClose = cur - predPre;

    // 오늘 등락률: 전일 대비 / 전일 종가
    const todayPct = prevClose !== 0
      ? Math.round((predPre / prevClose) * 1000) / 10
      : 0;

    // 5거래일 전 (index 5, 없으면 마지막)
    const d5Row = rows[Math.min(5, rows.length - 1)];
    const d5Base = parseInt(d5Row.cur_prc);
    const d5Pct = calcChangePct(cur, d5Base);

    // 1개월(22거래일) 전
    const m1Row = rows[Math.min(22, rows.length - 1)];
    const m1Base = parseInt(m1Row.cur_prc);
    const m1Pct = calcChangePct(cur, m1Base);

    return { code, todayPct, d5Pct, m1Pct };
  } catch (e: any) {
    console.error(`[kiwoom] ${code} 조회 실패:`, e?.message ?? e);
    return null;
  }
}

// ── 여러 종목 병렬 조회 (API 과부하 방지: 3개씩) ─────────────
export async function fetchStockPrices(codes: string[]): Promise<Map<string, StockPrice>> {
  const result = new Map<string, StockPrice>();
  const BATCH = 3;

  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchStockPrice));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) result.set(batch[j], results[j]!);
    }
    if (i + BATCH < codes.length) {
      await new Promise(r => setTimeout(r, 200)); // 200ms 딜레이
    }
  }

  return result;
}
