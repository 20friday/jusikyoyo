import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';
import { createClient } from '@supabase/supabase-js';
import { ANTHROPIC_API_KEY } from 'astro:env/server';
import { canonicalStockName } from '../../lib/stockCodes';
import { isExcludedStock } from '../../lib/excludedStocks';
import { isRealStock, BROADCAST_LABEL, snippetFor } from '../../lib/stockRanking';

type Period = 'day' | 'week' | 'month';

const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 5, month: 22 };
const SENTIMENT_COL: Record<Period, string> = {
  day: 'sentiment',
  week: 'week_sentiment',
  month: 'month_sentiment',
};

// 날짜를 "6월 2일 (월)" 형식으로 변환
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[d.getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const dateParam = url.searchParams.get('date') ?? new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10);
    const period = (url.searchParams.get('period') ?? 'day') as Period;
    const col = SENTIMENT_COL[period] ?? 'sentiment';

    const env = process['env'] as any;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? env['PUBLIC_SUPABASE_URL'] ?? '';
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ _debug: 'no supabase config' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // ── 오늘 리포트에서 캐시 확인 ──────────────────────────────
    const { data: todayReport } = await sb
      .from('daily_reports')
      .select(`${col}, stocks`)
      .eq('published', true)
      .eq('date', dateParam)
      .single();

    // (캐시가 있어도 바로 반환하지 않는다 — 새로 태그된 종목이 캐시에 빠졌을 수 있어
    //  아래에서 '분석 대상 전체가 캐시에 있는지' 완전성을 확인한 뒤 결정한다.)

    // ── 오늘 리포트 없으면 가장 최근 캐시 반환 ────────────────
    if (!todayReport?.stocks?.length) {
      const { data: latest } = await sb
        .from('daily_reports')
        .select(`${col}, date`)
        .eq('published', true)
        .not(col, 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (latest?.[col]) {
        return new Response(JSON.stringify(latest[col]), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ _debug: 'no data', date: dateParam }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 기간별 분석 데이터 수집 ────────────────────────────────
    let stockNotesMap: Map<string, Array<{ show: string; view: string }>> = new Map();

    if (period === 'day') {
      // 일간: 오늘의 픽 종목은 정리된 notes 그대로 사용 (canonical 키로 통일)
      for (const s of todayReport.stocks) {
        if (s.name && s.notes?.length) {
          stockNotesMap.set(canonicalStockName(s.name), s.notes);
        }
      }
      // C: 각 방송(posts)에서 2개 방송 이상 태그된 실제 상장 종목도 분석 대상에 추가.
      //    오늘의 픽엔 없지만 방송 본문에서 근거를 뽑아 감정을 매긴다.
      const { data: posts } = await sb
        .from('posts')
        .select('slug, content, tags')
        .eq('date', dateParam);
      // 종목별로 (방송명 → 본문 근거) 수집
      const tagNotes = new Map<string, Array<{ show: string; view: string }>>();
      for (const post of posts ?? []) {
        const slug = String(post.slug ?? '');
        const show = BROADCAST_LABEL[slug.slice(11)] ?? slug;
        const tags: string[] = Array.isArray(post.tags)
          ? post.tags
          : typeof post.tags === 'string' ? post.tags.split(',').map((t: string) => t.trim()) : [];
        const seen = new Set<string>();
        for (const tag of tags) {
          const name = canonicalStockName(tag);
          if (seen.has(name)) continue;
          seen.add(name);
          if (isExcludedStock(name) || !isRealStock(name)) continue;
          if (stockNotesMap.has(name)) continue; // 이미 오늘의 픽 notes가 있음
          const view = snippetFor(post.content ?? '', name);
          if (!view) continue; // 본문에 실제 언급 문장이 없으면 근거 없음 → 건너뜀
          if (!tagNotes.has(name)) tagNotes.set(name, []);
          tagNotes.get(name)!.push({ show, view });
        }
      }
      // 2개 방송 이상에서 근거가 잡힌 종목만 분석 (합의 신호 + 비용 절감)
      for (const [name, notes] of tagNotes) {
        if (notes.length >= 2) stockNotesMap.set(name, notes);
      }
    } else {
      // 주간/월간: 기간 내 이미 분석된 일간 sentiment 결과를 수집
      const days = PERIOD_DAYS[period];
      const fromDate = new Date(Date.now() + 9*3600*1000);
      fromDate.setDate(fromDate.getDate() - days * 2);
      const fromStr = fromDate.toISOString().slice(0, 10);

      // 각 날짜의 일간 sentiment 캐시 가져오기
      const { data: reports } = await sb
        .from('daily_reports')
        .select('date, sentiment')
        .eq('published', true)
        .gte('date', fromStr)
        .lte('date', dateParam)
        .not('sentiment', 'is', null)
        .order('date', { ascending: false })
        .limit(days + 3);

      // 종목별로 날짜별 일간 sentiment 결과를 정리
      // format: { show: "6월 2일 (월)", view: "긍정 — 메모리 공급 부족 지속 전망이에요." }
      for (const report of reports ?? []) {
        const dateLabel = formatDate(report.date);
        const sentiment = report.sentiment as Record<string, { status: string; reason: string }>;
        if (!sentiment) continue;

        for (const [name, s] of Object.entries(sentiment)) {
          if (!s?.status) continue;
          if (!stockNotesMap.has(name)) {
            stockNotesMap.set(name, []);
          }
          const statusLabel = s.status === 'pos' ? '긍정' : s.status === 'warn' ? '주의' : '중립';
          stockNotesMap.get(name)!.push({
            show: dateLabel,
            view: `${statusLabel} — ${s.reason ?? ''}`,
          });
        }
      }
    }

    if (stockNotesMap.size === 0) {
      return new Response(JSON.stringify(todayReport[col] ?? { _debug: 'no data for period' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 캐시 완전성 확인 ───────────────────────────────────────
    // 분석 대상 전체가 이미 캐시에 있으면 재생성 없이 그대로 반환한다.
    const cache = (todayReport[col] ?? {}) as Record<string, any>;
    const allCached = [...stockNotesMap.keys()].every((k) => k in cache);
    if (allCached) {
      return new Response(JSON.stringify(cache), { headers: { 'Content-Type': 'application/json' } });
    }
    // 새 종목이 있는데 키가 없으면 → 있는 캐시라도 반환 (재생성 불가)
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify(cache), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Haiku 종합 분석 ────────────────────────────────────────
    const stocks = [...stockNotesMap.entries()].map(([name, notes]) => ({ name, notes }));
    const sentimentMap = await analyzeStockSentiments(stocks, ANTHROPIC_API_KEY, period);

    // 기존 캐시를 보존하며 병합. Haiku가 빠뜨린 대상은 중립으로 채워
    // 캐시가 항상 분석 대상 전체를 덮게 한다(무한 재생성 방지).
    const result: Record<string, any> = { ...cache };
    for (const [name] of stockNotesMap) {
      const s = sentimentMap.get(name);
      result[name] = s
        ? { status: s.status, intensity: s.intensity, reason: s.reason }
        : (result[name] ?? { status: 'neu', intensity: 1, reason: '' });
    }

    // ── DB에 캐시 저장 ─────────────────────────────────────────
    await sb
      .from('daily_reports')
      .update({ [col]: result })
      .eq('date', dateParam);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ _error: e?.message ?? String(e) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
