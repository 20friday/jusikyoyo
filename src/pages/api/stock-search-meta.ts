import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { canonicalStockName } from '../../lib/stockCodes';
import { snippetFor, BROADCAST_LABEL } from '../../lib/stockRanking';
import stockList from '../../../public/stocks.json';

// 검색 페이지용 종목 메타(방송 언급수·대표 감정·2주 흐름)를 한 번에 계산해 준다.
// ⭐ 방송 언급 카운트는 종목 상세 페이지(/stock/[name])와 "정확히 같은 방식"으로 센다:
//   날짜별로 한 소스만 인정(우선순위 daily_reports > 과거 리포트 > 개별 posts)하고,
//   그 소스가 그날 언급한 방송 수(shows 길이 / posts의 방송 수)를 합산.
//   posts 판정도 상세와 동일하게 tags 또는 snippetFor(본문 근거 문장) 기준.
// 무거운 본문 스캔이라 서버에서 계산하고 엣지 캐시(5분)로 재사용한다.

const KRX = new Set((stockList as Array<{ n: string }>).map((s) => s.n));

interface Ent {
  daily: Map<string, number>;   // date -> 그날 오늘의픽이 센 방송 수
  content: Map<string, number>; // date -> 과거 리포트가 센 방송 수
  posts: Map<string, Set<string>>; // date -> 개별 방송(show) 집합
  s?: string; // 대표 감정
  f?: string; // 2주 흐름 톤
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const supabase = (locals as any).supabase;
    const [{ data: reports }, { data: posts }, { data: flows }, contentReports] = await Promise.all([
      supabase.from('daily_reports').select('date, stocks, sentiment').order('date', { ascending: false }),
      // 상세 페이지와 동일하게 최근 240개만
      supabase.from('posts').select('date, slug, tags, content').order('date', { ascending: false }).limit(240),
      supabase.from('stock_flows').select('name, tone'),
      getCollection('reports').catch(() => []),
    ]);

    const meta: Record<string, Ent> = {};
    const ent = (name: string): Ent | null => {
      const c = canonicalStockName(name);
      if (!KRX.has(c)) return null; // KRX 정식 종목만 (테마키워드·해외 제외)
      return (meta[c] ??= { daily: new Map(), content: new Map(), posts: new Map() });
    };

    // 1) 대표 감정 (가장 최근 방송일). date desc 정렬이라 첫 매칭이 최신.
    for (const r of (reports ?? []) as any[]) {
      const sent = r.sentiment;
      if (!sent || typeof sent !== 'object') continue;
      for (const [nm, v] of Object.entries<any>(sent)) {
        const e = ent(nm);
        if (e && v?.status && !e.s) e.s = v.status;
      }
    }

    // 2) daily_reports(오늘의 픽) — 날짜별 shows 길이 (상세 matchesStock 과 동일: 이름 그대로 canonical 매칭)
    for (const r of (reports ?? []) as any[]) {
      for (const st of (r.stocks ?? [])) {
        if (!st?.name) continue;
        const e = ent(st.name);
        if (e) e.daily.set(r.date, Array.isArray(st.shows) ? st.shows.length : 0);
      }
    }

    // 3) 과거 리포트(content collection) — 날짜별 shows 길이
    for (const r of (contentReports ?? []) as any[]) {
      for (const st of (r.data?.stocks ?? [])) {
        if (!st?.name) continue;
        const e = ent(st.name);
        if (e) e.content.set(r.data.date, Array.isArray(st.shows) ? st.shows.length : 0);
      }
    }

    // 4) 개별 방송(posts) — 날짜별 방송(show) 집합. 판정: 태그 또는 snippetFor(본문 근거) 있음.
    const corpus = (posts ?? []).map((p: any) => p.content || '').join('\n\n');
    const candidates = [...KRX].filter((n) => corpus.includes(n)); // 본문에 실제 등장하는 후보만
    for (const p of (posts ?? []) as any[]) {
      const content = p.content || '';
      const show = BROADCAST_LABEL[String(p.slug ?? '').slice(11)] ?? String(p.slug ?? '');
      const seen = new Set<string>();
      const tags = Array.isArray(p.tags)
        ? p.tags
        : typeof p.tags === 'string' ? p.tags.split(',').map((t: string) => t.trim()) : [];
      for (const t of tags) {
        const c = canonicalStockName(t);
        if (KRX.has(c)) seen.add(c);
      }
      for (const n of candidates) {
        if (content.includes(n) && snippetFor(content, n)) seen.add(canonicalStockName(n));
      }
      for (const c of seen) {
        const e = ent(c); // ⚠️ meta[c] 아님 — posts로만 언급된 종목은 여기서 처음 생성돼야 한다
        if (!e) continue;
        if (!e.posts.has(p.date)) e.posts.set(p.date, new Set());
        e.posts.get(p.date)!.add(show);
      }
    }

    // 5) 2주 흐름 톤
    for (const row of (flows ?? []) as any[]) {
      const e = ent(row?.name);
      if (e && row?.tone) e.f = row.tone;
    }

    // 6) 날짜별 병합 후 합산 (상세 페이지와 동일: daily > content > posts)
    const out: Record<string, { m: number; s?: string; f?: string }> = {};
    for (const [name, e] of Object.entries(meta)) {
      const dates = new Set<string>([...e.daily.keys(), ...e.content.keys(), ...e.posts.keys()]);
      let m = 0;
      for (const d of dates) {
        if (e.daily.has(d)) m += e.daily.get(d)!;
        else if (e.content.has(d)) m += e.content.get(d)!;
        else m += e.posts.get(d)!.size;
      }
      out[name] = { m };
      if (e.s) out[name].s = e.s;
      if (e.f) out[name].f = e.f;
    }

    return new Response(JSON.stringify(out), {
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
