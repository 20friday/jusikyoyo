/**
 * 방송 코멘트 뉘앙스 분석 (Claude API)
 * 종목별 방송 notes를 읽고 긍정/중립/주의 판단
 */
import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';

export type Status = 'pos' | 'neu' | 'warn';

export interface SentimentResult {
  name: string;
  status: Status;
  intensity: number; // 1~5 이슈 강도
  reason: string; // 한 줄 이유
}

/**
 * 여러 종목의 방송 코멘트를 한 번에 분석 (비용 절감)
 */
export async function analyzeStockSentiments(
  stocks: Array<{ name: string; notes: Array<{ show: string; view: string }> }>,
  apiKey?: string
): Promise<Map<string, SentimentResult>> {

  if (stocks.length === 0) return new Map();
  if (!apiKey) apiKey = import.meta.env.ANTHROPIC_API_KEY;

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 없음');

  const client = new Anthropic({ apiKey });

  // 종목별 코멘트 정리
  const stockTexts = stocks.map(s => {
    const comments = s.notes.map(n => `[${n.show}] ${n.view}`).join('\n');
    return `종목: ${s.name}\n${comments}`;
  }).join('\n\n---\n\n');

  const prompt = `다음은 오늘 주식 방송에서 각 종목에 대해 한 코멘트예요.
각 종목의 방송 뉘앙스를 분석해서 아래 기준으로 판단해주세요.

status 기준:
- pos: 긍정적 재료, 상승 기대, 실적 개선, 수급 개선, 정책 수혜 등이 중심인 경우
- neu: 단순 언급, 방향성이 불분명하거나 관망 필요한 경우
- warn: 악재, 단기 과열, 차익실현, 실적 부진, 수급 이탈, 리스크가 중심인 경우
주의: 단순히 "급등"이라는 단어가 있어도 문맥이 긍정적이면 pos로 판단하세요.

intensity 기준 (1~5):
- 1: 단순 언급 (종목명이 지나가듯 언급됨)
- 2: 섹터 흐름 안에서 짧게 언급
- 3: 개별 종목 이슈나 수급 설명이 있음
- 4: 주가 변동 원인, 기대감, 리스크가 명확히 설명됨
- 5: 오늘 시장의 핵심 종목으로 반복 분석됨

아래 종목들을 분석해주세요:

${stockTexts}

반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트 없이:
[{"name":"종목명","status":"pos|neu|warn","intensity":1~5,"reason":"판단 이유를 ~해요 체로 20자 이내 한 줄"},...]`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    // 마크다운 코드블록 제거
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const results: SentimentResult[] = JSON.parse(text);

    const map = new Map<string, SentimentResult>();
    for (const r of results) {
      if (r.name && ['pos', 'neu', 'warn'].includes(r.status)) {
        const intensity = Math.min(Math.max(Math.round(Number(r.intensity) || 1), 1), 5);
        map.set(r.name, { name: r.name, status: r.status, intensity, reason: r.reason ?? '' });
      }
    }
    return map;
  } catch (e: any) {
    console.error('[sentiment] 분석 실패:', e?.message ?? String(e));
    // 에러를 다시 던져서 호출자가 처리하도록
    throw e;
  }
}
