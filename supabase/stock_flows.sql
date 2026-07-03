-- 종목 "최근 2주 방송 흐름" 요약 테이블
-- 방송언급 탭 맨 위에 후킹 한 줄 + 짧은 문단으로 보여줄 흐름 요약을 저장해요.
-- Supabase SQL Editor에 그대로 붙여넣어 실행하면 돼요.
-- 등록 스크립트는 서비스롤 키로 접근하므로 RLS 정책은 필요 없어요.

create table if not exists public.stock_flows (
  name       text primary key,   -- 종목명 (정식명 canonical 기준)
  tone       text,               -- 흐름 톤: good | watch | neutral (후킹 문구 색상)
  headline   text,               -- 후킹 한 줄 (예: "흐름 좋아요!", "주의가 필요하겠는데요")
  body       text,               -- 짧은 문단 (친구에게 설명하듯 4~5문장)
  updated_at timestamptz default now()
);
