# Mock 데이터 (step 2 — 원아 활동 기록 테스트용)

`?mock=1` 모드로 [/dashboard/activity-records](../app/dashboard/activity-records/) 에 진입하면 이 폴더의 데이터로 화면·AI 호출을 테스트할 수 있습니다. 실 DB 로 옮길 때는 폴더 전체를 삭제하면 됩니다.

## 파일 구조

| 파일 | 역할 | DB 대응 |
|---|---|---|
| `children.ts` | 원아 4명 (최지호·김소연·이서연·김도훈) | `children` 테이블 |
| `session.ts` | 오늘의 활동 1건 (제목·session_ai_content·키워드) | `activity_sessions` + `activity_records.session_ai_content` |
| `photos.ts` | 원아별 사진 URL 배열 | `child_activity_photos` + `files.url` |
| `index.ts` | `getMockSessionData()` 헬퍼 — 위 3개를 한꺼번에 묶어 반환 | — |

## 사진 파일

`photos.ts` 의 `MOCK_CHILD_PHOTOS` 가 [public/mock-photos/](../public/mock-photos/) 의 파일을 참조합니다. 다음 5개 파일을 직접 두세요:

| 파일명 | 매핑 원아 |
|---|---|
| `child-001-1.jpg` | mock-child-001 (최지호) |
| `child-001-2.jpg` | mock-child-001 (최지호) |
| `child-002-1.jpg` | mock-child-002 (김소연) |
| `child-003-1.jpg` | mock-child-003 (이서연) |
| `child-003-2.jpg` | mock-child-003 (이서연) |

`mock-child-004` (김도훈) 은 의도적으로 사진 없음 — "매칭된 사진 없음" UI 와 AI 의 사진-없음 분기 테스트용.

권장 형식: `.jpg` 또는 `.png`, 정사각형 300x300 ~ 600x600. Claude Vision 지원 포맷(image/jpeg, png, webp, gif). 저작권 안전한 이미지만 사용.

파일이 없으면 서버 액션 `generateChildActivityDraftAction` 의 `resolvePhoto()` 가 `fs.readFile` 실패를 잡아서 해당 사진은 건너뛰고 AI 호출합니다. 화면에는 broken `<img>` 가 표시될 수 있어요.

## 실 DB 이관 시

1. 마이그레이션 014 추가 — `temperaments` 저장 위치 결정 (`children.temperament` 컬럼 추가 또는 별도 테이블)
2. `loadChildren` 쿼리에서 temperament 도 같이 가져오기
3. `loadTodaySession(classroomId, date)` 구현 — `activity_sessions` + 그 session 의 `activity_records.session_ai_content` 읽기
4. `loadChildPhotos(sessionId)` 구현 — `child_activity_photos` join `files`
5. [app/dashboard/activity-records/page.tsx](../app/dashboard/activity-records/page.tsx) 의 `useMock` 분기 제거
6. `mocks/` 폴더 + `public/mock-photos/` 폴더 삭제
