/**
 * 종목 "이 주가, 왜 이래?" 분석 (Claude Opus 4.8 + 웹검색)
 *
 * 네이버 현재가·실적 + DART 중요 공시를 컨텍스트로 주고,
 * Claude가 웹검색으로 최근 뉴스·공시 디테일까지 확인해 "왜 이렇게 움직이는지"를 종합한다.
 * 상승/하락을 미리 단정하지 않고, 악재면 그 강도(초대형 악재 vs 찝찝한 부담)를 먼저 가늠해준다.
 *
 * 비용·시간이 드는 호출이라 버튼 클릭 시에만 실행하고 결과는 DB에 캐시한다.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { StockDetail } from './stockDetail';
import type { Disclosure } from './dartDisclosures';

export interface WhyParagraph {
  text: string;
  source?: string; // "DART 공시" | "뉴스" | "실적" 등, 없으면 생략
}

export interface WhyResult {
  severity: 'good' | 'watch' | 'caution'; // good=양호/긍정, watch=부담/혼재, caution=위험
  diagnosis: string;       // 상황 한마디 (예: "찝찝한 공시·실적 부담")
  conclusion: string;      // 1~2문장 결론
  priceLine: string;       // 현재 주가 흐름 한 문장
  paragraphs: WhyParagraph[];
  summary: string[];       // "원인 → 영향" 3~4개
  checkpoints: string;     // 앞으로 확인할 것
}

function buildContext(name: string, detail: StockDetail | null, disclosures: Disclosure[]): string {
  const lines: string[] = [`종목명: ${name}`];

  if (detail?.price) {
    lines.push(`현재가: ${detail.price.current}원 (${detail.price.direction === 'up' ? '+' : detail.price.direction === 'down' ? '-' : ''}${detail.price.change}, ${detail.price.changePct}%, ${detail.price.marketStatus})`);
  }
  if (detail?.consensus?.targetPrice) {
    lines.push(`증권사 목표주가: ${detail.consensus.targetPrice}원, 투자의견: ${detail.consensus.recommLabel}`);
  }
  if (detail?.metrics?.length) {
    lines.push('지표: ' + detail.metrics.map(m => `${m.label} ${m.value}`).join(', '));
  }
  if (detail?.health?.tags?.length) {
    lines.push('실적 건강도: ' + detail.health.tags.map(t => t.text).join(', '));
  }

  if (disclosures.length) {
    lines.push('\n최근 DART 공시 (최신순):');
    for (const d of disclosures) lines.push(`- ${d.date} ${d.title}`);
  } else {
    lines.push('\n최근 DART 공시: 특이사항 없음');
  }
  return lines.join('\n');
}

const SYSTEM = `당신은 한국 주식 투자자에게 "이 종목이 요즘 왜 이렇게 움직이는지"를 친구처럼 쉽고 정확하게 설명하는 분석가예요.

분석 원칙:
- 상승/하락을 미리 단정하지 말 것. 실제 주가 흐름을 먼저 확인한 뒤 그 원인을 뉴스·공시·실적·수급으로 파악한다.
- 실적 기반 움직임인지, 테마/뉴스 기반인지, 수급 기반인지 구분한다.
- 악재가 있어도 강도를 구분한다: 상장폐지·거래정지·감사의견 거절·횡령·배임 같은 "초대형 악재"인지, 아니면 주가를 누르는 "찝찝한 공시·실적 부담" 수준인지.
- 호재도 마찬가지로 강도를 본다: 대규모 수주·실적 서프라이즈 같은 강한 호재인지, 단순 테마 기대감인지.

글쓰기 규칙:
- 반드시 '~해요', '~이에요' 체. '~합니다/~입니다' 절대 금지.
- 친구가 옆에서 풀어 설명하듯 자연스럽게. 구체적인 숫자·날짜·금액을 본문에 녹일 것.
- 매수·매도 권유나 단정 금지. "관심 가능", "확인 필요" 같은 상태 중심 표현.
- 본문에 물결표(~)를 쓰지 말 것. 범위는 하이픈(-)으로. (예: "2,800-2,900원")`;

function buildPrompt(name: string, context: string): string {
  return `${context}

위 종목 "${name}"이 요즘 왜 이렇게 움직이는지 분석해주세요.

먼저 web_search로 최근 1개월 주가 흐름과 그 원인을 조사하세요. ("${name} 주가", "${name} 공시", "${name} 실적", "${name} 뉴스" 등으로 검색)
DART 공시 목록에 단서가 있으면 그 공시의 실제 내용(금액·날짜·계약 상대 등)을 웹에서 더 확인하세요.

조사가 끝나면 아래 JSON 형식으로만 출력하세요. JSON 앞뒤로 다른 텍스트를 절대 붙이지 마세요.

{
  "severity": "good | watch | caution 중 하나. good=실적·수급이 받쳐주는 양호한 흐름, watch=긍정·부담이 혼재하거나 찝찝한 부담, caution=실적 악화·중대 악재 등 위험",
  "diagnosis": "지금 상황을 한마디로. 예: '찝찝한 공시·실적 부담' / '실적이 받쳐주는 상승' / '테마 기대감에 오른 뒤 조정'",
  "conclusion": "1~2문장 결론. 악재라면 '나쁜 재료가 있긴 있어요. 다만 상폐·거래정지 같은 초대형 악재는 아니고 ...' 처럼 강도를 먼저 가늠해주는 문장으로 시작할 것",
  "priceLine": "현재 주가 흐름 한 문장. 현재가·등락률·고점 대비 위치·거래량 변화 중심",
  "paragraphs": [
    { "text": "움직임의 원인을 풀어쓴 문단 (구체적 숫자·날짜 포함)", "source": "DART 공시 | 뉴스 | 실적 중 하나, 없으면 이 필드 생략" }
  ],
  "summary": ["원인 → 영향 형태의 짧은 줄 (예: '계약 납기 연장 → 매출이 뒤로 밀릴 수 있어요')"],
  "checkpoints": "앞으로 무엇을 확인하면 되는지 1~2문장"
}

paragraphs는 2~4개, summary는 3~4개로 작성하세요.`;
}

function extractJson(text: string): WhyResult | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!obj.conclusion || !obj.severity) return null;
    if (!['good', 'watch', 'caution'].includes(obj.severity)) obj.severity = 'watch';
    obj.paragraphs = Array.isArray(obj.paragraphs) ? obj.paragraphs : [];
    obj.summary = Array.isArray(obj.summary) ? obj.summary : [];
    obj.diagnosis = obj.diagnosis ?? '';
    obj.priceLine = obj.priceLine ?? '';
    obj.checkpoints = obj.checkpoints ?? '';
    return obj as WhyResult;
  } catch {
    return null;
  }
}

export async function analyzeWhy(
  name: string,
  detail: StockDetail | null,
  disclosures: Disclosure[],
  apiKey: string
): Promise<WhyResult> {
  const client = new Anthropic({ apiKey });
  const context = buildContext(name, detail, disclosures);
  const prompt = buildPrompt(name, context);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  let response: Anthropic.Message | null = null;

  // 웹검색(서버 도구) 루프: pause_turn이면 이어서 재요청
  for (let i = 0; i < 4; i++) {
    response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages,
    });
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
    } else {
      break;
    }
  }

  const text = (response?.content ?? [])
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  const result = extractJson(text);
  if (!result) throw new Error('분석 결과를 해석하지 못했어요');
  return result;
}
