# 테드픽(tedpick) 프로젝트 가이드

## 프로젝트 기본 정보
- **스택:** Astro v6 + Vercel + Supabase
- **배포:** Vercel (프로젝트명 tedpick, 20fridays-projects 팀)
- **운영자:** Ted (20friday@gmail.com)
- **Ted에 대해:** 디자이너 출신, 개발 지식 제한적. 시각적이고 간결한 설명 선호. 복잡한 기술 용어보다 쉬운 말로 설명할 것.

---

## 개발환경 세팅 (새 맥북 또는 처음 설치 시)
```bash
# 1. 레포 클론 후 이동
git clone [레포 주소]
cd tedpick

# 2. 의존성 설치
npm install

# 3. Vercel CLI 설치 및 로그인
npm i -g vercel@latest
vercel login
vercel link

# 4. 환경변수 가져오기 (.env 파일 자동 생성)
vercel env pull .env

# 5. 로컬 실행 확인
npm run dev
```

---

## 배포 방법
```bash
vercel --prod
```

---

## 글 등록 방식
Ted가 방송 스크립트 요약을 주면 `/tmp/insert_post.mjs` 파일을 만들어 `node`로 실행하는 방식으로 Supabase에 직접 등록한다.

### 등록 테이블 3가지
| 테이블 | 용도 |
|-------|------|
| `posts` | 방송별 개별 글 |
| `daily_reports` | 오늘의 픽 (4개 방송 통합 리포트) |
| `weekly_reports` | 주간픽 |

### 방송 슬러그 규칙
- `YYYY-MM-DD-hankyungtv` (한국경제TV)
- `YYYY-MM-DD-samprotv` (삼프로TV)
- `YYYY-MM-DD-yonhapeconomy` (연합뉴스경제TV)
- `YYYY-MM-DD-12simannaayo` (12시에 만나요)

### 글 제목 규칙
- 날짜나 "오늘의 시황" 같은 고정 표현 사용 금지
- 방송 핵심을 담은 **문장형** — `~했어요`, `~이에요`로 마무리
- 이슈 나열 + em dash(`—`) + 핵심 메시지 구조 자주 사용
- 예: `삼성전자 노사 타결·엔비디아 호실적에 코스피 7% 급반등 — 한국 반도체가 시장의 중심으로 돌아왔어요`

### 필드 기본값
- `is_premium`: false (별도 언급 없으면 무료)
- `published`: true (별도 언급 없으면 게시)
- `date`: 방송 날짜 기준 (YYYY-MM-DD)
- `tags`: 본문 주요 종목·테마 키워드

### 정렬 규칙
- 쿼리 정렬 순서: `date desc` → `display_order asc` → `created_at desc`
- 같은 날짜 안에서 나중에 등록한 글이 상단에 표시됨

### ⚠️ 중요 규칙
- 오늘의 픽(`daily_reports`) 등록 전에 반드시 DB에서 당일 `posts` 수를 먼저 확인하고, 몇 개 방송이 등록됐는지 확인한 뒤 통합 리포트를 작성해야 한다.
- 글 등록 전 반드시 위 제목 규칙을 지킬 것. 과거에 "오늘의 시황 (날짜)" 형식으로 잘못 만들었다가 수정한 적 있음.

---

## 주요 컴포넌트 구조
| 파일 | 역할 |
|------|------|
| `src/components/PrepCard.astro` | 오늘 피드가 없을 때 보여주는 안내 카드 |
| `src/lib/marketHoliday.ts` | 국내 증시 휴장일 판단 유틸 |
| `src/layouts/Base.astro` | 공통 레이아웃 (GA4 스크립트 포함) |
| `src/pages/index.astro` | 메인 피드 페이지 |
| `src/pages/admin/index.astro` | 어드민 대시보드 |

---

## PrepCard 동작 방식
오늘 날짜 피드가 없을 때만 안내 카드 노출. 노출 우선순위:

```
오늘 피드 있음          → 카드 숨김
오늘 피드 없음 + 휴장일  → 휴장일 카드
오늘 피드 없음 + 거래일  → 시간대별 카드
```

### 시간대별 카드 (거래일 기준)
5분마다 체크하고, 시간대 경계를 넘을 때만 텍스트 변경됨.

| 시간 | 상태 |
|------|------|
| 00:00 ~ 06:00 | 새벽 (sleeping) |
| 06:00 ~ 09:00 | 개장 전 |
| 09:00 ~ 11:30 | 장 초반 |
| 11:30 ~ 13:30 | 오전장 |
| 13:30 ~ | 오늘의 PICK 정리 중 |

### 휴장일 카드 디자인 결정 사항
- 소 마스코트: sleeping 상태 그대로 유지 (별도 상태 없음)
- 펄스 도트: 파란색 → 회색(`#94a0ad`)으로 변경
- 타이틀: "오늘은 시장도 잠시 쉬어가요"
- 설명: "국내 증시 휴장일이라 오늘의 PICK은 쉬어갑니다. 다음 거래일에 주요 방송과 시장 이슈를 정리해서 다시 전해드릴게요."
- 휴장일이면 시간대 업데이트 로직 스킵 (`return` 처리)

---

## 국내 증시 휴장일 관리
`src/lib/marketHoliday.ts` 파일에서 관리.
- 주말(토·일)은 코드에서 자동 판단
- 공휴일·대체공휴일·연말폐장일은 `HOLIDAYS` Set에 하드코딩
- **매년 한국거래소(KRX) 공지에 맞춰 목록 업데이트 필요**

---

## GA4 설정
- Measurement ID: `G-XY9KNNSY9W`
- `Base.astro`에 쿠키 없는 방식으로 삽입됨
- 어드민 대시보드에 GA4 바로가기 버튼 있음
- GA4 Data API 서비스 계정은 UI로 추가 불가 (플랫폼 제약)
