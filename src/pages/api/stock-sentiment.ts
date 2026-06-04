import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';
import { createClient } from '@supabase/supabase-js';
import { ANTHROPIC_API_KEY } from 'astro:env/server';

// GET: 날짜 기반으로 Supabase에서 직접 notes 가져와서 분석
export const GET: APIRoute = async ({ url }) => {
  try {
    const date = url.searchParams.get('date') ?? new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10);

    const env = process['env'] as any;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? env['PUBLIC_SUPABASE_URL'] ?? '';
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ _debug: 'no supabase config', url: !!supabaseUrl, key: !!serviceKey }), { headers: { 'Content-Type': 'application/json' } });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    const { data: report, error: dbErr } = await sb
      .from('daily_reports')
      .select('stocks')
      .eq('published', true)
      .eq('date', date)
      .single();

    if (dbErr || !report?.stocks?.length) {
      return new Response(JSON.stringify({ _debug: 'no data', date, err: dbErr?.message }), { headers: { 'Content-Type': 'application/json' } });
    }

    const stocks = report.stocks.map((s: any) => ({
      name: s.name,
      notes: s.notes ?? [],
    }));

    const sentimentMap = await analyzeStockSentiments(stocks, ANTHROPIC_API_KEY);
    const result = Object.fromEntries(
      [...sentimentMap.entries()].map(([name, s]) => [name, { status: s.status, reason: s.reason }])
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ _error: e?.message ?? String(e) }), {
      status: 200, // 에러도 200으로 반환해서 브라우저에서 볼 수 있게
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
