# 유치원 관리 시스템

## 기술 스택
Next.js 14 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · Supabase (Postgres / RLS) · Vercel

## 개발 규칙
- DB 접근은 Server Action만. 클라이언트 직접 쿼리 금지
- `service_role` 키 클라이언트 노출 금지
- `any` 금지 · `console.log` 금지 · `try/catch` 필수
- UI 컴포넌트는 shadcn/ui 우선 · 아이콘은 lucide-react
- UI 텍스트 한국어 · 날짜는 date-fns/ko · 반응형 필수
- 모든 페이지 폴더에 loading.tsx · error.tsx 포함

## 역할 · 접근 권한
역할: `parent` | `teacher` | `director` | `admin`
- admin: 모든 유치원 전체 조회
- director: 본인 유치원 전체
- teacher: 담당 반 원아·보호자 + 같은 유치원 교직원
- parent: 본인 자녀 + 자녀 담당 교사만

## 인증 우회 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                  # psql 마이그레이션 실행용
ANTHROPIC_API_KEY=
```
`lib/supabase/admin.ts`에서 service_role로 RLS 우회 (서버 전용). 역할 시뮬레이션: URL `?role=director|teacher|parent|admin`  
로그인 도입 시 createAdminClient() → createClient() 일괄 교체. 시드 UUID: director=...0001 · teacher=...0002 · parent=...0003 · admin=...0005

## DB 테이블 (총 15개)

### 기본 (001)
| 테이블 | 주요 컬럼 |
|---|---|
| `kindergartens` | id · name · director_name · address · phone · logo_url |
| `profiles` | id(=auth.users) · role · name · phone · is_active · kindergarten_id(FK) |
| `classrooms` | id · kindergarten_id(FK) · name · age_group · capacity |
| `children` | id · classroom_id(FK) · name · birth_date · gender · address · photo_url · enrolled_at · status · privacy_agreed_at · privacy_agreed_by(FK) |
| `parent_child` | id · parent_id(FK nullable) · child_id(FK) · guardian_name · guardian_phone · relation · is_primary |
| `staff_classrooms` | id · staff_id(FK) · classroom_id(FK) · role_in_class(lead/assistant) · assigned_at |

### 교직원 (003)
| 테이블 | 주요 컬럼 |
|---|---|
| `staff_profiles` | id(=profiles.id) · position · hire_date · resign_date · employment_type |
| `staff_certifications` | id · staff_id(FK) · name · issued_at · issuer |

### 반 이력 (006)
| 테이블 | 주요 컬럼 |
|---|---|
| `child_classroom_history` | id · child_id(FK) · classroom_id(FK) · started_at · ended_at · reason |

### 출결 (007)
| 테이블 | 주요 컬럼 |
|---|---|
| `attendance` | id · child_id(FK) · classroom_id(FK) · date · status(present/absent/approved_absent/sick/accident) · check_in · check_out · reason(인정결석사유) · recorded_by(FK) · updated_by(FK) |

### 건강 (008)
| 테이블 | 주요 컬럼 |
|---|---|
| `child_health` | id · child_id(FK UNIQUE) · emergency_memo · updated_by(FK) |
| `child_allergies` | id · child_id(FK) · allergen · reaction · severity · note · updated_by(FK) |
| `child_conditions` | id · child_id(FK) · name · description · note · updated_by(FK) |
| `child_medications` | id · child_id(FK) · name · dosage · frequency · start_date · end_date · updated_by(FK) |
| `child_vaccinations` | id · child_id(FK) · vaccine_name · vaccinated_at · next_due_at · updated_by(FK) |

### 상담 (009)
| 테이블 | 주요 컬럼 |
|---|---|
| `consultations` | id · child_id(FK) · classroom_id(FK) · parent_child_id(FK) · teacher_id(FK) · consultation_date · method(대면/전화/화상/문자) · content · follow_up · updated_by(FK) |

### 파일·활동 기록 (010)
| 테이블 | 주요 컬럼 |
|---|---|
| `files` | id · kindergarten_id(FK) · uploader_id(FK) · bucket · storage_path · url · file_name · file_size · mime_type |
| `activity_sessions` | id · classroom_id(FK) · date · title · created_by(FK) |
| `child_activity_photos` | id · session_id(FK) · child_id(FK) · file_id(FK) · order_num |
| `activity_records` | id · session_id(FK) · child_id(FK) · memo · session_ai_content · session_ai_generated_at · ai_content · ai_generated_at · updated_by(FK) |

### 알림장 (011)
| 테이블 | 주요 컬럼 |
|---|---|
| `daily_notes` | id · child_id(FK) · classroom_id(FK) · session_id(FK) · author_id(FK) · date · content · mood · status(draft/published) · is_read · read_at |
| `note_photos` | id · note_id(FK) · file_id(FK) · order_num |

### 관찰일지 (012)
| 테이블 | 주요 컬럼 |
|---|---|
| `observation_journals` | id · child_id(FK) · classroom_id(FK) · session_id(FK) · author_id(FK) · date · content · ai_generated_at · updated_by(FK) |
| `observation_journal_photos` | id · journal_id(FK) · file_id(FK) · order_num |

files: 1:N 첨부 파일 중앙 관리. 1:1 파일(photo_url, avatar_url, logo_url)은 기존 url 컬럼 유지.  
activity_sessions UNIQUE(classroom_id, date) · activity_records UNIQUE(session_id, child_id)  
daily_notes status=published 일 때만 학부모 열람 가능. observation_journals는 교사 전용.  
알림장·관찰일지 작성 시 child_activity_photos에서 해당 원아 사진 자동 로드.

## 마이그레이션 현황
001 ✅ · 002 ✅ · 003 ✅ · 004 ✅ · 005 ✅ · 006 ✅ · 007 ✅ · 008 ✅ · 009 ✅ · 010 ✅ · 011 ✅ · 012 ✅ · 013 ✅(Storage)

## 마이그레이션 의존성 이슈 해결 기록 (010 · 011)
원래 010_daily_notes.sql · 011_activity.sql 이었으나 상호 참조로 적용 불가 → 아래 두 조치로 해결.

1. **파일명 스왑**: `010_daily_notes.sql` ↔ `011_activity.sql`
   - 원인: `daily_notes.session_id` 가 `activity_sessions` 를 참조 → activity 가 먼저 생성되어야 함
   - 결과: `010_activity.sql`, `011_daily_notes.sql`

2. **`files` 테이블 정의를 010 으로 이동**
   - 원인: `child_activity_photos.file_id` (010) 가 `files` (구 011) 를 참조 → 양방향 의존성
   - 조치: `files` 테이블·인덱스·RLS 정책 일체를 `010_activity.sql` 상단(섹션 0)으로 이동, `011_daily_notes.sql` 에서 제거
   - 결과: 010 에 `files` + 활동 3종 테이블, 011 은 `daily_notes` + `note_photos` 만 보유

향후 새 마이그레이션 추가 시 외래키 방향이 파일 번호 순서와 일치하는지 확인 필요.
