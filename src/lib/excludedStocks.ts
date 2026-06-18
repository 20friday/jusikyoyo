/**
 * 종목 랭킹 제외 규칙 — 한국 단일 상장 종목만 순위에 남긴다.
 *
 * 제외 대상:
 *  1) 이름에 가운뎃점('·')이 들어간 묶음/테마 라벨 (예: "한화에어로스페이스·KAI")
 *  2) 해외/비상장 종목 — 아래 EXCLUDED_KEYWORDS를 포함하는 이름 (부분일치)
 *     (예: "엔비디아", "엔비디아(회사채)", "스페이스X")
 *
 * 새 해외 종목이 방송에 나오면 EXCLUDED_KEYWORDS에만 추가하면 된다.
 */
export const EXCLUDED_KEYWORDS: string[] = [
  '엔비디아',
  '스페이스X',
];

export function isExcludedStock(name: string): boolean {
  if (!name) return true;
  if (name.includes('·')) return true; // 묶음/테마 라벨
  return EXCLUDED_KEYWORDS.some(kw => name.includes(kw));
}
