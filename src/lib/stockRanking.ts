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

export interface RankedStock {
  rank: number;
  date: string;
  name: string;
  status: 'pos' | 'neu' | 'warn';
  move: { type: 'up' | 'down' | 'same' | 'new' | 're'; n: number };
  score: number;        // displayScore (0~100)
  rawScore: number;     // 서버 계산 기본 점수 (nuanceScore 제외)
  mentionScore: number;
  tagScore: number;
  continuityScore: number;
  intensity: number;    // 1~5, 클라이언트에서 sentiment 로드 후 채워짐
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
    .select('date, stocks')
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
    rawScore: number;
    mentionScore: number;
    tagScore: number;
    continuityScore: number;
    latestNotes: any[];
    latestShows: string[];
    days: number;
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
    }>();

    for (const report of reps) {
      for (const stock of (report.stocks ?? [])) {
        if (!stock.name) continue;
        if (!stockMap.has(stock.name)) {
          stockMap.set(stock.name, { dates: new Set(), latestNotes: [], latestShows: [] });
        }
        const e = stockMap.get(stock.name)!;
        e.dates.add(report.date);
        // reps가 최신 순이므로 첫 등장이 가장 최근 데이터
        if (e.latestShows.length === 0 && e.latestNotes.length === 0) {
          e.latestNotes = stock.notes ?? [];
          e.latestShows = stock.shows ?? [];
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

    const scored: ScoredStock[] = [];
    for (const [name, e] of stockMap) {
      const mentionScore = Math.min(e.latestShows.length * 25, 100);
      const tagScore = Math.min((tagCount.get(name) ?? 0) * 5, 20);
      const continuityScore = Math.min(e.dates.size * 3, 15);
      const rawScore = mentionScore + tagScore + continuityScore;
      const score = Math.max(0, Math.round((rawScore / 155) * 100));
      scored.push({
        name, score, rawScore, mentionScore, tagScore, continuityScore,
        latestNotes: e.latestNotes, latestShows: e.latestShows, days: e.dates.size,
      });
    }

    scored.sort((a, b) =>
      b.rawScore - a.rawScore ||
      b.mentionScore - a.mentionScore ||
      b.continuityScore - a.continuityScore
    );
    return scored;
  }

  // ── 오늘 기준 랭킹 (= 헤더 순위) ────────────────────────────
  const scoredToday = computeScored(today);
  if (scoredToday.length === 0) return [];
  const top10 = scoredToday.slice(0, 10);

  // ── 최근 7거래일 각 날짜의 순위 맵 (트레일·move 공용) ───────
  const last7 = allTradingDates.slice(0, trailLen);
  const dayRankMaps = last7.map(d => {
    const sc = computeScored(d);
    const m = new Map<string, number>();
    sc.forEach((s, i) => m.set(s.name, i + 1));
    return m;
  });
  // dayRankMaps[0] = 오늘, [1] = 어제 ...
  const yesterdayRanks = dayRankMaps[1] ?? new Map<string, number>();

  // ── 최종 결과 조합 ───────────────────────────────────────────
  const results: RankedStock[] = top10.map((s, idx) => {
    const rank = idx + 1;

    // move 계산 (어제 윈도우 순위 대비)
    const prevRank = yesterdayRanks.get(s.name);
    let move: RankedStock['move'];
    if (!prevRank) {
      const wasInLast7 = dayRankMaps.slice(2).some(m => m.has(s.name));
      move = wasInLast7 ? { type: 're', n: 0 } : { type: 'new', n: 0 };
    } else {
      const diff = prevRank - rank;
      if (diff > 0) move = { type: 'up', n: diff };
      else if (diff < 0) move = { type: 'down', n: Math.abs(diff) };
      else move = { type: 'same', n: 0 };
    }

    // rankTrail: 오래된→최신 순 (마지막 = 오늘 = 헤더 순위와 동일)
    const rankTrail: (number | null)[] = dayRankMaps
      .slice()
      .reverse()
      .map(m => m.get(s.name) ?? null);

    // hold: 연속 등장일
    const holdDays = s.days;
    const hold = holdDays === 1 ? '오늘 진입' : `${holdDays}일 연속 TOP`;

    // reason: 최신 방송 코멘트에서 뽑기 (첫 번째 note)
    const firstNote = s.latestNotes[0];
    const reason = firstNote?.view ?? `${s.latestShows.join('·')}에서 주목받았어요.`;

    // basis: 언급 방송 기반 자동 생성
    const showCount = s.latestShows.length;
    const basis: string[] = [
      `${showCount}개 방송에서 언급됐어요`,
      ...s.latestShows.map((show: string) => {
        const note = s.latestNotes.find((n: any) => n.show === show);
        return note ? `<strong>${show}</strong>: ${note.view}` : `<strong>${show}</strong>에서 언급`;
      }),
    ];

    // status / 주가: 클라이언트에서 sentiment·주가 로드 후 채움
    return {
      rank,
      date: (allReports as any[])[0]?.date ?? today,
      name: s.name,
      status: 'neu' as const,
      move,
      score: s.score,
      rawScore: s.rawScore,
      mentionScore: s.mentionScore,
      tagScore: s.tagScore,
      continuityScore: s.continuityScore,
      intensity: 1, // 클라이언트에서 sentiment 로드 후 업데이트
      todayPct: 0,
      hold,
      reason,
      rankTrail,
      price: { today: 0, d5: 0, m1: 0 },
      statusReason: null,
      latestNotes: s.latestNotes,
      factorsPos: [],
      factorsWarn: [],
      basis,
      shows: s.latestShows,
    };
  });

  return results;
}
