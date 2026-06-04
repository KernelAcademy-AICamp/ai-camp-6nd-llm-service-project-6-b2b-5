# 또랑 · 매일 활동 기록 (Daily Record) 기능 구현 기록

## 개요

또랑 1번 프롬프트 구현 — **사진(1~50장) → 일과 흐름 + 관찰일지/알림장 초안**을 Claude Vision API + structured JSON output으로 자동 생성.

- **브랜치**: `myeongjin`
- **모델**: `claude-opus-4-7`
- **상태**: 구현·검증 완료, 미커밋
- **테스트 URL**: http://localhost:3000/daily-record

---

## 구현 순서

### 0. 디렉토리 구조 생성

```bash
mkdir -p app/api/daily-record app/daily-record
```

| 경로 | 용도 |
|---|---|
| `app/api/daily-record/` | API 라우트 |
| `app/daily-record/` | UI 페이지 |
| `lib/` (기존) | `daily-record-prompt.ts` 단일 파일 |

---

### 1. 시스템 프롬프트 + JSON 스키마

**파일**: [`lib/daily-record-prompt.ts`](../lib/daily-record-prompt.ts)

export 항목:

| 이름 | 종류 | 역할 |
|---|---|---|
| `DAILY_RECORD_SYSTEM_PROMPT` | string | 한국어 시스템 프롬프트 (원칙 5개 + 분류체계 + 예시 2개) |
| `DAILY_RECORD_SCHEMA` | const object | Claude `output_config.format`에 전달할 JSON Schema |
| `DailyRecordResult` | TypeScript type | 응답 JSON 형 안전성 |
| `ILGWA_GUBUN`, `NORI_TYPE`, `NURI_AREA` | const tuple | UI/검증용 enum 상수 |

핵심 원칙 (시스템 프롬프트):

1. 사진에 실제로 보이는 것만 기술
2. 개인 식별 묘사 금지 (얼굴/외모/성별/이름/옷차림)
3. 특정 아이 지칭 금지 — "아이들은" 사용
4. 불명확 시 신뢰도↓ + 주의 기재 + 초안은 빈 문자열
5. 신뢰도는 0.0~1.0 소수

분류 체계:

- **일과_구분** (6): 놀이·활동, 바깥놀이, 식사·간식, 낮잠·휴식, 정리정돈, 기타
- **놀이_유형** (9 + 빈 문자열): 쌓기(블록)놀이, 역할놀이, 미술, 음률, 언어(이야기나누기), 신체·운동, 수·조작, 과학·탐구, 자유놀이
- **누리과정_영역** (5, 1~2개 선택): 신체운동·건강, 의사소통, 사회관계, 예술경험, 자연탐구

---

### 2. API 라우트 (Vision input + 구조화된 JSON)

**파일**: [`app/api/daily-record/route.ts`](../app/api/daily-record/route.ts)

핵심 흐름:

```
POST /api/daily-record (multipart/form-data)
  ├─ 검증: 사진 수(1~50), MIME(jpeg/png/gif/webp), 크기(≤5MB/장)
  ├─ File → ArrayBuffer → base64 → ImageBlockParam
  ├─ Content interleave: [라벨 텍스트, 이미지, 라벨 텍스트, 이미지, ...]
  ├─ Claude API 호출
  │   ├─ model: claude-opus-4-7
  │   ├─ system: DAILY_RECORD_SYSTEM_PROMPT + cache_control: ephemeral
  │   ├─ output_config.format: json_schema(DAILY_RECORD_SCHEMA)
  │   └─ max_tokens: 4096
  ├─ 응답 텍스트 블록 → JSON.parse
  └─ 총_사진수 보정 후 응답
```

주요 상수:

- `MAX_IMAGES = 50`
- `MAX_IMAGE_BYTES = 5 * 1024 * 1024` (5MB)
- `maxDuration = 300` (50장 처리 여유 시간)
- `ALLOWED_MIME`: jpeg/png/gif/webp

---

### 3. UI 페이지 (사진 업로드 + 라벨 + 결과 표시)

**파일**: [`app/daily-record/page.tsx`](../app/daily-record/page.tsx)

기능:

| 영역 | 내용 |
|---|---|
| 날짜 선택 | `<input type="date">` (default: 오늘) |
| 사진 업로드 | 다중 파일 input (`accept=jpeg,png,gif,webp`), 카운터 (n/50) |
| 사진 목록 | 썸네일 + 라벨 입력란 + 제거 버튼 |
| 제출 | FormData 구성 → `POST /api/daily-record` |
| 결과: 메타 | 기록 날짜, 사진 수, 신뢰도(%), 근거, 주의(있을 때만) |
| 결과: 일과 흐름 | 시간대별 카드 + 일과/놀이/영역 뱃지 |
| 결과: 초안 2개 | 관찰일지 + 알림장 (각 복사 버튼) |
| 결과: 원본 JSON | `<details>` 토글 + JSON 복사 |

클라이언트 상태:

- `items: Item[]` — `{id, file, previewUrl, label}` 배열
- `date`, `submitting`, `error`, `result`, `copied` — UX 보조 상태
- 메모리 누수 방지: `URL.revokeObjectURL` 호출 (제거/clearAll 시)

---

### 4. 검증 — lint + build

| 검증 | 명령 | 결과 |
|---|---|---|
| ESLint | `npm run lint` | ✓ No warnings or errors |
| TypeScript 컴파일 | `npx tsc --noEmit` | 0 errors |
| Dev 서버 라우트 인식 | `curl /daily-record` | HTTP 200 |
| API 에러 핸들링 (빈 POST) | `curl -X POST .../api/daily-record` | HTTP 400 + 안내 메시지 |
| `.env.local` git 차단 | `git status` / `git check-ignore` | `.gitignore:26` 유효, 추적 안 됨 |

---

## ✅ 1번 프롬프트 구현 완료

### 생성된 파일 (3개, 미커밋)

```
lib/daily-record-prompt.ts          시스템 프롬프트 + JSON 스키마 + 타입
app/api/daily-record/route.ts       Vision API 라우트
app/daily-record/page.tsx           UI 페이지 (업로드 + 결과)
```

### 구현 사양 — 프롬프트 스펙 대비 매핑

| 스펙 | 구현 위치 |
|---|---|
| 사진 1~50장 입력 | `MAX_IMAGES=50` + 5MB/장 제한 |
| 시간/활동 라벨 (선택) | 각 사진별 텍스트 입력란 + FormData `labels[]` |
| 사진 형식 (jpeg/png/gif/webp) | `ALLOWED_MIME` 화이트리스트 |
| **JSON 1개만 출력** | `output_config.format = json_schema` (스키마 강제) |
| 일과_구분 6값 enum | 스키마 `enum: [놀이·활동, ...]` |
| 놀이_유형 9값 + 빈 문자열 | 스키마 `enum: ["", ...]` |
| 누리과정_영역 5값 array | 스키마 `array of enum` |
| 신뢰도 0.0~1.0 | 시스템 프롬프트 + UI에서 % 변환 표시 |
| 개인식별 묘사 금지 | 시스템 프롬프트 원칙 #2 |
| 여러 장 처리 = 1개 JSON | 메시지에 모든 이미지 인터리브 + 단일 응답 |
| 모델 | `claude-opus-4-7` (Vision + 한국어 강세) |
| 프롬프트 캐시 | system prompt에 `cache_control: ephemeral` |

---

## 사용법

1. 브라우저에서 http://localhost:3000/daily-record 접속
2. "사진 추가" → 활동 사진 1~50장 선택
3. (선택) 각 사진에 라벨 입력 — 예: `09:00 블록활동`, `12:00 점심`
4. "초안 생성" 클릭
5. ~10~30초 후 결과 표시
   - 메타 정보 (신뢰도/근거)
   - 일과 흐름 (시간대별 분류)
   - 관찰일지 초안 + 알림장 초안 (각 복사 버튼)
   - 원본 JSON (디버그용)

---

## 의존성 / 환경

- Next.js 14 (App Router)
- `@anthropic-ai/sdk` (기존)
- `ANTHROPIC_API_KEY` (`.env.local`, gitignored)
- **추가 npm install 불필요**

---

## 다음 단계 (제안)

- 결과를 `localStorage` 또는 Supabase에 저장하여 일자별 히스토리 보관
- 사진 압축 클라이언트 사이드 (5MB 제한 회피)
- 스트리밍 응답 (50장 처리 시 진행 표시)
- 음성 메모 추가 (사진 + 음성 동시 입력)
