# 테드픽 (TedPick) — 프로젝트 인수인계 문서

## 프로젝트 개요
주식 방송(12시에 만나요, 삼프로TV 등) 내용을 정리해 올리는 개인 블로그 사이트.  
GitHub 저장소: `20friday/jusikyoyo`  
배포: Vercel (GitHub push 시 자동 배포)

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 프레임워크 | Astro v6 (정적 사이트) |
| UI 컴포넌트 | React 19 (`client:only="react"`) |
| 콘텐츠 | Markdown (`.md`) + Astro Content Collections |
| 마크다운 확장 | `remark-directive` + 커스텀 `remarkBlocks` 플러그인 |
| 에디터 | TipTap v3 (Notion 스타일) |
| 저장 | GitHub Contents API (브라우저에서 직접 push) |
| 배포 | Vercel |
| 폰트 | Pretendard Variable |

---

## 디렉토리 구조

```
repo/
├── src/
│   ├── components/
│   │   └── editor/
│   │       ├── EditorApp.tsx       # 에디터 메인 (글 관리 목록 + 편집 뷰)
│   │       ├── NotionEditor.tsx    # TipTap 기반 Notion 스타일 에디터
│   │       ├── MarkdownEditor.tsx  # (구) CodeMirror 에디터 (미사용)
│   │       └── PostPreview.tsx     # (구) 미리보기 (미사용)
│   ├── content/
│   │   └── posts/
│   │       ├── .gitkeep            # 폴더 유지용 (글 전부 삭제해도 폴더 남음)
│   │       └── 2026-05-08-12si.md  # 현재 등록된 글 1개
│   ├── layouts/
│   │   └── Base.astro              # 공통 레이아웃 (헤더 포함)
│   ├── lib/
│   │   └── remarkBlocks.mjs        # 커스텀 마크다운 블록 파서
│   ├── pages/
│   │   ├── index.astro             # 피드 (메인)
│   │   ├── editor/index.astro      # 에디터 페이지
│   │   └── post/[slug].astro       # 글 상세 페이지
│   ├── styles/
│   │   └── global.css              # 전체 디자인 시스템
│   └── content.config.ts           # Astro Content Collections 설정
├── astro.config.mjs
├── vercel.json
└── package.json
```

---

## 커스텀 마크다운 블록 문법

글 작성 시 아래 특수 블록을 사용할 수 있음.

```md
# 지수 블록 (인라인 뱃지)
::index{name="코스피" change="-0.84%" dir="down"}
# dir: up / down / flat

# 종목 카드
::stock{name="삼성전자" change="-2.5%" dir="down"}

# 강조 박스
:::callout{type="up"}
내용
:::
# type: up / down / info / note
```

---

## 에디터 (`/editor`)

### 동작 방식
1. 브라우저 localStorage에 GitHub 토큰·저장소명 저장
2. GitHub Contents API로 `src/content/posts/` 목록 조회
3. 글 작성/수정 후 저장 → GitHub API PUT → Vercel 자동 배포

### 토큰 설정
- GitHub → Settings → Developer Settings → Personal Access Tokens
- **Fine-grained token**: `20friday/jusikyoyo` 저장소, **Contents: Read and write** 권한 필수
- 에디터 접속 → 저장소: `20friday/jusikyoyo` / 토큰 입력 → 연결하기

### NotionEditor 기능
- `/` 입력 → 슬래시 커맨드 메뉴 (제목, 목록, 인용, 지수 블록, 종목 카드, 박스 등)
- 텍스트 선택 → 인라인 서식 툴바 (볼드, 이탤릭, H2, H3, 목록)
- 저장 방식: TipTap JSON → 마크다운 직렬화 → GitHub API

### 프론트매터 형식
```yaml
---
title: 제목
date: "2026-05-08"
show: 12시에 만나요
hosts: [이광수, 권다영, 박시동]
summary: 한 줄 요약
tags: [코스피, 현대차]
published: true
---
```

---

## 주요 해결된 버그

| 버그 | 원인 | 해결 |
|------|------|------|
| 에디터 로드 안 됨 | SSR에서 localStorage 접근 | `client:only="react"` |
| 한글 깨짐 | `atob()` UTF-8 미지원 | `TextDecoder('utf-8')` |
| 삭제 404 오류 | 삭제 전 SHA 재요청이 실패 | 로드 시 저장한 SHA 바로 사용 |
| 글 없을 때 404 | posts 폴더 자체가 사라짐 | 404 시 빈 목록 처리 + `.gitkeep` |
| git push 충돌 | 원격이 앞서 있을 때 | `git fetch && git reset --soft origin/main` 후 재커밋 |
| git 서명 오류 | GPG 서명 설정 | `-c gpg.format=openpgp -c commit.gpgsign=false` 항상 사용 |

---

## 디자인 시스템 (CSS 변수)

```css
--blue: #3182f6
--up: #f04452      /* 상승 (빨강) */
--down: #1763d6    /* 하락 (파랑) */
--flat: #8b95a1
--bg: #f9fafb
--card: #ffffff
--border: #f2f4f6
--text-1: #191f28  /* 본문 */
--text-2: #4e5968  /* 서브 */
--text-3: #8b95a1  /* 힌트 */
```

---

## 다음에 할 일: 관리자 페이지

아래 기능이 필요하며, **백엔드/DB 구조를 먼저 결정해야 함**.

### 필요 기능
1. **글 관리** — 현재 에디터를 `/admin` 하위로 통합
2. **회원 관리** — 독자인지 편집자인지 먼저 확인 필요
3. **후원금 리스트** — 토스 연동인지 수동 입력인지 확인 필요
4. **접속 정보** — 방문자 수, 페이지뷰, 인기 글 등

### 논의가 필요한 사항 (작업 시작 전 확인)
- "회원"이 누구인지: 구독 독자 vs 운영자/편집자
- 회원 가입 방식: 자유 가입 vs 관리자 초대
- 후원금: 토스 API 연동 vs 수동 기록
- 접속 정보: 간단한 페이지뷰 vs 상세 분석
- 백엔드: **Supabase** (PostgreSQL + Auth) 권장

### 추천 백엔드: Supabase
- 무료 티어로 시작 가능
- 내장 인증 (이메일, 소셜 로그인)
- PostgreSQL 데이터베이스
- Astro와 잘 호환됨

---

## Git 작업 시 주의사항

```bash
# 커밋 항상 이렇게 (GPG 서명 비활성화)
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "메시지"

# push 거절 시 (원격이 앞서 있을 때)
git fetch origin main
git reset --soft origin/main
git -c gpg.format=openpgp -c commit.gpgsign=false commit -m "메시지"
git push -u origin main
```
