import { describe, it, expect } from 'vitest';
import { snippetFor } from './stockRanking';

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
