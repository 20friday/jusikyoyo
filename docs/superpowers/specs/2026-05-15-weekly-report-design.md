# 주간 PICK 리포트 설계

날짜: 2026-05-15

## 개요

매주 금요일 작성하는 주간 요약 리포트. 일간 PICK 리포트(5개)를 바탕으로 Claude가 작성하고, MD 파일로 저장. 기존 일간 리포트와 동일한 디자인 시스템(카드, 폰트, 색상 토큰) 사용. 모바일 우선.

## URL 구조

- `/weekly/[date]`의 `date`는 해당 주간 리포트의 종료일, 즉 금요일 날짜를 기준으로 한다.
  - 예: `/weekly/2026-05-15`
- `/weekly` → 최신 주간 리포트로 리다이렉트 (목록 페이지 없음)
- 파일 위치: `src/content/weekly_reports/2026-05-15.md`

## 콘텐츠 구조 (8개 섹션)

| 순서 | 섹션명 | 설명 |
|------|--------|------|
| 1 | 주간 한 줄 요약 | 히어로 헤드라인. `headline` 필드 값을 그대로 사용 |
| 2 | 주간 인사이트 | 한 주를 관통하는 시장 흐름 코멘트. `insight` 배열 |
| 3 | 이번 주 반복 언급 섹터 | 섹터명 + 한 줄 흐름 요약 |
| 4 | 이번 주 공통 언급 종목 | 랭킹 리스트 (#1, #2 …) + 언급 일수 |
| 5 | 여러 방송에서 관점이 갈린 종목 | 종목명 + "A vs. B" 형식 |
| 6 | 이번 주 전문가들이 갈린 지점 | 굵은 글씨 강조 포함 자유 서술 |
| 7 | 다음 주까지 이어서 봐야 할 종목 | 오렌지 칩 배지 (이름만 표시, reason은 데이터로 보관) |
| 8 | 다음 주 체크 포인트 | 오렌지 dot bullet 리스트 |

## 프론트매터 스키마

```yaml
---
date: "2026-05-15"           # 주간 종료일인 금요일 날짜 (URL 기준)
period: "2026-05-11 – 05-15" # 표시용 기간 문자열 (월~금)
headline: "..."              # 히어로 메인 제목 = 섹션 1 '주간 한 줄 요약'으로 사용

insight:                     # 주간 인사이트. 문단 배열로 관리 (모바일 가독성)
  - "이번 주는 반도체가 쉬어도 시장은 무너지지 않았어요."
  - "코스피 8,000을 찍었지만 반도체 대신 로봇·조선·증권·소비주가 받쳤어요."

sectors:
  - name: "반도체"
    flow: "계속 중심"

stocks:                      # 공통 언급 종목 랭킹. days는 언급 일수(최대 5)
  - name: "삼성전자"
    days: 5
    reason: "파업 리스크와 AI 수혜 기대가 함께 언급"

splits:                      # 방송 간 관점이 갈린 종목
  - name: "삼성전자"
    desc: "파업 리스크 vs. AI 수혜"

gaps:                        # 전문가들이 갈린 지점. <strong> 태그만 허용
  - "반도체는 계속 간다는 의견은 같지만, <strong>삼성전자냐 SK하이닉스냐</strong>는 갈림"

watchlist:                   # 다음 주 이어서 봐야 할 종목. UI엔 name만 칩으로 표시
  - name: "삼성전자"
    reason: "파업 이슈와 AI 수혜 기대가 동시에 남아 있음"

checkpoints:                 # 다음 주 체크 포인트
  - "삼성전자 파업 이슈 실제 진행 여부"
---
```

### 필드 정의 상세

- **`headline`**: 히어로 영역의 메인 제목이자 섹션 1 '주간 한 줄 요약'으로 사용한다. 한 문장.
- **`insight`**: 문자열 배열. 각 항목을 문단으로 렌더링. 모바일 가독성을 위해 짧게 나눔.
- **`stocks.days`**: 해당 주 5일 중 언급된 일수. 표시 형식: "5일 내내", "4일", "3일" 등.
- **`stocks.reason`**: 현재 UI에는 미사용. 향후 확장(월간 리포트 등)을 위해 보관.
- **`gaps`**: HTML 렌더링 허용. 허용 태그는 `<strong>`만 사용한다.
- **`watchlist.reason`**: 현재 UI에는 미사용(이름만 칩으로 표시). 향후 확장용으로 보관.

## 페이지 구성

### `src/pages/weekly/index.astro`
최신 weekly_report로 리다이렉트. 일간 `src/pages/report/index.astro`와 동일한 패턴.

### `src/pages/weekly/[date].astro`
- `getStaticPaths` → weekly_reports 컬렉션 전체
- 히어로: 기존 `report-hero` 스타일 (다크 그라디언트)
- 각 섹션: 기존 `report-section` + `report-section-label` 카드 스타일
- 폰트 크기: 일간 리포트 동일 — 섹션 라벨 11px uppercase, 본문 17px, 종목명 17px

### `src/content.config.ts`
`weekly_reports` 컬렉션 추가. Zod 스키마로 위 프론트매터 검증.

## 디자인 원칙

- 기존 CSS 클래스 재사용: `report-hero`, `report-section`, `report-section-label`, `sector-row`, `stock-row`
- 신규 클래스 최소화
- 모바일 기준 (max-width 680px, 좌우 padding 12px)

## 콘텐츠 작성 방식

Claude가 해당 주의 일간 리포트 MD 파일 5개(`src/content/reports/`)를 읽고 종합하여 작성. Ted가 "이번 주 리포트 만들어줘" 요청 시 생성 후 MD 파일로 저장.

## 확장 고려사항

- `stocks.reason`, `watchlist.reason`은 현재 UI 미사용이지만 스키마에 optional로 포함
- 월간 리포트, 섹터별 리포트로 확장 시 동일 스키마 패턴 재사용 가능
