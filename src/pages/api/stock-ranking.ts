import type { APIRoute } from 'astro';
import { computeRanking } from '../../lib/stockRanking';
import { fetchStockPrice } from '../../lib/kiwoom';

export const GET: APIRoute = async ({ url, locals }) => {
  const period = (url.searchParams.get('period') ?? 'day') as 'day' | 'week' | 'month';

  // 디버그: 키움 API 직접 테스트
  if (period === 'debug') {
    let result = null;
    let err = null;
    try {
      result = await fetchStockPrice('005930');
    } catch (e: any) {
      err = e?.message ?? String(e);
    }
    // kiwoom.ts 내부 catch에서 null 반환하므로 토큰 직접 테스트
    let tokenTest = null;
    try {
      const appKey = import.meta.env.KIWOOM_APP_KEY;
      const appSecret = import.meta.env.KIWOOM_APP_SECRET;
      const res = await fetch('https://api.kiwoom.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, secretkey: appSecret }),
      });
      const data = await res.json();
      tokenTest = { code: data.return_code, msg: data.return_msg };
    } catch (e: any) {
      tokenTest = { error: e?.message };
    }
    return new Response(JSON.stringify({
      envKey: !!import.meta.env.KIWOOM_APP_KEY,
      tokenTest,
      result,
      err,
    }), { headers: { 'Content-Type': 'application/json' } });
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
