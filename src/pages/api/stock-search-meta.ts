import type { APIRoute } from 'astro';
import { canonicalStockName } from '../../lib/stockCodes';
import { mentionsStock } from '../../lib/stockRanking';
import stockList from '../../../public/stocks.json';

// 검색 페이지용 종목 메타(방송 언급수·대표 감정·2주 흐름)를 한 번에 계산해 준다.
// 방송 언급은 daily_reports(오늘의 픽) + posts(개별 방송)를 함께 세고,
// 이름이 다른 단어에 박힌 substring(상보→예상보다)은 mentionsStock로 걸러 정확히 센다.
// 무거운 본문 스캔이라 서버에서 계산하고 엣지 캐시(5분)로 재사용한다.

const KRX = new Set((stockList as Array<{ n: string }>).map((s) => s.n));

export const GET: APIRoute = async ({ locals }) => {
  try {
    const supabase = (locals as any).supabase;
    const [{ data: reports }, { data: posts }, { data: flows }] = await Promise.all([
      supabase.from('daily_reports').select('date, stocks, sentiment').order('date', { ascending: false }),
      supabase.from('posts').select('tags, content'),
      supabase.from('stock_flows').select('name, tone'),
    ]);

    // krxName -> { m: 언급수, s: 감정, f: 흐름 }
    const meta: Record<string, { m: number; s?: string; f?: string }> = {};
    const bump = (name: string) => {
      const c = canonicalStockName(name);
      if (!KRX.has(c)) return null;            // KRX 정식 종목만 (테마키워드·해외 제외)
      return (meta[c] ??= { m: 0 });
    };

    // 1) 대표 감정 (가장 최근 방송일). date desc 정렬이라 첫 매칭이 최신.
    for (const r of (reports ?? []) as any[]) {
      const sent = r.sentiment;
      if (!sent || typeof sent !== 'object') continue;
      for (const [nm, v] of Object.entries<any>(sent)) {
        const e = bump(nm);
        if (e && v?.status && !e.s) e.s = v.status;
      }
    }

    // 2) daily_reports(오늘의 픽) 언급 집계
    for (const r of (reports ?? []) as any[]) {
      for (const st of (r.stocks ?? [])) {
        if (!st?.name) continue;
        for (const part of String(st.name).split('·')) {
          const e = bump(part.trim());
          if (e) e.m += 1;
        }
      }
    }

    // 3) 개별 방송(posts) 언급 집계 — 태그 + 본문(단어 경계). 상세 페이지와 통일.
    const corpus = (posts ?? []).map((p: any) => p.content || '').join('\n\n');
    const candidates = [...KRX].filter((n) => corpus.includes(n)); // 본문에 실제 등장하는 후보만
    for (const p of (posts ?? []) as any[]) {
      const content = p.content || '';
      const seen = new Set<string>();
      const tags = Array.isArray(p.tags)
        ? p.tags
        : typeof p.tags === 'string' ? p.tags.split(',').map((t: string) => t.trim()) : [];
      for (const t of tags) {
        const c = canonicalStockName(t);
        if (KRX.has(c)) seen.add(c);
      }
      for (const n of candidates) {
        if (content.includes(n) && mentionsStock(content, n)) seen.add(canonicalStockName(n));
      }
      for (const c of seen) {
        const e = bump(c);
        if (e) e.m += 1;
      }
    }

    // 4) 2주 흐름 톤
    for (const row of (flows ?? []) as any[]) {
      const e = bump(row?.name);
      if (e && row?.tone) e.f = row.tone;
    }

    return new Response(JSON.stringify(meta), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
