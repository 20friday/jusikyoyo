import { describe, it, expect } from 'vitest';
import { resolveDisplayTone, snippetFor } from './stockRanking';

// 방송언급 스니펫: 본문 형식이 "**종목명.** 설명…" 라벨일 때,
// 이름만 남기지 말고 뒤에 오는 설명 문장을 뽑아야 한다.
describe('snippetFor — 라벨 형식 본문', () => {
  it('**현대차.** 라벨이면 이름이 아니라 설명 문장을 뽑는다', () => {
    const content =
      '**현대차.** 반도체가 무너지는 와중에 1.7% 하락에 그치며 상대적으로 잘 버텼어요. 지수가 특정 업종에 휘둘릴 때 방어적으로 움직인 종목이에요.';
    const v = snippetFor(content, '현대차');
    expect(v).not.toBe('현대차.');
    expect(v).toContain('1.7% 하락');
  });

  it('설명 문장에 이름이 있으면 그 문장을 뽑는다 (기존 동작 유지)', () => {
    const content = '삼성전자가 엔비디아 납품 기대에 3% 올랐어요. 반도체 대장주로서 시장을 이끌었어요.';
    expect(snippetFor(content, '삼성전자')).toContain('엔비디아');
  });

  it('이름이 없으면 빈 문자열', () => {
    expect(snippetFor('오늘은 반도체가 강했어요.', '현대차')).toBe('');
  });

  it('시황 언급과 전용 라벨 블록이 함께 있으면 전용 블록 설명을 쓴다', () => {
    const content =
      '**자동차 - 조정.** 현대차와 기아가 소폭 약세로 쉬어갔어요.\n\n**현대차.** 50만 원 아래에서는 매력적이라는 평가예요. 55만 원 저항 돌파를 확인해야 해요.';
    const v = snippetFor(content, '현대차');
    expect(v).toContain('50만 원 아래');
    expect(v).not.toContain('소폭 약세');
    expect(v.endsWith('현대차.')).toBe(false); // 꼬리 라벨 안 붙음
  });
});

// 표시 톤 = 일간 태그와 2주 방송 흐름 중 더 보수적인 쪽.
// (심각도: 주의 0 < 중립 1 < 긍정 2)
describe('resolveDisplayTone — 보수적 톤 우선', () => {
  it.each([
    // [일간, 2주흐름, 기대 표시]
    ['pos', 'watch', 'warn'],       // 긍정 vs 주의 → 주의
    ['pos', 'neutral', 'neu'],      // 긍정 vs 중립 → 중립
    ['pos', 'good', 'pos'],         // 긍정 vs 긍정 → 긍정
    ['neu', 'watch', 'warn'],       // 중립 vs 주의 → 주의 (한화오션)
    ['warn', 'good', 'warn'],       // 주의 vs 긍정 → 주의 (한미반도체)
  ] as const)('(%s, %s) → %s', (daily, flow, expected) => {
    expect(resolveDisplayTone(daily, flow)).toBe(expected);
  });

  it('단순 언급 + 흐름 주의 → 주의로 승격', () => {
    expect(resolveDisplayTone('mention', 'watch')).toBe('warn');
  });

  it('단순 언급 + 흐름 긍정 → 단순 언급 유지', () => {
    expect(resolveDisplayTone('mention', 'good')).toBe('mention');
  });

  it('흐름 레코드 없음(undefined) → 일간 태그 그대로 (주의 폴백 금지)', () => {
    expect(resolveDisplayTone('pos', undefined)).toBe('pos');
    expect(resolveDisplayTone('pos', null)).toBe('pos');
    expect(resolveDisplayTone('mention', undefined)).toBe('mention');
  });

  it('흐름 톤이 예상 밖 값 → 일간 태그 그대로 (조용히 폴백)', () => {
    expect(resolveDisplayTone('pos', 'unknown')).toBe('pos');
    expect(resolveDisplayTone('mention', 'unknown')).toBe('mention');
  });
});
