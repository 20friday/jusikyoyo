import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';
import { createClient } from '@supabase/supabase-js';

// GET: 날짜 기반으로 Supabase에서 직접 notes 가져와서 분석
export const GET: APIRoute = async ({ url }) => {
  try {
    const date = url.searchParams.get('date') ?? new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10);

    const sb = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    );

    const { data: report } = await sb
      .from('daily_reports')
      .select('stocks')
      .eq('published', true)
      .eq('date', date)
      .single();

    if (!report?.stocks?.length) {
      return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
    }

    const stocks = report.stocks.map((s: any) => ({
      name: s.name,
      notes: s.notes ?? [],
    }));

    const sentimentMap = await analyzeStockSentiments(stocks);
    const result = Object.fromEntries(
      [...sentimentMap.entries()].map(([name, s]) => [name, { status: s.status, reason: s.reason }])
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500 });
  }
};
