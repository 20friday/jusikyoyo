/**
 * DB 기반 종목 랭킹 엔진
 *
 * 점수 계산 방식:
 * - 일간: 오늘 daily_report의 shows 수 (최대 4) × 25점 기본
 *         + posts.tags에서 오늘 등장 횟수 보정
 *         + 이전 날짜 연속 등장 시 hold 보너스
 * - 주간: 최근 5거래일 daily_reports 합산 mentions
 * - 월간: 최근 22거래일 daily_reports 합산 mentions
 */

import { getStockCode } from './stockCodes';
import { fetchStockPrices } from './yahooFinance';

export interface RankedStock {
  rank: number;
  date: string;
  name: string;
  status: 'pos' | 'neu' | 'warn';
  move: { type: 'up' | 'down' | 'same' | 'new' | 're'; n: number };
  score: number;
  todayPct: number;
  hold: string;
  reason: string;
  rankTrail: (number | null)[];
  price: { today: number; d5: number; m1: number };
  statusReason: string;
  latestNotes: Array<{ show: string; view: string }>;
  factorsPos: string[];
  factorsWarn: string[];
  basis: string[];
  shows: string[];
}

// ── 유틸 ─────────────────────────────────────────────────────
function toKST(date: Date) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  return toKST(new Date(Date.now() - n * 86400 * 1000));
}

// 최근 N거래일 날짜 목록 (주말 제외 근사치)
function recentTradingDates(n: number): string[] {
  const dates: string[] = [];
  let d = new Date(Date.now() + 9 * 3600 * 1000);
  while (dates.length < n) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(iso);
    d = new Date(d.getTime() - 86400 * 1000);
  }
  return dates;
}

// ── 랭킹 계산 ────────────────────────────────────────────────
export async function computeRanking(
  supabase: any,
  period: 'day' | 'week' | 'month'
): Promise<RankedStock[]> {

  // 기간별 거래일 수
  const days = period === 'day' ? 1 : period === 'week' ? 5 : 22;
  const tradingDates = recentTradingDates(days + 10).slice(0, days + 5);
  const fromDate = tradingDates[tradingDates.length - 1];
  const toDate = tradingDates[0];

  // ── daily_reports 조회 ──────────────────────────────────────
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('date, stocks')
    .eq('published', true)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false });

  if (!reports || reports.length === 0) return [];

  // ── 종목별 집계 ─────────────────────────────────────────────
  // stockMap: name → { dates: Set, totalShows: number, latestReport }
  const stockMap = new Map<string, {
    dates: Set<string>;
    totalShows: number;
    latestNotes: any[];
    latestShows: string[];
    allDates: string[];  // 등장한 날짜들 (최신 순)
  }>();

  for (const report of reports) {
    for (const stock of (report.stocks ?? [])) {
      if (!stock.name) continue;
      if (!stockMap.has(stock.name)) {
        stockMap.set(stock.name, {
          dates: new Set(),
          totalShows: 0,
          latestNotes: [],
          latestShows: [],
          allDates: [],
        });
      }
      const entry = stockMap.get(stock.name)!;
      entry.dates.add(report.date);
      entry.totalShows += (stock.shows?.length ?? 1);
      entry.allDates.push(report.date);

      // 가장 최신 날짜의 notes/shows만 저장
      if (entry.latestNotes.length === 0) {
        entry.latestNotes = stock.notes ?? [];
        entry.latestShows = stock.shows ?? [];
      }
    }
  }

  if (stockMap.size === 0) return [];

  // ── 점수 계산 ───────────────────────────────────────────────
  interface ScoredStock {
    name: string;
    score: number;
    latestNotes: any[];
    latestShows: string[];
    days: number;  // 등장 날짜 수
  }

  const scored: ScoredStock[] = [];
  for (const [name, entry] of stockMap) {
    // 기본 점수: 총 방송 언급 수 × 20, 최대 80점
    let score = Math.min(entry.totalShows * 20, 80);
    // 지속성 보너스: 등장 날짜 수 × 5 (최대 20점)
    score += Math.min(entry.dates.size * 5, 20);
    // 100점 만점으로 정규화
    score = Math.min(Math.round(score), 100);

    scored.push({
      name,
      score,
      latestNotes: entry.latestNotes,
      latestShows: entry.latestShows,
      days: entry.dates.size,
    });
  }

  // 점수 내림차순 정렬
  scored.sort((a, b) => b.score - a.score);

  // 상위 10개만
  const top10 = scored.slice(0, 10);

  // ── 7일 순위 추적 (rankTrail) — 한 번에 조회 ───────────────────
  const last7 = recentTradingDates(7);
  const last7From = last7[last7.length - 1];

  const { data: last7Reports } = await supabase
    .from('daily_reports')
    .select('date, stocks')
    .eq('published', true)
    .gte('date', last7From)
    .lte('date', last7[0])
    .order('date', { ascending: false });

  const dailyRankings = new Map<string, Map<string, number>>();
  for (const report of last7Reports ?? []) {
    const dayStocks = report.stocks as any[];
    const sorted = [...dayStocks].sort((a, b) =>
      (b.shows?.length ?? 0) - (a.shows?.length ?? 0)
    );
    const rankMap = new Map<string, number>();
    sorted.forEach((s: any, i: number) => rankMap.set(s.name, i + 1));
    dailyRankings.set(report.date, rankMap);
  }

  // ── 주가 데이터 조회 + 뉘앙스 분석 (병렬) ──────────────────────
  const codes = top10.map(s => getStockCode(s.name)).filter(Boolean) as string[];
  // 주가만 서버에서 조회 (뉘앙스는 클라이언트에서 비동기로)
  const priceMap = await fetchStockPrices(codes);
  const sentimentMap = new Map();

  // 이름 → 코드 반대 맵핑
  const nameToCode = new Map<string, string>();
  for (const s of top10) {
    const code = getStockCode(s.name);
    if (code) nameToCode.set(s.name, code);
  }

  // ── 이전 랭킹 (어제 기준) move 계산 ────────────────────────
  const yesterday = last7[1]; // last7[0]이 오늘
  const yesterdayRanks = dailyRankings.get(yesterday ?? '') ?? new Map();

  // ── 최종 결과 조합 ───────────────────────────────────────────
  const results: RankedStock[] = top10.map((s, idx) => {
    const rank = idx + 1;
    const code = nameToCode.get(s.name);
    const prices = code ? priceMap.get(code) : null;

    // move 계산
    const prevRank = yesterdayRanks.get(s.name);
    let move: RankedStock['move'];
    if (!prevRank) {
      // 어제 TOP에 없었는지, 아니면 며칠 전부터 없었는지 확인
      const wasInLast7 = last7.slice(2).some(d =>
        dailyRankings.get(d)?.has(s.name)
      );
      move = wasInLast7
        ? { type: 're', n: 0 }
        : { type: 'new', n: 0 };
    } else {
      const diff = prevRank - rank;
      if (diff > 0) move = { type: 'up', n: diff };
      else if (diff < 0) move = { type: 'down', n: Math.abs(diff) };
      else move = { type: 'same', n: 0 };
    }

    // rankTrail: 최근 7일 순위
    const rankTrail: (number | null)[] = last7.slice().reverse().map(date => {
      const rankMap = dailyRankings.get(date);
      return rankMap?.get(s.name) ?? null;
    });

    // hold: 연속 등장일
    const holdDays = s.days;
    const hold = holdDays === 1
      ? '오늘 진입'
      : `${holdDays}일 연속 TOP`;

    // reason: 최신 방송 코멘트에서 뽑기 (첫 번째 note)
    const firstNote = s.latestNotes[0];
    const reason = firstNote?.view ?? `${s.latestShows.join('·')}에서 주목받았어요.`;

    // basis: 언급 방송 기반 자동 생성
    const showCount = s.latestShows.length;
    const basis: string[] = [
      `${showCount}개 방송에서 언급됐어요`,
      ...s.latestShows.map((show: string) => {
        const note = s.latestNotes.find((n: any) => n.show === show);
        return note ? `${show}: ${note.view.slice(0, 30)}…` : `${show}에서 언급`;
      }),
    ];

    // status: AI 뉘앙스 분석 우선, 없으면 주가 기반 fallback
    const sentiment = sentimentMap.get(s.name);
    let status: 'pos' | 'neu' | 'warn' = sentiment?.status ?? 'neu';
    if (!sentiment && prices) {
      if (prices.todayPct >= 1.5) status = 'pos';
      else if (prices.todayPct <= -1.5) status = 'warn';
    }
    const statusReason = sentiment?.reason ?? '';

    return {
      rank,
      date: reports[0]?.date ?? tradingDates[0],
      name: s.name,
      status,
      move,
      score: s.score,
      todayPct: prices?.todayPct ?? 0,
      hold,
      reason,
      rankTrail,
      price: {
        today: prices?.todayPct ?? 0,
        d5: prices?.d5Pct ?? 0,
        m1: prices?.m1Pct ?? 0,
      },
      statusReason,
      latestNotes: s.latestNotes,
      factorsPos: [],
      factorsWarn: [],
      basis,
      shows: s.latestShows,
    };
  });

  return results;
}
