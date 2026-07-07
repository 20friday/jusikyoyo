-- 시장 전체 "지금 흐름" 예측 테이블
-- 메인 피드 맨 위에, 그날 시장이 어느 쪽으로 도는지(반도체 주춤·내수 유입 등)를
-- 한 줄 예측 + 섹터 방향 + "지속/전환" 배지로 보여줄 재료를 저장해요.
-- 매일 갱신하되, 흐름이 실제로 바뀐 날만 status='shift'(전환)로 표시해요.
-- Supabase SQL Editor에 그대로 붙여넣어 실행하면 돼요.
-- 등록 스크립트는 서비스롤 키로 접근하므로 RLS 정책은 필요 없어요.

create table if not exists public.market_flow (
  date       date primary key,   -- 흐름 기준일 (YYYY-MM-DD, 하루 1개)
  status     text,               -- continue(같은 흐름 이어짐) | shift(오늘 흐름 전환)
  streak     int default 1,      -- 같은 흐름 며칠째인지 (전환이면 1로 리셋)
  tone       text,               -- good(위험선호·붉은톤) | watch(위험회피·파란톤) | neutral(혼조·노란톤)
  headline   text,               -- 후킹 한 줄 (예: "돈은 내수·방산으로 도는 중이에요")
  body       text,               -- 짧은 문단 (친구에게 설명하듯 3~5문장, 방향 예측 포함)
  sectors    jsonb default '[]'::jsonb, -- [{ "name":"반도체", "dir":"down", "label":"주춤" }]
  updated_at timestamptz default now()
);

-- dir: up(자금 유입·강세) | down(주춤·약세) | neutral(중립·혼조)
