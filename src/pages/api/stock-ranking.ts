import type { APIRoute } from 'astro';
import { computeRanking } from '../../lib/stockRanking';
import { fetchStockPrice } from '../../lib/kiwoom';

export const GET: APIRoute = async ({ url, locals }) => {
  const period = (url.searchParams.get('period') ?? 'day') as 'day' | 'week' | 'month';

  // 디버그: 키움 API 직접 테스트
  if (period === 'debug') {
    try {
      const result = await fetchStockPrice('005930');
      return new Response(JSON.stringify({
        envKey: !!import.meta.env.KIWOOM_APP_KEY,
        result,
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (!['day', 'week', 'month'].includes(period)) {
    return new Response(JSON.stringify({ error: 'invalid period' }), { status: 400 });
  }

  try {
    const data = await computeRanking((locals as any).supabase, period);
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[api/stock-ranking]', e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
