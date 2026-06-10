-- 종목명 → 종목코드/시장 영구 캐시 테이블
-- 한 번만 Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다.
-- (이 테이블이 없어도 서비스는 동작하지만, 매번 네이버에서 다시 조회합니다.
--  테이블을 만들면 한 번 찾은 코드를 영구 저장해 재조회를 줄입니다.)

create table if not exists public.stock_codes (
  name        text primary key,                 -- 종목명 (예: 삼성전자)
  code        text not null,                     -- 6자리 종목코드 (예: 005930)
  market      text not null default 'KOSPI',     -- KOSPI | KOSDAQ
  updated_at  timestamptz not null default now()
);

-- 서비스롤(서버)만 접근하므로 RLS는 켜되 정책은 두지 않습니다.
alter table public.stock_codes enable row level security;
