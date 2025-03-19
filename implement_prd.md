# PRD 구현 액션 계획

현재 데이터베이스 구조와 PRD를 비교한 결과, 몇 가지 중요한 개선 사항이 필요합니다.

## 1. 데이터베이스 구조 개선 사항

현재 데이터베이스의 구조가 대부분 PRD에 맞게 잘 구성되어 있으나, 일부 필드명 변경이 필요합니다:

- ✅ `id` → `textid`: 모든 테이블에서 변경 완료
- ✅ `invite_code` → `code`: `rooms` 테이블에서 변경 완료
- ✅ `message` → `content`: `chat_messages` 테이블에서 변경 완료
- ✅ `region` → `district`: 방 지역 정보 필드명 변경 완료

## 2. 핵심 기능 구현 상태

1. **AI 기반 장소 및 동선 추천**
   - [ ] 사용자 조건에 맞는 장소 추천 구현
   - [ ] 동선 최적화 알고리즘 구현
   - [ ] 꼭 가야하는 장소 포함 로직 구현

2. **인터랙티브 지도 시각화**
   - [ ] 카카오 맵 API 통합
   - [ ] 카테고리별 마커 및 동선 시각화
   - [ ] 장소 상세 정보 표시 UI

3. **협업적 의사결정 시스템**
   - [ ] 붐업/붐다운 투표 시스템 구현
   - [ ] 실시간 팀 채팅 구현
   - [ ] AI 어시스턴트 통합

4. **인터랙티브 AI 대화**
   - [ ] AI 대화 인터페이스 구현
   - [ ] 지도와 AI 응답 연동
   - [ ] 자연어 처리 및 장소 추천

5. **최종 일정 공유 및 저장**
   - [ ] 시간표 형식의 일정 표시
   - [ ] 공유 링크 생성
   - [ ] 다운로드 기능

## 3. 필요한 신규 개발 컴포넌트

1. **장소 추천 및 동선 설계 엔진**
   - OpenAI API와 LangChain을 활용한 RAG 파이프라인
   - 벡터 데이터베이스(Pinecone) 통합
   - 장소 데이터 벡터화

2. **지도 인터페이스**
   - Kakao Maps 컴포넌트
   - 동선 시각화 레이어
   - 마커 및 인포윈도우 관리

3. **실시간 협업 기능**
   - Supabase Realtime을 활용한 채팅
   - 투표 시스템 UI 및 로직
   - 사용자 온라인 상태 관리

4. **AI 어시스턴트 채팅**
   - 스트리밍 응답 인터페이스
   - 메시지 히스토리 관리
   - 대화 컨텍스트 유지

5. **일정 관리 및 공유**
   - 시간표 생성 로직
   - 공유 URL 생성 및 권한 관리
   - 일정 내보내기 기능

## 4. 다음 단계 구현 우선순위

1. **필수 기반 인프라 구축**
   - 벡터 데이터베이스 설정 및 장소 데이터 수집
   - OpenAI API 연동 및 RAG 파이프라인 구성
   - Kakao Maps API 통합 및 기본 지도 인터페이스

2. **핵심 사용자 플로우 구현**
   - 방 생성 및 참여 플로우 완성
   - 장소 추천 요청 및 표시 로직
   - 기본 평가 시스템

3. **협업 기능 구현**
   - 실시간 채팅 및 알림
   - 투표 시스템 및 의견 반영
   - 사용자 활동 시각화

4. **AI 어시스턴트 강화**
   - 대화형 인터페이스 개발
   - 지도 연동 기능
   - 맥락 인식 응답 개선

5. **마무리 및 최적화**
   - 일정 공유 및 저장 기능
   - UI/UX 개선
   - 성능 최적화

## 5. 기술 스택 확인

- **프론트엔드**: Next.js 14, TypeScript, TailwindCSS, Shadcn UI
- **백엔드**: Supabase (Auth, Database, Storage, Realtime)
- **AI/ML**: OpenAI API, LangChain, Pinecone
- **지도**: Kakao Maps API, Kakao Local API

## 6. 프론트엔드 파일 구조 조정

프론트엔드 파일 구조를 PRD의 페이지 흐름에 맞게 조정:

```
frontend/src/app/
├── page.tsx (랜딩/로그인)
├── mypage/ (마이페이지)
├── signup/ (회원가입)
├── invite/[code]/ (초대 페이지)
├── rooms/ (방 목록 및 관리)
│   ├── create/ (방 생성)
│   └── [roomId]/ (방 상세)
│       ├── chat/ (팀 채팅)
│       ├── assistant/ (AI 어시스턴트)
│       ├── invite/ (초대 관리)
│       ├── preferences/ (사용자 선호도)
│       ├── routes/ (동선 및 장소)
│       ├── waiting/ (대기실)
│       └── result/ (최종 결과)
└── api/ (백엔드 API)
```

## 7. 컴포넌트 개발 계획

1. **지도 관련 컴포넌트**
   - KakaoMap.tsx (기본 지도)
   - PlaceMarker.tsx (장소 마커)
   - RouteVisualization.tsx (동선 표시)
   - InfoWindow.tsx (정보 창)

2. **장소 관련 컴포넌트**
   - PlaceCard.tsx (장소 카드)
   - PlaceList.tsx (장소 목록)
   - PlaceDetail.tsx (장소 상세)
   - VoteButton.tsx (붐업/붐다운)

3. **채팅 관련 컴포넌트**
   - ChatBox.tsx (채팅 창)
   - MessageItem.tsx (메시지 항목)
   - AIAssistant.tsx (AI 채팅)
   - InputBox.tsx (메시지 입력)

4. **일정 관련 컴포넌트**
   - TimelineView.tsx (타임라인)
   - ScheduleCard.tsx (일정 카드)
   - ShareOptions.tsx (공유 옵션)
   - ExportButton.tsx (내보내기)

5. **공통 컴포넌트**
   - UserAvatar.tsx (사용자 아바타)
   - LoadingIndicator.tsx (로딩 표시)
   - ErrorDisplay.tsx (오류 표시)
   - Notification.tsx (알림)

위와 같은 작업들을 통해 PRD에 명시된 모든 기능을 구현할 수 있습니다. 