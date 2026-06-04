/**
 * 방송 코멘트 뉘앙스 분석 (Claude API)
 * 종목별 방송 notes를 읽고 긍정/중립/주의 판단
 */
import Anthropic from '@anthropic-ai/sdk';

export type Status = 'pos' | 'neu' | 'warn';

export interface SentimentResult {
  name: string;
  status: Status;
  reason: string; // 한 줄 이유
}

/**
 * 여러 종목의 방송 코멘트를 한 번에 분석 (비용 절감)
 */
export async function analyzeStockSentiments(
  stocks: Array<{ name: string; notes: Array<{ show: string; view: string }> }>
): Promise<Map<string, SentimentResult>> {

  if (stocks.length === 0) return new Map();

  const apiKey = process.env.ANTHROPIC_API_KEY ?? import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Map();

  const client = new Anthropic({ apiKey });

  // 종목별 코멘트 정리
  const stockTexts = stocks.map(s => {
    const comments = s.notes.map(n => `[${n.show}] ${n.view}`).join('\n');
    return `종목: ${s.name}\n${comments}`;
  }).join('\n\n---\n\n');

  const prompt = `다음은 오늘 주식 방송에서 각 종목에 대해 한 코멘트예요.
각 종목의 방송 뉘앙스를 분석해서 아래 기준으로 판단해주세요.

판단 기준:
- pos(긍정): 방송에서 전반적으로 긍정적으로 다루거나, 매수/관심 추천 뉘앙스
- neu(중립): 긍정도 부정도 아님. "기다려라", "확인 필요", 전략적 관망 등
- warn(주의): 리스크 강조, 차익실현 언급, 단기 과열 경고, 부정적 전망

주의: 단순히 "급등"이라는 단어가 있어도 문맥이 긍정적이면 pos로 판단하세요.

아래 종목들을 분석해주세요:

${stockTexts}

반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트 없이:
[{"name":"종목명","status":"pos|neu|warn","reason":"판단 이유를 ~해요 체로 15자 이내 한 줄"},...]`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    // 마크다운 코드블록 제거
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const results: SentimentResult[] = JSON.parse(text);

    const map = new Map<string, SentimentResult>();
    for (const r of results) {
      if (r.name && ['pos', 'neu', 'warn'].includes(r.status)) {
        map.set(r.name, { name: r.name, status: r.status, reason: r.reason ?? '' });
      }
    }
    return map;
  } catch (e: any) {
    console.error('[sentiment] 분석 실패:', e?.message ?? String(e));
    // 에러를 다시 던져서 호출자가 처리하도록
    throw e;
  }
}
