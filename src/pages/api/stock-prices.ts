import type { APIRoute } from 'astro';
import { resolveStockCodes } from '../../lib/resolveStockCode';
import { fetchStockPrices } from '../../lib/yahooFinance';

// GET /api/stock-prices?names=삼성전자,SK하이닉스,...
export const GET: APIRoute = async ({ url }) => {
  try {
    const namesParam = url.searchParams.get('names') ?? '';
    const names = namesParam.split(',').map(n => n.trim()).filter(Boolean);

    if (!names.length) {
      return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
    }

    // 종목명 → 코드 + 시장 자동 조회 (네이버 + Supabase 캐시)
    const resolved = await resolveStockCodes(names);
    const codes = names
      .filter(name => resolved.has(name))
      .map(name => ({ name, code: resolved.get(name)!.code, market: resolved.get(name)!.market }));

    const priceMap = await Promise.race([
      fetchStockPrices(codes.map(c => ({ code: c.code, market: c.market }))),
      new Promise<Map<string, any>>(resolve => setTimeout(() => resolve(new Map()), 6000)),
    ]);

    const result: Record<string, { today: number; d5: number; m1: number }> = {};
    for (const { name, code } of codes) {
      const p = priceMap.get(code);
      if (p) {
        result[name] = { today: p.todayPct, d5: p.d5Pct, m1: p.m1Pct };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
