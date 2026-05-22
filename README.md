

# AI Camp 6기 LLM Service Project — B2B 5팀

B2B 도메인 LLM 서비스 프로젝트 저장소입니다.

---

## 🧩 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth / DB / Storage | Supabase (Auth, Postgres, Storage, RLS) |
| LLM | Anthropic Claude (`@anthropic-ai/sdk`) |
| Deploy | Vercel |

---

## ✅ 사전 요구사항

- **Node.js 18.17 이상** (권장: 20.x 또는 22.x)
- **npm 9 이상** (Node와 함께 설치됨)
- **Git**
- Supabase 프로젝트 접근 권한 (팀 리더에게 요청)
- Anthropic API Key

버전 확인:
```bash
node --version
npm --version
```

---

## 🚀 처음 셋업하기

### 1. 저장소 클론

```bash
git clone https://github.com/KernelAcademy-AICamp/ai-camp-6nd-llm-service-project-6-b2b-5.git
cd ai-camp-6nd-llm-service-project-6-b2b-5
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

`.env.example`을 복사해 `.env.local`을 만듭니다.

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 실제 키 값을 채워 넣습니다.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

> ⚠️ **`.env.local`은 절대 커밋하지 마세요.** `.gitignore`로 제외되어 있지만 항상 확인하세요.
> 키 값은 팀 리더에게 비공개 채널(슬랙 DM, 1Password 등)로 요청하세요.

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속 → **"안녕하세요, 5팀입니다"** 가 보이면 셋업 완료 ✅

---

## 📜 사용 가능한 스크립트

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 (localhost:3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 (빌드 후) |
| `npm run lint` | ESLint 검사 |

---

## 📁 프로젝트 구조

```
.
├── app/                          # Next.js App Router
│   ├── globals.css               # Tailwind + shadcn 테마 변수
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 홈 페이지
├── components/
│   └── ui/                       # shadcn/ui 컴포넌트
│       └── button.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # 브라우저용 Supabase 클라이언트
│   │   ├── server.ts             # Server Component용
│   │   └── middleware.ts         # 세션 갱신
│   └── utils.ts                  # cn() 등 유틸
├── middleware.ts                 # Next.js 미들웨어 (Supabase Auth 세션 유지)
├── components.json               # shadcn/ui 설정
├── tailwind.config.ts
├── next.config.mjs
├── tsconfig.json                 # @/* 절대경로 alias
└── package.json
```

---

## 🎨 shadcn/ui 컴포넌트 추가하기

새 컴포넌트가 필요하면 아래 명령어로 추가합니다.

```bash
npx shadcn@latest add input
npx shadcn@latest add card
npx shadcn@latest add dialog
# 등등
```

추가된 컴포넌트는 `components/ui/`에 생성되며, `@/components/ui/...`로 import 합니다.

```tsx
import { Button } from "@/components/ui/button";
```

전체 컴포넌트 목록: [https://ui.shadcn.com/docs/components](https://ui.shadcn.com/docs/components)

---

## 🔐 Supabase 사용 가이드

### 클라이언트 컴포넌트 (브라우저)

```tsx
"use client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const { data } = await supabase.from("table").select();
```

### 서버 컴포넌트 / Route Handler

```tsx
import { createClient } from "@/lib/supabase/server";

const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
```

### ⚠️ 보안 주의사항

- `NEXT_PUBLIC_*` 접두사가 붙은 변수만 브라우저에 노출됩니다.
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`는 **서버 전용**입니다. 절대 클라이언트 코드 / `NEXT_PUBLIC_`에 넣지 마세요.
- Anthropic API 호출은 반드시 **API Route (`app/api/.../route.ts`)** 또는 **Server Action**에서만 수행하세요.
- 모든 Supabase 테이블에는 **RLS(Row Level Security) 정책**을 활성화하세요.

---

## 🌳 Git 협업 규칙 (제안)

### 브랜치 전략

- `main` — 배포 브랜치 (직접 push 금지, PR로만 머지)
- `{이름영문}` — 각자의 브랜치에서 작업후 PR, 작업 전 항상 main에서 pull하고 시작


### 커밋 메시지 (Conventional Commits) 예시

```
feat: 채팅 UI 컴포넌트 추가
fix: 로그인 후 리다이렉트 오류 수정
docs: README 셋업 가이드 보완
chore: 의존성 업데이트
refactor: Supabase 클라이언트 분리
```

### PR 머지 전 체크리스트

- [ ] `npm run build`가 통과하는가
- [ ] `npm run lint` 경고가 없는가
- [ ] 환경변수 추가 시 `.env.example` 업데이트했는가
- [ ] 최소 1명 이상 리뷰 받았는가

---

## 🚢 Vercel 배포

Vercel 프로젝트 환경변수에 아래 4개를 등록해야 합니다.

| 변수명 | 환경 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development |
| `ANTHROPIC_API_KEY` | Production, Preview, Development |

`main` 브랜치 push → 자동 프로덕션 배포  
PR 생성 → Preview 배포 자동 생성

---

## 🆘 트러블슈팅

**`npm install` 실패**
- Node.js 버전이 18.17 이상인지 확인 (`node --version`)
- `node_modules/`와 `package-lock.json` 삭제 후 재시도

**`localhost:3000` 접속 시 환경변수 오류**
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- 변수명 오타 확인 (특히 `NEXT_PUBLIC_` 접두사)
- 개발 서버 재시작 (`Ctrl+C` → `npm run dev`)

**Supabase 401 오류**
- `.env.local`의 키가 Supabase 대시보드의 키와 일치하는지 확인
- 해당 테이블의 RLS 정책 확인

**그 외 막히면** → 팀 슬랙 채널에 에러 메시지 전체 복사해서 공유 🙏
