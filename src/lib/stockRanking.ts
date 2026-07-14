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
 * 주간/월간: 꾸준함(나온 날 수) + 누적 방송 언급 수 기반.
 *            오늘의 픽 종목 + 개별 방송 태그 종목 모두 포함(실제 상장 종목만).
 *
 * 7일 순위 변화 차트(rankTrail)도 헤더 순위와 동일한 윈도우 종합 점수로 계산해,
 * 차트 마지막 점 = 헤더 순위가 항상 일치하도록 한다.
 */
import { isExcludedStock } from './excludedStocks';
import { canonicalStockName, getStockCode } from './stockCodes';
import stockList from '../../public/stocks.json';

// 코스피·코스닥 전체 상장 종목 화이트리스트.
// posts.tags에는 테마·키워드(반도체·AI 등)도 섞여 있어, 실제 상장 종목만 걸러낸다.
const VALID_STOCK_NAMES: Set<string> = new Set(
  (stockList as Array<{ n: string }>).flatMap((s) => [s.n, canonicalStockName(s.n)])
);
export function isRealStock(name: string): boolean {
  return VALID_STOCK_NAMES.has(name) || getStockCode(name) != null;
}

// 이름을 부분 문자열로 포함하는 "더 긴 다른 상장 종목명" 목록.
// 예: 현대차 → [현대차증권, 현대차우, 현대차2우B, …]. 문장에서 이걸 먼저 지우면
// "현대차증권은 …" 같은 다른 종목 문장이 현대차 언급으로 오인되지 않는다.
const longerNameCache = new Map<string, string[]>();
function longerConfusableNames(name: string): string[] {
  let list = longerNameCache.get(name);
  if (!list) {
    list = [...VALID_STOCK_NAMES].filter((n) => n.length > name.length && n.includes(name));
    longerNameCache.set(name, list);
  }
  return list;
}

// 방송 슬러그 접미사 → 방송명 (태그로만 언급된 종목의 카드 근거 표기용)
export const BROADCAST_LABEL: Record<string, string> = {
  hankyungtv: '한국경제TV',
  samprotv: '삼프로TV',
  yonhapeconomy: '연합뉴스경제TV',
  '12simannaayo': '12시에 만나요',
};

// 방송 본문(마크다운)에서 특정 종목을 "그 종목 얘기로" 뽑는다.
// 오늘의 픽에 없이 태그로만 언급된 종목의 카드 근거·감정분석 근거로 쓴다.
// 본문 형식: 줄마다 "**종목명.** 설명…" 블록. 다른 종목 블록에서 비교 대상으로만
// 스쳐 언급된 문장(예: "현대차보다 싸다")은 그 종목 얘기가 아니므로 뽑지 않는다.
export function snippetFor(content: string, name: string): string {
  if (!content) return '';
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clip = (s: string) => (s.length > 240 ? s.slice(0, 240) : s);
  // 문장 최대 2개까지
  const twoSentences = (s: string) =>
    s.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 2).join(' ');

  // 1) 이 종목 전용 블록(**현대차.** / **현대차 - …**)의 설명을 최우선으로 쓴다.
  //    헤더가 종목명으로 시작하는 줄부터 다음 헤더 전까지가 그 종목 전용 코멘트(가장 정확).
  //    옛 글은 헤더와 본문이 다른 줄로 나뉘어 있기도 해서 뒷줄까지 이어 붙인다.
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const headerOf = (line: string) => {
    const m = line.match(/^\*\*\s*(.+?)\s*\*\*\s*(.*)$/);
    return m ? { head: m[1], rest: m[2] } : null;
  };
  // 헤더가 종목명으로 "시작"하는가 (뒤에 경계 문자) — "현대차", "현대차 - 로봇", "현대차·기아"
  const startsWithName = new RegExp(`^${esc}(?=$|[\\s.,\\-·)])`);
  for (let i = 0; i < lines.length; i++) {
    const h = headerOf(lines[i]);
    if (!h || !startsWithName.test(h.head)) continue;
    const bodyLines = [h.rest];
    for (let j = i + 1; j < lines.length && !headerOf(lines[j]); j++) bodyLines.push(lines[j]);
    const body = twoSentences(bodyLines.join(' ').replace(/[*#>`]/g, '').trim());
    if (body) return clip(body);
  }

  // 2) 전용 블록이 없으면, 종목이 '주체'로 나온 문장만 뽑는다.
  //    "현대차보다/대비/만큼/처럼/대신"처럼 비교 대상으로만 등장한 문장은
  //    다른 종목 얘기라 제외한다(현대차 카드에 기아 코멘트가 뜨는 문제 방지).
  //    이름만 있는 라벨 조각("현대차")도 설명이 아니므로 제외한다.
  const plain = content.replace(/[*#>`]/g, '');
  const parts = plain.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const comparativeOnly = new RegExp(`${esc}\\s*(보다|대비|만큼|처럼|대신)`, 'g');
  const isBareLabel = (s: string) => s.replace(name, '').replace(/[^가-힣\w]/g, '') === '';
  const confusables = longerConfusableNames(name);
  // 종목이 '진짜 주체'로 나온 문장인가:
  //   ① 더 긴 다른 종목명(현대차증권)을 지우고 ② 비교 표현(현대차보다)을 지운 뒤에도 이름이 남아야 한다.
  const isRealSubject = (s: string) => {
    let clean = s;
    for (const cn of confusables) clean = clean.split(cn).join(' ');
    return clean.replace(comparativeOnly, '').includes(name);
  };
  const hits = parts.filter((p) => p.includes(name) && isRealSubject(p) && !isBareLabel(p));
  if (hits.length === 0) return '';
  return clip(hits.slice(0, 2).join(' '));
}

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
  flowTone: string | null;      // 2주 방송 흐름 톤 (good/neutral/watch) — 없으면 null. 카드에 별도 표기
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
    .select('tags, date, slug, content')
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
      latestDate: string | null;              // 가장 최근 '리포트' 등장일 (notes 출처)
      totalShows: number;
      daySentiments: DaySent[];               // 등장한 날들의 일간 감정 (최신순)
      tagDates: Map<string, Set<string>>;      // 날짜 → 그날 태그한 방송(slug 접미사) 집합
      reportShowsByDate: Map<string, string[]>; // 날짜 → 그날 오늘의 픽에 실린 방송명 목록
      tagNotesByDate: Map<string, Array<{ show: string; view: string }>>; // 날짜 → 방송 본문에서 뽑은 근거 문장
    }>();
    const fresh = () => ({
      dates: new Set<string>(), latestNotes: [] as any[], latestShows: [] as string[],
      latestDate: null as string | null, totalShows: 0, daySentiments: [] as DaySent[],
      tagDates: new Map<string, Set<string>>(), reportShowsByDate: new Map<string, string[]>(),
      tagNotesByDate: new Map<string, Array<{ show: string; view: string }>>(),
    });

    // ① 오늘의 픽(daily_reports)에 실린 종목 수집
    for (const report of reps) {
      for (const stock of (report.stocks ?? [])) {
        if (!stock.name) continue;
        // 사명 변경된 종목은 현재 이름으로 통일 (옛 이름으로 저장된 과거 글 포함)
        const name = canonicalStockName(stock.name);
        if (isExcludedStock(name)) continue; // 해외·비상장·묶음 라벨 제외
        if (!stockMap.has(name)) stockMap.set(name, fresh());
        const e = stockMap.get(name)!;
        e.dates.add(report.date);
        e.totalShows += (stock.shows?.length ?? 0);      // 기간 내 누적 방송 언급 수
        e.reportShowsByDate.set(report.date, stock.shows ?? []);
        // reps가 최신 순이므로 첫 등장이 가장 최근 데이터
        if (e.latestShows.length === 0 && e.latestNotes.length === 0) {
          e.latestNotes = stock.notes ?? [];
          e.latestShows = stock.shows ?? [];
          e.latestDate = report.date;
        }
      }
    }

    const isPeriod = period !== 'day'; // 주간·월간

    // ② 각 방송(posts)에서 태그된 종목도 후보에 추가 (실제 상장 종목만).
    //    일간·주간·월간 모두 적용 — 오늘의 픽에 없이 개별 방송에서만 언급된 종목도 순위에 올린다.
    //    방송 횟수 = 그 종목을 태그한 방송(글) 수.
    {
      const windowPosts = (allPosts ?? []).filter((p: any) => p.date >= fromD && p.date <= toD);
      for (const post of windowPosts) {
        const slug = String(post.slug ?? '');
        const broadcast = slug.slice(11) || slug; // 'YYYY-MM-DD-' 접미사
        const tags: string[] = Array.isArray(post.tags)
          ? post.tags
          : typeof post.tags === 'string' ? post.tags.split(',').map((t: string) => t.trim()) : [];
        const seen = new Set<string>();
        for (const tag of tags) {
          const name = canonicalStockName(tag);
          if (seen.has(name)) continue;                 // 한 글 안에서 같은 종목 중복 태그 방지
          seen.add(name);
          if (isExcludedStock(name) || !isRealStock(name)) continue; // 테마·해외·비상장 제외
          if (!stockMap.has(name)) stockMap.set(name, fresh());
          const e = stockMap.get(name)!;
          e.dates.add(post.date);
          if (!e.tagDates.has(post.date)) e.tagDates.set(post.date, new Set());
          e.tagDates.get(post.date)!.add(broadcast);
          // 방송 본문에서 그 종목이 나온 문장을 근거로 저장 (있으면). 카드 표시·정렬 근거용.
          const view = snippetFor(post.content ?? '', name);
          if (view) {
            if (!e.tagNotesByDate.has(post.date)) e.tagNotesByDate.set(post.date, []);
            e.tagNotesByDate.get(post.date)!.push({ show: BROADCAST_LABEL[broadcast] ?? broadcast, view });
          }
        }
      }
    }

    // ③ 감정 수집: 리포트 sentiment를 canonical 키로 정리(원래 이름·현재 이름·태그 종목 모두 매칭).
    //    reps가 최신순이라 daySentiments도 최신순으로 쌓인다.
    for (const report of reps) {
      const raw = (report.sentiment ?? {}) as Record<string, any>;
      const canon: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) canon[canonicalStockName(k)] = v;
      for (const [name, e] of stockMap) {
        const s = canon[name];
        if (s?.status) {
          e.daySentiments.push({
            date: report.date,
            status: s.status,
            intensity: Math.min(Math.max(Math.round(Number(s.intensity) || 1), 1), 5),
            reason: s.reason ?? '',
          });
        }
      }
    }

    const BROADCAST_SCORE: Record<number, number> = { 1: 30, 2: 62, 3: 85, 4: 100 };
    const scored: ScoredStock[] = [];
    for (const [name, e] of stockMap) {
      // 가장 최근 등장일 (태그·리포트 통합). 신선도 감쇠·방송 횟수 기준일.
      const latestAppear = e.dates.size ? [...e.dates].sort()[e.dates.size - 1] : e.latestDate;

      // 대표 감정·비중
      const picked = pickSentiment(e.daySentiments);
      const intensity = picked ? picked.intensity : 1;

      let mentionScore: number, tagScore: number, continuityScore: number;
      let rawScore: number, scoreDivisor: number, nuanceScore: number;
      let decay = 1;
      let showsForCard = e.latestShows;
      let notesForCard = e.latestNotes; // 카드 근거: 기본은 오늘의 픽 코멘트

      if (!isPeriod) {
        // ── 일간(C): 방송 횟수(계단식) 주력 + 감정 보정 + 신선도 감쇠 ──
        // 신선도 감쇠: 마지막 등장일에서 하루 멀어질수록 –20%, 5거래일째 퇴장.
        // (어제 뜬 종목이 오늘 갑자기 사라지지 않게 해 순위 출렁임을 막는다.)
        const li = allTradingDates.indexOf(latestAppear ?? '');
        const daysSince = li >= 0 ? li - idx : 0;
        decay = Math.max(0, 1 - 0.2 * daysSince);
        if (decay <= 0) continue; // 마지막 언급 후 5거래일 이상 → 제외

        // 방송 횟수 = 마지막 등장일에 그 종목을 언급한 방송들의 합집합 (리포트 shows ∪ 태그 방송).
        // 표시(방송명)와 점수 기준을 동일한 집합으로 맞춘다.
        const repShows = e.reportShowsByDate.get(latestAppear ?? '') ?? [];
        const tagBs = [...(e.tagDates.get(latestAppear ?? '') ?? [])].map((b) => BROADCAST_LABEL[b] ?? b);
        const bcSet = new Set<string>([...repShows, ...tagBs]);
        const bc = Math.max(bcSet.size, 1);
        const inReport = e.reportShowsByDate.has(latestAppear ?? '');
        // 오늘의 픽에 없이 태그로만 든 종목은 방송 본문에서 뽑은 문장을 근거로 쓴다
        // (며칠 전 픽 코멘트를 오늘 날짜로 붙이는 문제를 피하고, 실제 방송 내용을 보여준다).
        if (!inReport) notesForCard = e.tagNotesByDate.get(latestAppear ?? '') ?? [];
        if (bcSet.size) showsForCard = [...bcSet];

        const broadcastScore = BROADCAST_SCORE[Math.min(bc, 4)] ?? 30;    // ① 방송 횟수 (주력)
        const curationBonus = inReport ? 8 : 0;                            // ③ 오늘의 픽 강조
        // ② 감정 보정: 긍정 +, 주의 −, 강도(1~5)에 비례 (최대 ±15)
        nuanceScore = picked ? (STATUS_MULT[picked.status] ?? 0) * Math.min(intensity * 3, 15) : 0;

        mentionScore = broadcastScore;    // 방송 횟수 점수 (전달·표시용)
        tagScore = curationBonus;         // 큐레이션 보너스 (전달용)
        continuityScore = 0;
        rawScore = broadcastScore + curationBonus;   // 감정 제외 기본 (최대 108)
        scoreDivisor = 123;                          // 108 + 감정 15 = 123 → 만점 100 환산
      } else {
        // ── 주간·월간: 꾸준함 60 + 누적 언급 30 (감정은 ±20) ──
        // 오늘의 픽 + 개별 방송 태그 종목 모두 포함. 날짜별 방송 합집합으로 누적 언급을 집계해
        // 같은 날 리포트·태그가 겹쳐도 이중으로 세지 않는다.
        let totalMentions = 0;
        for (const d of e.dates) {
          const repShows = e.reportShowsByDate.get(d) ?? [];
          const tagBs = [...(e.tagDates.get(d) ?? [])].map((b) => BROADCAST_LABEL[b] ?? b);
          totalMentions += Math.max(new Set([...repShows, ...tagBs]).size, 1);
        }
        const consistency = Math.min(e.dates.size / days, 1) * 60;          // 나온 날 수 / 기간 거래일
        const volume = Math.min(totalMentions / (days * 3), 1) * 30;        // 누적 방송 언급 수
        rawScore = consistency + volume;                                    // 0~90
        scoreDivisor = 100;
        mentionScore = Math.round(consistency);
        continuityScore = Math.round(volume);
        tagScore = 0;
        nuanceScore = picked ? (STATUS_MULT[picked.status] ?? 0) * intensity * 4 : 0;

        // 태그로만 언급된 종목은 리포트 코멘트가 없으니, 최근 등장일의 방송·본문 문장으로 카드를 채운다.
        if (e.latestShows.length === 0 && e.latestNotes.length === 0) {
          const repShows = e.reportShowsByDate.get(latestAppear ?? '') ?? [];
          const tagBs = [...(e.tagDates.get(latestAppear ?? '') ?? [])].map((b) => BROADCAST_LABEL[b] ?? b);
          const union = new Set([...repShows, ...tagBs]);
          if (union.size) showsForCard = [...union];
          notesForCard = e.tagNotesByDate.get(latestAppear ?? '') ?? [];
        }
      }
      const sortScore = (rawScore + nuanceScore) * decay;
      const score = Math.max(0, Math.min(100, Math.round((sortScore / scoreDivisor) * 100)));
      scored.push({
        name, score, rawScore, sortScore, scoreDivisor, mentionScore, tagScore, continuityScore, intensity,
        status: picked ? picked.status : 'neu',
        statusReason: picked ? (picked.reason ?? '') : null,
        sentimentDate: picked ? picked.date : null,
        mentionDate: latestAppear,
        noSentiment: !picked,
        latestNotes: notesForCard, latestShows: showsForCard, days: e.dates.size, totalShows: e.totalShows,
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

  // ── 2주 방송 흐름 톤 조회 (top10만) ─────────────────────────
  // 표시 태그를 일간·흐름 중 보수적인 쪽으로 맞추는 데만 쓴다. 순위엔 영향 없음.
  // 흐름 조회가 실패해도 일간 태그로 조용히 폴백한다.
  const flowToneMap = new Map<string, string>();
  try {
    const { data: flowRows } = await supabase
      .from('stock_flows')
      .select('name, tone')
      .in('name', top10.map((s) => s.name));
    for (const row of flowRows ?? []) {
      if (row?.name && row?.tone) flowToneMap.set(row.name, row.tone);
    }
  } catch { /* 흐름 없으면 일간 태그 그대로 */ }

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

    // 2주 방송 흐름 톤 — 카드에 오늘 뉘앙스와 별개로 표기(합치지 않는다).
    const flowTone = flowToneMap.get(s.name) ?? null;

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

    // hold 배지: 일간은 '보드(상위 10위)에 떠 있는 연속 일수' 기준.
    // 오늘 처음 뜬 종목만 '오늘 진입', 이미 떠 있던 종목은 'N일 연속 TOP'.
    // (점수는 언급 신선도로 따로 감쇠하므로, 배지는 화면 노출 일수만 말한다.)
    // 주간·월간은 기존 언급일 수 기준 유지.
    let hold: string;
    if (period === 'day') {
      let boardDays = 0;
      for (let i = rankTrail.length - 1; i >= 0; i--) {
        const rk = rankTrail[i];
        if (rk != null && rk <= 10) boardDays++;
        else break;
      }
      hold = boardDays <= 1 ? '오늘 진입' : `${boardDays}일 연속 TOP`;
    } else {
      const holdDays = s.days;
      hold = holdDays === 1 ? '오늘 진입' : `${holdDays}일 연속 TOP`;
    }

    // reason / basis: 방송 코멘트(오늘의 픽) 또는 방송 본문 문장(태그 종목) 기반 자동 생성.
    // latestNotes에 이미 종목 유형에 맞는(날짜가 맞는) 근거가 담겨 있다.
    const md = s.mentionDate
      ? `${Number(s.mentionDate.slice(5, 7))}/${Number(s.mentionDate.slice(8, 10))}`
      : '';
    const dp = md ? `${md} · ` : '';
    const showCount = s.latestShows.length;
    const firstNote = s.latestNotes[0];
    const reason = firstNote?.view ?? `${s.latestShows.join('·')}에서 주목받았어요.`;
    const basis: string[] = [
      `${dp}${showCount}개 방송에서 언급됐어요`,
      ...s.latestShows.map((show: string) => {
        const note = s.latestNotes.find((n: any) => n.show === show);
        return note ? `${dp}<strong>${show}</strong>: ${note.view}` : `${dp}<strong>${show}</strong>에서 언급`;
      }),
    ];

    // 감정·주가: 감정은 서버에서 종목별로 채움, 주가는 클라이언트에서 로드
    return {
      rank,
      date: (allReports as any[])[0]?.date ?? today,
      name: s.name,
      status: (s.status as 'pos' | 'neu' | 'warn'),
      flowTone,
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
