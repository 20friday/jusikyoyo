/**
 * 종목 "이 주가, 왜 이래?" API
 *
 *  GET  ?code=005930          → 저장된 분석 결과 + 갱신 시각 (없으면 cached:false)
 *  POST { code, name }        → 새로 분석해서 저장 후 반환 (버튼 클릭 / 다시 분석)
 *
 * 결과는 Supabase stock_why 테이블에 캐시한다. (테이블 없으면 캐시 없이 동작)
 */
import type { APIRoute } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getStockDetail } from '../../lib/stockDetail';
import { getDisclosures } from '../../lib/dartDisclosures';
import { analyzeWhy } from '../../lib/stockWhy';

// 웹검색 + Opus 분석은 시간이 걸린다 → 함수 타임아웃 여유 확보 (Vercel)
export const config = { maxDuration: 60 };

// 유료회원 기능 스위치. 아직 유료회원 시스템이 없어 OFF.
// 누가 이 엔드포인트를 직접 호출해도 분석(=과금)이 돌지 않도록 막는다.
// 유료회원 준비되면 true로 켜고, 여기에 회원 등급 검사를 붙인다.
const PREMIUM_ENABLED = false;

function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get('code')?.trim();
  if (!code) return json({ cached: false, error: 'code 필요' }, 400);

  const sb = getSupabase();
  if (!sb) return json({ cached: false });

  try {
    const { data } = await sb
      .from('stock_why')
      .select('result, updated_at')
      .eq('code', code)
      .single();
    if (data?.result) {
      return json({ cached: true, result: data.result, updatedAt: data.updated_at });
    }
  } catch {
    /* 테이블 없음/미조회 → 캐시 없음으로 처리 */
  }
  return json({ cached: false });
};

export const POST: APIRoute = async ({ request }) => {
  if (!PREMIUM_ENABLED) {
    return json({ error: '유료회원 전용 기능이에요', premium: true }, 403);
  }

  let body: { code?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: '잘못된 요청이에요' }, 400);
  }
  const code = body.code?.trim();
  const name = body.name?.trim();
  if (!code || !name) return json({ error: 'code·name 필요' }, 400);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: '분석 키가 설정되지 않았어요' }, 500);

  try {
    // 1. 네이버 현재가·실적 + 2. DART 공시 (병렬)
    const [detail, disclosures] = await Promise.all([
      getStockDetail(code, name).catch(() => null),
      getDisclosures(code).catch(() => []),
    ]);

    // 3. Claude 종합 분석
    const result = await analyzeWhy(name, detail, disclosures, apiKey);

    // 4. 캐시 저장 (테이블 없으면 조용히 패스)
    const sb = getSupabase();
    const updatedAt = new Date().toISOString();
    if (sb) {
      try {
        await sb.from('stock_why').upsert(
          { code, name, result, updated_at: updatedAt },
          { onConflict: 'code' }
        );
      } catch {
        /* 캐시 실패해도 결과는 반환 */
      }
    }

    return json({ cached: false, result, updatedAt });
  } catch (e: any) {
    return json({ error: e?.message ?? '분석에 실패했어요' }, 500);
  }
};
