-- 내일 시장 예측 + 채점 결과 테이블
-- 방송 분석으로 내일 코스피·코스닥 방향을 예측하고, 실제 종가와 대조해 적중 여부를 쌓는다.
-- 피드 맨 위 "내일 시장 예측" 카드가 이 표를 읽는다.
-- Supabase SQL Editor에 붙여넣어 실행. RLS 없이(공개 콘텐츠, anon 읽기) — market_flow와 동일.
-- 표 생성 시 "Run without RLS" 선택.

create table if not exists public.market_predictions (
  target_date   date primary key,   -- 예측 대상 거래일(내일)
  base_date     date,               -- 분석한 방송일(오늘)
  kospi_dir     text,               -- up | down (코스피 예측 방향)
  kosdaq_dir    text,               -- up | down (코스닥 예측 방향)
  reason        text,               -- 예측 근거 한 줄
  kospi_close   numeric,            -- 채점 후 실제 종가
  kospi_change  numeric,            -- 전일 대비 등락(부호로 상승/하락 판정)
  kosdaq_close  numeric,
  kosdaq_change numeric,
  kospi_hit     boolean,            -- 적중 여부
  kosdaq_hit    boolean,
  scored_at     timestamptz,        -- 채점 시각(NULL이면 미채점)
  created_at    timestamptz default now()
);
