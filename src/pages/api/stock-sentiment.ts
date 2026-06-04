import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';
import { createClient } from '@supabase/supabase-js';
import { ANTHROPIC_API_KEY } from 'astro:env/server';

export const GET: APIRoute = async ({ url }) => {
  try {
    const date = url.searchParams.get('date') ?? new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10);

    const env = process['env'] as any;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? env['PUBLIC_SUPABASE_URL'] ?? '';
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ _debug: 'no supabase config' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // 오늘 daily_report 조회
    const { data: report } = await sb
      .from('daily_reports')
      .select('stocks, sentiment')
      .eq('published', true)
      .eq('date', date)
      .single();

    // 오늘 리포트가 있고 sentiment 캐시도 있으면 바로 반환
    if (report?.sentiment) {
      return new Response(JSON.stringify(report.sentiment), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 오늘 리포트가 없으면 가장 최근 캐시된 sentiment 반환
    if (!report?.stocks?.length) {
      const { data: latest } = await sb
        .from('daily_reports')
        .select('sentiment, date')
        .eq('published', true)
        .not('sentiment', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (latest?.sentiment) {
        return new Response(JSON.stringify(latest.sentiment), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ _debug: 'no data', date }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // sentiment 없으면 Haiku 분석 실행
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ _debug: 'key empty' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const stocks = report.stocks.map((s: any) => ({
      name: s.name,
      notes: s.notes ?? [],
    }));

    const sentimentMap = await analyzeStockSentiments(stocks, ANTHROPIC_API_KEY);
    const result = Object.fromEntries(
      [...sentimentMap.entries()].map(([name, s]) => [name, { status: s.status, intensity: s.intensity, reason: s.reason }])
    );

    // DB에 캐시 저장
    await sb
      .from('daily_reports')
      .update({ sentiment: result })
      .eq('date', date);

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
