/**
 * 종목명 → 종목코드 + 시장(코스피/코스닥) 자동 조회
 *
 * 우선순위:
 *  1) 메모리 캐시 (서버 인스턴스 단위)
 *  2) Supabase stock_codes 테이블 (영구 캐시)  ← 없어도 동작함
 *  3) 네이버 종목 자동완성 API (신규 조회) → Supabase에 영구 저장
 *  4) 네이버 실패 시 로컬 STOCK_CODES 맵 폴백
 *
 * 네이버 한 곳에서 코드와 현재 시장을 모두 받기 때문에
 * .KS/.KQ 접미사를 손으로 관리할 필요가 없다.
 */
import { createAdminClient } from './adminSupabase';
import { STOCK_CODES } from './stockCodes';

export type Market = 'KOSPI' | 'KOSDAQ';
export interface ResolvedCode { code: string; market: Market; }

// 인스턴스 메모리 캐시 (null = 조회했지만 못 찾음)
const memCache = new Map<string, ResolvedCode | null>();

async function fetchFromNaver(name: string): Promise<ResolvedCode | null> {
  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(name)}&target=stock`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    // 정확히 같은 이름 우선, 없으면 첫 결과
    const item = items.find(i => i?.name === name) ?? items[0];
    if (!item?.code) return null;
    const market: Market = (item.typeCode === 'KOSDAQ' || item.typeName === '코스닥') ? 'KOSDAQ' : 'KOSPI';
    return { code: String(item.code), market };
  } catch {
    return null;
  }
}

export async function resolveStockCodes(names: string[]): Promise<Map<string, ResolvedCode>> {
  const out = new Map<string, ResolvedCode>();
  const unknown: string[] = [];

  // 1) 메모리 캐시
  for (const name of names) {
    if (memCache.has(name)) {
      const v = memCache.get(name);
      if (v) out.set(name, v);
    } else if (!unknown.includes(name)) {
      unknown.push(name);
    }
  }
  if (!unknown.length) return out;

  // 2) Supabase 영구 캐시 일괄 조회 (테이블 없으면 조용히 패스)
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try { supabase = createAdminClient(); } catch { supabase = null; }

  const stillUnknown: string[] = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('stock_codes')
        .select('name, code, market')
        .in('name', unknown);
      if (error) throw error;
      const found = new Set<string>();
      for (const row of data ?? []) {
        const rc: ResolvedCode = { code: String(row.code), market: row.market === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI' };
        memCache.set(row.name, rc);
        out.set(row.name, rc);
        found.add(row.name);
      }
      for (const n of unknown) if (!found.has(n)) stillUnknown.push(n);
    } catch {
      // 테이블 없음/조회 실패 → 전부 네이버로
      stillUnknown.push(...unknown);
    }
  } else {
    stillUnknown.push(...unknown);
  }
  if (!stillUnknown.length) return out;

  // 3) 네이버 신규 조회 (병렬)
  const results = await Promise.all(
    stillUnknown.map(async n => [n, await fetchFromNaver(n)] as const)
  );
  const toUpsert: { name: string; code: string; market: Market }[] = [];
  for (const [name, rc] of results) {
    if (rc) {
      memCache.set(name, rc);
      out.set(name, rc);
      toUpsert.push({ name, code: rc.code, market: rc.market });
    } else {
      // 네이버 실패 → 로컬 맵 폴백 (시장 정보 없음 → KOSPI 기본, 캐시엔 저장 안 함)
      const localCode = STOCK_CODES[name];
      if (localCode) {
        out.set(name, { code: localCode, market: 'KOSPI' });
      } else {
        memCache.set(name, null); // 못 찾음 기억 (이 인스턴스 내 재조회 방지)
      }
    }
  }

  // 4) 신규 코드 Supabase에 영구 저장 (테이블 없으면 조용히 실패)
  if (supabase && toUpsert.length) {
    try {
      await supabase.from('stock_codes').upsert(toUpsert, { onConflict: 'name' });
    } catch {
      /* 무시 */
    }
  }

  return out;
}
