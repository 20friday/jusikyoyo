# 문의하기 기능 설계

**날짜:** 2026-05-21  
**상태:** 승인됨

---

## 개요

테드픽 로그인 회원이 서비스 문의 또는 콘텐츠 제안을 보낼 수 있는 문의하기 기능을 만든다. 제출 시 Supabase에 저장되고, Resend API를 통해 운영자 이메일로 알림이 발송된다. 어드민 페이지에서 목록을 관리할 수 있다.

---

## 접근 방식

- 로그인 회원만 문의 가능 (미로그인 시 `/login`으로 리다이렉트)
- 이메일은 세션에서 자동으로 가져와 읽기 전용으로 표시
- 심플 단일 폼 레이아웃 (드롭다운으로 문의 유형 선택)
- 제출 시 Supabase 저장 + Resend 이메일 알림 동시 처리

---

## 페이지 & 라우트

| 경로 | 설명 | 접근 |
|---|---|---|
| `/contact` | 문의 폼 | 로그인 회원 |
| `/api/contact` | POST 제출 엔드포인트 | 로그인 회원 |
| `/admin/contacts` | 문의 목록 관리 | 어드민 |

---

## Supabase 테이블: `inquiries`

```sql
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email text not null,
  type text not null check (type in ('service', 'content')),
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- RLS: 어드민만 읽기, 로그인 유저는 본인 데이터 insert만 허용
alter table inquiries enable row level security;

create policy "users can insert own inquiries"
  on inquiries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "admin service role can read all"
  on inquiries for select
  using (true); -- service role key로만 접근
```

---

## 폼 필드

| 필드 | 타입 | 비고 |
|---|---|---|
| 문의 유형 | select | 서비스 문의 / 콘텐츠 제안 |
| 이메일 | text (read-only) | 세션 이메일 자동 입력 |
| 제목 | text | 필수 |
| 내용 | textarea | 필수 |

---

## API 엔드포인트: `POST /api/contact`

**요청 바디:**
```json
{
  "type": "service" | "content",
  "title": "string",
  "content": "string"
}
```

**처리 순서:**
1. 세션 확인 — 미인증 시 401 반환
2. 입력값 검증 — type, title, content 필수
3. Supabase `inquiries` 테이블에 insert (user_id, email은 세션에서)
4. Resend API로 운영자 이메일 발송
5. 성공 응답 반환

**이메일 형식:**
- 수신: `20friday@gmail.com`
- 제목: `[테드픽 문의] {유형 한글명} — {title}`
- 본문: 이메일, 유형, 제목, 내용, 제출 시각

**에러 처리:**
- DB 저장 실패 → 500 반환, 이메일 발송 안 함
- Resend 발송 실패 → DB는 저장됨, 에러 로그만 기록 (사용자에겐 성공으로 표시)

---

## `/contact` 페이지

- 미로그인 접근 시 `/login?next=/contact` 리다이렉트
- 제출 성공 시 "문의가 접수됐어요. 이메일로 답변드릴게요." 완료 메시지 표시 (폼을 숨기고 같은 페이지에서)
- 제출 중 버튼 비활성화 + "전송 중..." 텍스트

---

## `/admin/contacts` 페이지

- 어드민 권한 확인 (기존 `isAdmin` 가드 사용)
- `adminSupabase` 클라이언트로 `inquiries` 조회 (최신순)
- 목록 컬럼: 유형 뱃지 / 제목 / 이메일 / 접수일

---

## 환경 변수

| 키 | 설명 |
|---|---|
| `RESEND_API_KEY` | Resend API 키 (새로 발급 필요) |

---

## 네비게이션 연결

- 기존 Base 레이아웃 푸터 또는 FAQ 페이지 하단에 "문의하기 →" 링크 추가
- 어드민 사이드바에 "문의 관리" 메뉴 추가
