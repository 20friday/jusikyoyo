/**
 * DART 전자공시 최근 공시 조회 (종목 "왜 이래?" 분석용)
 *
 * 종목코드(6자리) → DART 고유번호(corp_code) 매핑 후 최근 N개월 공시 목록을 받아,
 * 주가에 영향을 주는 "중요 공시"만 걸러서 돌려준다.
 * (임원 소유변동·IR개최·지속가능경영보고서 같은 노이즈 공시는 제외)
 *
 * 키는 .env의 DART_API_KEY. 매핑은 src/data/dartCorpCode.json (상장 종목 전체).
 */
import corpMap from '../data/dartCorpCode.json';

export interface Disclosure {
  date: string;   // YYYY-MM-DD
  title: string;  // 공시 제목
}

// 주가에 의미 있는 공시 키워드 (이것들만 통과)
const KEEP = [
  /공급계약/, /수주/, /계약/,                       // 수주·계약
  /유상증자/, /무상증자/, /전환사채/, /신주인수권/, /교환사채/, /증권발행/, // 자금조달
  /실적/, /손익구조/, /분기보고서/, /반기보고서/, /사업보고서/,  // 실적
  /최대주주/, /주식양수도/, /타법인/, /합병/, /분할/,            // 지배구조·M&A
  /소송/, /횡령/, /배임/,                            // 법적 리스크
  /감자/, /자기주식/, /자사주/,                       // 주식 변동
  /거래정지/, /상장폐지/, /관리종목/, /불성실공시/, /영업정지/, /감사의견/, // 중대 악재
  /해명/, /투자판단/, /신규시설/, /투자/,             // 해명·투자
];

// 명백한 노이즈 (KEEP에 걸려도 제외)
const DROP = [/임원ㆍ주요주주/, /임원·주요주주/, /대량보유상황/, /지속가능경영/, /기업설명회/];

function fmtDate(d: string): string {
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export async function getDisclosures(code: string, months = 3): Promise<Disclosure[]> {
  const key = import.meta.env.DART_API_KEY;
  if (!key) return [];

  const corp = (corpMap as Record<string, string>)[code];
  if (!corp) return [];

  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const bgn = from.toISOString().slice(0, 10).replace(/-/g, '');

  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&corp_code=${corp}&bgn_de=${bgn}&page_count=100`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== '000' || !Array.isArray(data.list)) return [];

    const seen = new Set<string>();
    const out: Disclosure[] = [];
    for (const item of data.list) {
      const title = String(item.report_nm ?? '').trim();
      if (!title) continue;
      if (DROP.some(re => re.test(title))) continue;
      if (!KEEP.some(re => re.test(title))) continue;

      const date = String(item.rcept_dt ?? '');
      const dedupeKey = date + title.replace(/\s/g, '');
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({ date: fmtDate(date), title });
      if (out.length >= 15) break;
    }
    return out;
  } catch {
    return [];
  }
}
