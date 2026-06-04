import type { APIRoute } from 'astro';
import { analyzeStockSentiments } from '../../lib/sentimentAnalysis';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { stocks } = await request.json();
    if (!stocks || !Array.isArray(stocks)) {
      return new Response(JSON.stringify({ error: 'invalid input' }), { status: 400 });
    }

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
