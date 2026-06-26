// 금융 용어 사전 — 본문에 등장할 때마다 자동으로 설명 추가
// 제목 태그(h1~h4) 안에는 적용하지 않음
export const GLOSSARY: Record<string, string> = {
  ADR: '미국주식예탁증서',
};

/**
 * HTML 문자열에서 제목 태그 밖의 텍스트 노드에만 용어 설명을 삽입한다.
 * "ADR" → "ADR(미국주식예탁증서)" 형태로 변환.
 * 이미 괄호 설명이 붙어있는 경우(ADR(...))는 건드리지 않는다.
 */
export function applyGlossary(html: string): string {
  let result = html;

  for (const [term, desc] of Object.entries(GLOSSARY)) {
    // 제목 태그(h1~h4) 안의 내용을 임시 치환해 보호
    const headingPlaceholders: string[] = [];
    result = result.replace(
      /(<h[1-4][^>]*>)([\s\S]*?)(<\/h[1-4]>)/gi,
      (match) => {
        const idx = headingPlaceholders.length;
        headingPlaceholders.push(match);
        return `\x00HEADING${idx}\x00`;
      }
    );

    // 이미 설명이 붙은 경우(term(...))는 건드리지 않고, 나머지만 치환
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`${escaped}(?!\\([^)]*\\))`, 'g'),
      `${term}(${desc})`
    );

    // 제목 복원
    result = result.replace(/\x00HEADING(\d+)\x00/g, (_, i) => headingPlaceholders[Number(i)]);
  }

  return result;
}
