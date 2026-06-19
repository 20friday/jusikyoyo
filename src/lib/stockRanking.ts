/**
 * DB 기반 종목 랭킹 엔진
 *
 * 점수 계산 방식 (일간 기준):
 * - mentionScore  = 언급 방송 수 × 25 (max 100)
 * - tagScore      = posts.tags 등장 횟수 × 5 (max 20)
 * - continuityScore = 연속 등장일 × 3 (max 15)
 * - nuanceScore   = statusMultiplier × intensity × 4 (-20 ~ +20), 클라이언트에서 반영
 * - rawScore      = mentionScore + tagScore + continuityScore (+ nuanceScore)
 * - displayScore  = clamp(round(rawScore / 155 * 100), 0, 100)
 * 주간/월간: 기간 내 누적 방송 수 기반
 *
 * 7일 순위 변화 차트(rankTrail)도 헤더 순위와 동일한 윈도우 종합 점수로 계산해,
 * 차트 마지막 점 = 헤더 순위가 항상 일치하도록 한다.
 */
import { isExcludedStock } from './excludedStocks';

export interface RankedStock {
  rank: number;
  date: string;
  name: string;
  status: 'pos' | 'neu' | 'warn';
  move: { type: 'up' | 'down' | 'same' | 'new' | 're'; n: number };
  score: number;        // displayScore (0~100)
  rawScore: number;     // 서버 계산 기본 점수 (nuanceScore 제외)
  scoreDivisor: number; // 화면 점수 환산 분모 (일간 155 / 주간·월간 100)
  mentionScore: number;
  tagScore: number;
  continuityScore: number;
  intensity: number;    // 1~5, 대표 감정 강도
  sentimentDate: string | null; // 대표 감정이 나온 날짜
  mentionDate: string | null;   // 가장 최근 등장 날짜
  noSentiment: boolean; // 등장한 어느 날에도 감정 데이터 없음 → "단순 언급"
  todayPct: number;
  hold: string;
  reason: string;
  rankTrail: (number | null)[];
  price: { today: number; d5: number; m1: number };
  statusReason: string | null;
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

  // 기간별 윈도우 크기 (거래일)
  const days = period === 'day' ? 1 : period === 'week' ? 5 : 22;
  const spanCount = days + 5;   // 헤더 순위가 보는 윈도우 (거래일 수)
  const trailLen = 7;           // 7일 순위 변화 차트 길이

  // 트레일 7일 + 각 날짜의 윈도우를 모두 덮는 거래일 목록
  const allTradingDates = recentTradingDates(trailLen + spanCount + 5);
  const today = allTradingDates[0];
  const oldestNeeded = allTradingDates[Math.min(trailLen + spanCount - 1, allTradingDates.length - 1)];

  // ── 데이터 한 번에 조회 ─────────────────────────────────────
  const { data: allReports } = await supabase
    .from('daily_reports')
    .select('date, stocks, sentiment')
    .eq('published', true)
    .gte('date', oldestNeeded)
    .lte('date', today)
    .order('date', { ascending: false });

  if (!allReports || allReports.length === 0) return [];

  const { data: allPosts } = await supabase
    .from('posts')
    .select('tags, date')
    .gte('date', oldestNeeded)
    .lte('date', today);

  interface ScoredStock {
    name: string;
    score: number;
    rawScore: number;      // 기본 점수 (뉘앙스 제외) — 클라이언트로 전달
    sortScore: number;     // 정렬용 점수 (뉘앙스 포함) — 순위·트레일 계산 전용
    scoreDivisor: number;  // 화면 점수 환산 분모 (일간 155 / 주간·월간 100)
    mentionScore: number;
    tagScore: number;
    continuityScore: number;
    intensity: number;     // 대표 감정 강도 (1~5)
    status: string;        // 대표 감정 (pos/neu/warn), 없으면 'neu'
    statusReason: string | null;  // 대표 감정 이유, 없으면 null
    sentimentDate: string | null; // 대표 감정이 나온 날짜
    mentionDate: string | null;   // 가장 최근 등장 날짜 (basis·코멘트 기준)
    noSentiment: boolean;  // 등장한 어느 날에도 감정 데이터 없음
    latestNotes: any[];
    latestShows: string[];
    days: number;
    totalShows: number;    // 기간 내 누적 방송 언급 수 (주간·월간용)
  }

  const STATUS_MULT: Record<string, number> = { pos: 1, neu: 0, warn: -1 };

  // 종목이 등장한 날들의 일간 감정 중 대표 감정을 고른다.
  // day: 가장 최근 (감정이 있는) 날 / week·month: 강도가 가장 센 날 (같으면 최근)
  type DaySent = { date: string; status: string; intensity: number; reason: string };
  function pickSentiment(list: DaySent[]): DaySent | null {
    if (!list.length) return null;            // list는 최신순
    if (period === 'day') return list[0];     // 가장 최근 감정
    let best = list[0];
    for (const d of list) if (d.intensity > best.intensity) best = d; // 동점이면 최신(앞) 유지
    return best;
  }

  // refDate 기준 윈도우의 종목 점수를 계산해 정렬된 목록 반환
  // (헤더 순위와 완전히 동일한 계산식)
  function computeScored(refDate: string): ScoredStock[] {
    const idx = allTradingDates.indexOf(refDate);
    if (idx < 0) return [];
    const windowDates = allTradingDates.slice(idx, idx + spanCount);
    const toD = refDate;
    const fromD = windowDates[windowDates.length - 1];

    const reps = (allReports as any[])
      .filter((r) => r.date >= fromD && r.date <= toD)
      .sort((a, b) => b.date.localeCompare(a.date)); // 최신 순

    const stockMap = new Map<string, {
      dates: Set<string>;
      latestNotes: any[];
      latestShows: string[];
      latestDate: string | null;
      totalShows: number;
      daySentiments: DaySent[];   // 등장한 날들의 일간 감정 (최신순)
    }>();

    for (const report of reps) {
      for (const stock of (report.stocks ?? [])) {
        if (!stock.name) continue;
        if (isExcludedStock(stock.name)) continue; // 해외·비상장·묶음 라벨 제외
        if (!stockMap.has(stock.name)) {
          stockMap.set(stock.name, { dates: new Set(), latestNotes: [], latestShows: [], latestDate: null, totalShows: 0, daySentiments: [] });
        }
        const e = stockMap.get(stock.name)!;
        e.dates.add(report.date);
        e.totalShows += (stock.shows?.length ?? 0); // 기간 내 누적 방송 언급 수
        // 그날 일간 감정 수집 (있으면) — reps가 최신순이라 daySentiments도 최신순
        const sent = report.sentiment?.[stock.name];
        if (sent?.status) {
          e.daySentiments.push({
            date: report.date,
            status: sent.status,
            intensity: Math.min(Math.max(Math.round(Number(sent.intensity) || 1), 1), 5),
            reason: sent.reason ?? '',
          });
        }
        // reps가 최신 순이므로 첫 등장이 가장 최근 데이터
        if (e.latestShows.length === 0 && e.latestNotes.length === 0) {
          e.latestNotes = stock.notes ?? [];
          e.latestShows = stock.shows ?? [];
          e.latestDate = report.date;
        }
      }
    }

    const tagCount = new Map<string, number>();
    for (const post of (allPosts ?? [])) {
      if (!(post.date >= fromD && post.date <= toD)) continue;
      const tags: string[] = Array.isArray(post.tags)
        ? post.tags
        : typeof post.tags === 'string'
          ? post.tags.split(',').map((t: string) => t.trim())
          : [];
      for (const tag of tags) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }

    // 그날 뉘앙스: 윈도우 내 가장 최근 리포트의 sentiment 사용
    // (클라이언트가 data[0].date 기준 sentiment를 쓰는 것과 동일하게 맞춤)
    const sentiment: Record<string, { status?: string; intensity?: number }> =
      reps[0]?.sentiment ?? {};

    const isPeriod = period !== 'day'; // 주간·월간
    const scored: ScoredStock[] = [];
    for (const [name, e] of stockMap) {
      let mentionScore: number, tagScore: number, continuityScore: number;
      let rawScore: number, scoreDivisor: number;
      if (!isPeriod) {
        // ── 일간: 오늘 화제 종목 (기존 공식 유지) ──
        mentionScore = Math.min(e.latestShows.length * 25, 100);
        tagScore = Math.min((tagCount.get(name) ?? 0) * 5, 20);
        continuityScore = Math.min(e.dates.size * 3, 15);
        rawScore = mentionScore + tagScore + continuityScore;
        scoreDivisor = 155;
      } else {
        // ── 주간·월간: 꾸준함 60 + 누적 언급 30 (감정은 아래 ±20) ──
        const consistency = Math.min(e.dates.size / days, 1) * 60;          // 나온 날 수 / 기간 거래일
        const volume = Math.min(e.totalShows / (days * 3), 1) * 30;         // 누적 방송 언급 수
        rawScore = consistency + volume;                                    // 0~90
        scoreDivisor = 100;
        // 필드 매핑 (정렬 보조·전달용)
        mentionScore = Math.round(consistency);
        continuityScore = Math.round(volume);
        tagScore = 0;
      }
      // 대표 감정: 종목이 등장한 날들의 일간 감정에서 선택 (day=최근, week/month=강도 최강)
      const picked = pickSentiment(e.daySentiments);
      const intensity = picked ? picked.intensity : 1;
      const nuanceScore = picked ? (STATUS_MULT[picked.status] ?? 0) * intensity * 4 : 0;
      const sortScore = rawScore + nuanceScore;
      // 화면 점수는 감정까지 반영(sortScore) 후 환산
      const score = Math.max(0, Math.min(100, Math.round((sortScore / scoreDivisor) * 100)));
      scored.push({
        name, score, rawScore, sortScore, scoreDivisor, mentionScore, tagScore, continuityScore, intensity,
        status: picked ? picked.status : 'neu',
        statusReason: picked ? (picked.reason ?? '') : null,
        sentimentDate: picked ? picked.date : null,
        mentionDate: e.latestDate,
        noSentiment: !picked,
        latestNotes: e.latestNotes, latestShows: e.latestShows, days: e.dates.size, totalShows: e.totalShows,
      });
    }

    // 클라이언트 재정렬과 동일한 우선순위로 정렬 (뉘앙스 포함)
    scored.sort((a, b) =>
      b.sortScore - a.sortScore ||
      b.mentionScore - a.mentionScore ||
      b.intensity - a.intensity ||
      b.tagScore - a.tagScore ||
      b.continuityScore - a.continuityScore
    );
    return scored;
  }

  // ── 기준 날짜 = 가장 최근 리포트 날짜 ──────────────────────
  // 달력상 오늘(today)에 아직 리포트가 없으면, 그 날을 기준으로 잡으면
  // 직전 거래일과 데이터가 같아 화살표가 전부 '—'가 된다.
  // 그래서 실제 리포트가 있는 가장 최근 날짜를 '오늘'로 삼아
  // 화면 라벨(= 최신 리포트 날짜)과 화살표 기준을 일치시킨다.
  const anchorDate = (allReports as any[])[0]?.date ?? today;
  const anchorIdx = Math.max(0, allTradingDates.indexOf(anchorDate));

  // ── 기준 랭킹 (= 헤더 순위) ─────────────────────────────────
  const scoredToday = computeScored(anchorDate);
  if (scoredToday.length === 0) return [];
  const top10 = scoredToday.slice(0, 10);

  // ── 기준일부터 7거래일 각 날짜의 순위 맵 (트레일·move 공용) ──
  const last7 = allTradingDates.slice(anchorIdx, anchorIdx + trailLen);
  const dayRankMaps = last7.map(d => {
    const sc = computeScored(d);
    const m = new Map<string, number>();
    sc.forEach((s, i) => m.set(s.name, i + 1));
    return m;
  });
  // dayRankMaps[0] = 오늘, [1] = 어제 ...

  // ── 최종 결과 조합 ───────────────────────────────────────────
  const results: RankedStock[] = top10.map((s, idx) => {
    const rank = idx + 1;

    // rankTrail: 오래된→최신 순 (마지막 = 오늘 = 헤더 순위와 동일)
    const rankTrail: (number | null)[] = dayRankMaps
      .slice()
      .reverse()
      .map(m => m.get(s.name) ?? null);

    // move 계산: 바로 직전 거래일 순위와 비교
    const prior = rankTrail.slice(0, -1); // 오늘 제외
    const everBefore = prior.some(v => v !== null);
    const prevRank = prior[prior.length - 1]; // 바로 직전 거래일
    let move: RankedStock['move'];
    if (!everBefore) {
      move = { type: 'new', n: 0 };                  // 7일 내 첫 등장
    } else if (prevRank === null) {
      move = { type: 're', n: 0 };                   // 직전엔 빠졌다가 오늘 재진입
    } else {
      const diff = prevRank - rank;
      move = diff > 0 ? { type: 'up', n: diff }
           : diff < 0 ? { type: 'down', n: Math.abs(diff) }
           : { type: 'same', n: 0 };
    }

    // hold: 연속 등장일
    const holdDays = s.days;
    const hold = holdDays === 1 ? '오늘 진입' : `${holdDays}일 연속 TOP`;

    // reason: 최신 방송 코멘트에서 뽑기 (첫 번째 note)
    const firstNote = s.latestNotes[0];
    const reason = firstNote?.view ?? `${s.latestShows.join('·')}에서 주목받았어요.`;

    // basis: 언급 방송 기반 자동 생성 (각 방송에 날짜 prefix)
    const md = s.mentionDate
      ? `${Number(s.mentionDate.slice(5, 7))}/${Number(s.mentionDate.slice(8, 10))}`
      : '';
    const showCount = s.latestShows.length;
    const basis: string[] = [
      `${md ? md + ' · ' : ''}${showCount}개 방송에서 언급됐어요`,
      ...s.latestShows.map((show: string) => {
        const note = s.latestNotes.find((n: any) => n.show === show);
        const dp = md ? `${md} · ` : '';
        return note ? `${dp}<strong>${show}</strong>: ${note.view}` : `${dp}<strong>${show}</strong>에서 언급`;
      }),
    ];

    // 감정·주가: 감정은 서버에서 종목별로 채움, 주가는 클라이언트에서 로드
    return {
      rank,
      date: (allReports as any[])[0]?.date ?? today,
      name: s.name,
      status: (s.status as 'pos' | 'neu' | 'warn'),
      move,
      score: s.score,
      rawScore: s.rawScore,
      scoreDivisor: s.scoreDivisor,
      mentionScore: s.mentionScore,
      tagScore: s.tagScore,
      continuityScore: s.continuityScore,
      intensity: s.intensity,
      sentimentDate: s.sentimentDate,
      mentionDate: s.mentionDate,
      noSentiment: s.noSentiment,
      todayPct: 0,
      hold,
      reason,
      rankTrail,
      price: { today: 0, d5: 0, m1: 0 },
      statusReason: s.statusReason,
      latestNotes: s.latestNotes,
      factorsPos: [],
      factorsWarn: [],
      basis,
      shows: s.latestShows,
    };
  });

  return results;
}
