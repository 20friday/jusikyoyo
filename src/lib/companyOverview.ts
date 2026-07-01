/**
 * 기업개요(회사 소개) 가져오기
 *
 * 큐레이션된 소개(stockInfo.desc)가 없는 종목을 위해, 네이버 종목분석이 쓰는
 * 데이터 제공처 FnGuide(WISEreport)의 "기업개요" 불릿을 받아온다.
 *
 * 비공식 스크래핑이라 언제든 막힐 수 있다 → 타임아웃 + 실패 시 null(문구 숨김),
 * 종목코드 단위 메모리 캐시로 반복 조회를 줄인다. 기업개요는 자주 바뀌지 않아 하루 캐시.
 */
const UA = 'Mozilla/5.0';
const URL = 'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

const cache = new Map<string, { at: number; text: string | null }>();

function extract(html: string): string | null {
  // <div class="cmp_comment"> 안의 <li class="dot_cmp">…</li> 불릿들을 이어붙인다.
  const block = html.match(/<div class="cmp_comment">([\s\S]*?)<\/div>/);
  if (!block) return null;
  const bullets = [...block[1].matchAll(/<li[^>]*class="dot_cmp"[^>]*>([\s\S]*?)<\/li>/g)]
    .map(m =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  const text = bullets.join(' ').trim();
  return text.length >= 20 ? text : null;
}

export async function getCompanyOverview(code: string, ms = 4000): Promise<string | null> {
  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.text;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let text: string | null = null;
  try {
    const res = await fetch(`${URL}?cmp_cd=${code}`, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Referer': 'https://finance.naver.com/' },
    });
    if (res.ok) text = extract(await res.text());
  } catch {
    text = null;
  } finally {
    clearTimeout(timer);
  }

  cache.set(code, { at: Date.now(), text });
  return text;
}
