# 내일 시장 예측 (Tomorrow Market Prediction) — 설계

작성일: 2026-07-07

## 한 줄 요약
방송 요약을 AI가 분석해 **내일 코스피·코스닥의 상승/하락을 예측**하고, 실제 지수 종가와 대조해 **누적 적중률(승률)** 을 쌓아 보여주는 기능. 피드(방송요약 탭) 맨 위에 하이브리드 카드로 노출한다. 기존 "지금 시장 흐름" 카드는 유지하고, 그 **위에** 새로 추가한다.

## 핵심 가치
- **재미** — "내일은 상승 예상!" 날씨 예보 같은 후킹.
- **신뢰도의 계량화** — 예측이 쌓일수록 적중률이 자동 갱신돼, 이 예측을 얼마나 믿을지 수치로 판단 가능.

## 준법 프레이밍
- 개별 종목이 아닌 **지수(시장) 방향** 예측이며, 매수·매도 권유가 아니다.
- 카드 하단에 안내 문구 고정: "AI가 방송을 분석한 재미 예측이에요. 투자 판단은 스스로 해요."
- 이유(reason)는 [[tedpick-summary-criteria]] 준수 — 실명 금지, 시장 해설로 재구성, 방송에 없는 내용 추가 금지.

---

## 데이터 모델 — `market_predictions` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| target_date | date PK | 예측 대상 거래일(내일) |
| base_date | date | 분석한 방송일(오늘) |
| kospi_dir | text | up / down |
| kosdaq_dir | text | up / down |
| reason | text | 예측 근거 한 줄 |
| kospi_close | numeric | 채점 후 실제 종가 |
| kospi_change | numeric | 전일 대비 등락(부호로 상승/하락 판정) |
| kosdaq_close | numeric | |
| kosdaq_change | numeric | |
| kospi_hit | boolean | 채점 결과(적중 여부) |
| kosdaq_hit | boolean | |
| scored_at | timestamptz | 채점 시각(NULL이면 미채점) |
| created_at | timestamptz | 기본값 now() |

- RLS 없이 생성(공개 콘텐츠, 사이트는 anon 키로 읽음) — `market_flow`와 동일.
- SQL 파일: `supabase/market_predictions.sql`.

### 판정 규칙
- 등락 부호로 판정: `change > 0` → 실제 상승, `change < 0` → 실제 하락, `change == 0`(보합) → 상승으로 간주(관례).
- `hit = (예측 방향 == 실제 방향)`.

### 승률·표시 계산 (렌더 시)
- scored된 모든 행에서 kospi_hit·kosdaq_hit를 각각 1건으로 카운트.
- **적중률 = 적중 건수 / 채점된 총 건수** (코스피+코스닥 합산, Ted 결정). 큰 숫자 하나로 표시.
- **적중 점 표기 = 코스피·코스닥 두 줄**, 각 지수의 최근 8회를 시간순으로. **적중 = 꽉 찬 점 / 실패 = 회색 빈 점** 한 가지 색으로만 구분하고, 지수 구분은 왼쪽 줄 이름표로 한다.
  - 색 관례 충돌 방지: 빨강(상승)·파랑(하락)은 날씨 타일에서만 쓰고, 점은 상승/하락이 아니라 순수하게 맞았나/틀렸나만 나타낸다.

---

## 작동 흐름 — `scripts/market-prediction.mjs`

기존 `stock-flows.mjs` / `market-flow.mjs`와 동일한 `gather → (Claude 작성) → save` 패턴. 매일 오늘의 픽 등록 워크플로우에 **채점 + 예측** 두 단계를 추가한다.

### 1) `score` — 어제 예측 채점 (먼저)
- `scored_at IS NULL` 이고 `target_date <= 오늘(KST)` 인 행을 찾는다.
- **당일 채점(기본):** `target_date == 오늘`이면 네이버 지수 API 현재가로 종가·등락을 읽는다.
  - `https://m.stock.naver.com/api/index/KOSPI/basic`, `.../KOSDAQ/basic`
  - `closePrice`, `compareToPreviousClosePrice` 사용.
- **과거 채점(백필):** `target_date < 오늘`이면 야후 파이낸스 일봉(`src/lib/yahooFinance.ts` 방식, 심볼 `^KS11`/`^KQ11`)에서 해당 날짜 종가·전일 대비를 읽는다.
- 읽은 값으로 close/change/hit/scored_at 채우고 upsert.

### 2) `gather` → Claude 작성 → `save` — 내일 예측 (다음)
- `gather` 출력: 최근 방송 시장 요약·섹터 흐름(`daily_reports`), 현재 코스피·코스닥 지수 레벨, 아직 채점 안 된 과거 예측 목록.
- Claude가 재료를 읽고 `prediction.json` 작성:
  ```json
  {
    "base_date": "2026-07-06",
    "target_date": "2026-07-07",
    "kospi_dir": "up",
    "kosdaq_dir": "down",
    "reason": "반도체가 숨 고르는 사이 실적 좋은 대형주로 온기가 옮겨가고 있어요. 코스피는 강보합, 중소형 중심 코스닥은 눌릴 수 있어요."
  }
  ```
- `save prediction.json`: 값 검증(dir는 up/down만) 후 upsert.
- `target_date` 생략 시 base_date의 다음 평일로 자동 계산. 공휴일은 드무니 그런 날은 Claude가 명시적으로 지정(휴장일 판단은 `src/lib/marketHoliday.ts` 참고).

---

## UI — 하이브리드 카드 (안 C 뼈대 + 안 A 날씨 아이콘)

위치: `src/pages/index.astro` 피드 인트로 바로 아래, **지금 시장 흐름 카드 위**. 방송요약 탭에서만 노출. 예측 데이터 없으면 카드 자동 숨김. 기존 `.mflow` 카드와 같은 디자인 토큰(`--card`, `--border`, `--text-*`) 사용.

구성(위→아래):
1. 헤더: `✨ AI의 내일 시장 예측` + `{base_date} 방송 기준`
2. 날씨 타일 2개(코스피/코스닥): 상승=해(붉은톤)·하락=비(파란톤) 아이콘 + "상승/하락 예상"
3. 이유 한 줄
4. 구분선 아래: **지금까지 적중률** 게이지 + 큰 숫자(%). 그 아래 코스피·코스닥 **두 줄 적중 점**(각 최근 8회, 적중=꽉 찬 점·실패=회색 빈 점, 줄 이름표로 지수 구분)
5. 안내 문구: "AI가 방송을 분석한 재미 예측이에요. 투자 판단은 스스로 해요."

색상 관례: 빨강=상승, 파랑=하락(한국 증시 관례, 기존 `.mflow` 섹터 칩과 동일).

렌더 방식: 기존 "지금 시장 흐름"과 동일하게 `index.astro` 프론트매터에서 조회 후 인라인 마크업. (두 카드로 커지면 이후 컴포넌트 추출 고려.)

---

## 범위 밖 (YAGNI)
- 예측 신뢰도(이번 예측만의 confidence %) — 지금은 누적 적중률만. 나중에 추가 가능.
- 지수별 개별 적중률 — 지금은 합산 하나. (테이블에 지수별 hit이 있으니 나중에 분리 가능.)
- 예측 히스토리 전용 페이지·달력 뷰 — 지금은 카드의 "최근 10회 점"으로 충분.
- 등락 폭(몇 %) 예측 — 방향만.

## 파일 요약
- 신규: `supabase/market_predictions.sql`, `scripts/market-prediction.mjs`
- 수정: `src/pages/index.astro`(카드 + 조회), `CLAUDE.md`(워크플로우 문서)
- 재사용: `src/lib/yahooFinance.ts`(지수 일봉), 네이버 지수 API
