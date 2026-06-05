import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';
import { createClient } from '@supabase/supabase-js';
import { ANTHROPIC_API_KEY } from 'astro:env/server';

type Period = 'day' | 'week' | 'month';

const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 5, month: 22 };
const SENTIMENT_COL: Record<Period, string> = {
  day: 'sentiment',
  week: 'week_sentiment',
  month: 'month_sentiment',
};

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

    // 캐시 있으면 바로 반환
    if (todayReport?.[col]) {
      return new Response(JSON.stringify(todayReport[col]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

    // ── 기간별 notes 수집 ──────────────────────────────────────
    let stockNotesMap: Map<string, Array<{ show: string; view: string }>> = new Map();

    if (period === 'day') {
      // 일간: 오늘 리포트의 notes만
      for (const s of todayReport.stocks) {
        if (s.name && s.notes?.length) {
          stockNotesMap.set(s.name, s.notes);
        }
      }
    } else {
      // 주간/월간: 기간 내 모든 daily_report의 notes 수집
      const days = PERIOD_DAYS[period];
      const fromDate = new Date(Date.now() + 9*3600*1000);
      fromDate.setDate(fromDate.getDate() - days * 2); // 거래일 여유 있게
      const fromStr = fromDate.toISOString().slice(0, 10);

      const { data: reports } = await sb
        .from('daily_reports')
        .select('date, stocks')
        .eq('published', true)
        .gte('date', fromStr)
        .lte('date', dateParam)
        .order('date', { ascending: false })
        .limit(days + 3);

      // 종목별 notes 합산 (최신 날짜 우선, 방송당 1개만 유지)
      for (const report of reports ?? []) {
        for (const s of (report.stocks ?? [])) {
          if (!s.name || !s.notes?.length) continue;
          if (!stockNotesMap.has(s.name)) {
            stockNotesMap.set(s.name, []);
          }
          const existing = stockNotesMap.get(s.name)!;
          for (const note of s.notes) {
            // 같은 방송 코멘트는 최신 1개만 (최신 날짜 우선이므로 이미 있으면 스킵)
            if (!existing.some(n => n.show === note.show)) {
              existing.push(note);
            }
          }
        }
      }
    }

    if (stockNotesMap.size === 0) {
      return new Response(JSON.stringify({ _debug: 'no notes' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ _debug: 'key empty' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Haiku 분석 ─────────────────────────────────────────────
    const stocks = [...stockNotesMap.entries()].map(([name, notes]) => ({ name, notes }));
    const sentimentMap = await analyzeStockSentiments(stocks, ANTHROPIC_API_KEY);
    const result = Object.fromEntries(
      [...sentimentMap.entries()].map(([name, s]) => [name, { status: s.status, intensity: s.intensity, reason: s.reason }])
    );

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
