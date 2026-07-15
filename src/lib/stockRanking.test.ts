import { describe, it, expect } from 'vitest';
import { snippetFor, mentionsStock } from './stockRanking';

// 짧은 종목명이 다른 단어에 박힌 substring은 '언급'이 아니다.
describe('mentionsStock — 단어 경계', () => {
  it('일반 단어 속 substring은 언급 아님', () => {
    expect(mentionsStock('물가가 예상보다 높아요.', '상보')).toBe(false);   // 예"상보"다
    expect(mentionsStock('구글 TPU 기반 AI 인프라예요.', 'TP')).toBe(false); // "TP"U
    expect(mentionsStock('엔캐리 트레이드를 봐야 해요.', '캐리')).toBe(false); // 엔"캐리"
    expect(mentionsStock('SK하이닉스가 올랐어요.', '이닉스')).toBe(false);    // 하"이닉스"
  });
  it('독립 토큰(조사 붙어도) 언급으로 인정', () => {
    expect(mentionsStock('상보가 강세였어요.', '상보')).toBe(true);
    expect(mentionsStock('STX엔진은 방산주예요.', 'STX엔진')).toBe(true);
    expect(mentionsStock('네이처셀이 급등했어요.', '네이처셀')).toBe(true);
  });
  it('더 긴 다른 종목명 안의 substring은 언급 아님', () => {
    expect(mentionsStock('SK하이닉스와 SK스퀘어가 강해요.', 'SK')).toBe(false);
    expect(mentionsStock('SK가 지주사로 부각됐어요.', 'SK')).toBe(true);
  });
});

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

  it('설명형 헤더(**현대차 - …**)도 전용 블록으로 인식', () => {
    const content = '**현대차 - 로봇 기대.** 보스턴다이내믹스 인수로 로봇 사업을 직접 끌고 가요.';
    expect(snippetFor(content, '현대차')).toContain('보스턴다이내믹스');
  });
});

// 다른 종목 블록에서 비교 대상으로만 스친 문장은 그 종목 얘기가 아니다.
describe('snippetFor — 비교 언급 제외', () => {
  it('전용 블록 없이 "현대차보다"로만 나오면 뽑지 않는다 (기아 블록)', () => {
    const content =
      '**기아 - 저평가 매력.** PER 7배 초반에 현대차보다 크게 할인된 자리예요. 국내·유럽 판매가 현대차보다 좋았고 로보틱스 모멘텀까지 더해졌어요.';
    expect(snippetFor(content, '현대차')).toBe('');
  });

  it('현대차가 주체인 문장은 그대로 뽑는다', () => {
    const content =
      '**자동차.** 기아는 PER 6배로 싸고, 현대차는 보스턴다이내믹스 로보틱스가 재평가 포인트로 꼽혔어요.';
    const v = snippetFor(content, '현대차');
    expect(v).toContain('현대차는');
    expect(v).toContain('재평가');
  });

  it('전용 블록이 있으면 다른 블록의 비교 문장은 무시', () => {
    const content =
      '**기아.** 현대차보다 저평가 매력이 있어요.\n\n**현대차.** 로봇 모멘텀이 중장기 재료로 거론돼요.';
    const v = snippetFor(content, '현대차');
    expect(v).toContain('로봇 모멘텀');
    expect(v).not.toContain('저평가');
  });

  it('현대차증권 같은 다른 상장사 문장은 현대차로 뽑지 않는다', () => {
    const content = '반면 현대차증권은 목표주가 44만 원을 유지했어요.';
    expect(snippetFor(content, '현대차')).toBe('');
  });

  it('현대차그룹처럼 상장사가 아닌 표현은 현대차 언급으로 인정', () => {
    const content = '현대차그룹이 보스턴다이내믹스를 100% 자회사로 만들 예정이에요.';
    expect(snippetFor(content, '현대차')).toContain('보스턴다이내믹스');
  });
});

// 초기 글의 ::stock{...} 지시문은 스니펫에 날것으로 새지 않아야 한다.
describe('snippetFor — 인라인 지시문 제거', () => {
  it('지시문 뒤 설명이 있으면 설명만 뽑는다', () => {
    const content =
      '::stock{name="한화오션" dir="up"}\n- **한화오션** — 잠수함 등 방산 영역에서 강점이 있는 회사예요.';
    const v = snippetFor(content, '한화오션');
    expect(v).not.toContain('::stock');
    expect(v).not.toMatch(/^-\s/); // 앞머리 목록 기호 없음
    expect(v).toContain('잠수함');
  });

  it('지시문만 있으면 빈 문자열', () => {
    expect(snippetFor('::stock{name="한화오션" dir="up"}', '한화오션')).toBe('');
  });
});

// 전용 블록 본문이 다음 섹션(구분선·인사이트 헤딩)까지 딸려오면 안 된다.
describe('snippetFor — 섹션 경계에서 끊기', () => {
  it('--- 구분선과 ## 인사이트 헤딩은 스니펫에 안 붙는다', () => {
    const content =
      '**한화오션·HD현대중공업**\n\n핵추진 잠수함, 특수선, 방산 기대감이 붙으며 급등했어요.\n\n---\n\n## 💡 오늘의 투자 인사이트\n\n오늘은 조선주가 강했어요.';
    const v = snippetFor(content, '한화오션');
    expect(v).toBe('핵추진 잠수함, 특수선, 방산 기대감이 붙으며 급등했어요.');
    expect(v).not.toContain('인사이트');
    expect(v).not.toContain('---');
  });
});
