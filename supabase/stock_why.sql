-- 종목 "이 주가, 왜 이래?" 분석 결과 캐시 테이블
-- Supabase SQL Editor에 그대로 붙여넣어 실행하면 돼요.
-- API(src/pages/api/stock-why.ts)는 서비스롤 키로 접근하므로 RLS 정책은 필요 없어요.

create table if not exists public.stock_why (
  code       text primary key,   -- 종목코드 6자리 (예: 005930)
  name       text,               -- 종목명
  result     jsonb,              -- 분석 결과(JSON)
  updated_at timestamptz default now()
);
