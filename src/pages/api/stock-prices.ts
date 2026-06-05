import type { APIRoute } from 'astro';
import { getStockCode } from '../../lib/stockCodes';
import { fetchStockPrices } from '../../lib/yahooFinance';

// GET /api/stock-prices?names=삼성전자,SK하이닉스,...
export const GET: APIRoute = async ({ url }) => {
  try {
    const namesParam = url.searchParams.get('names') ?? '';
    const names = namesParam.split(',').map(n => n.trim()).filter(Boolean);

    if (!names.length) {
      return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
    }

    const codes = names.map(name => ({ name, code: getStockCode(name) })).filter(({ code }) => !!code);

    const codeList = codes.map(c => c.code!);
    const priceMap = await Promise.race([
      fetchStockPrices(codeList),
      new Promise<Map<string, any>>(resolve => setTimeout(() => resolve(new Map()), 6000)),
    ]);

    const result: Record<string, { today: number; d5: number; m1: number }> = {};
    for (const { name, code } of codes) {
      const p = priceMap.get(code!);
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
