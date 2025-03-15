# 당일치기 여행 추천 서비스 프로젝트 요약

## 프로젝트 개요

당일치기 여행 추천 서비스는 사용자들이 함께 여행할 친구들과 협업하여 최적의 당일치기 여행 계획을 세울 수 있도록 도와주는 웹 애플리케이션입니다. 이 서비스는 사용자들의 선호도를 분석하여 최적의 여행 경로를 추천하고, 실시간 협업 기능을 통해 함께 여행 계획을 세울 수 있는 플랫폼을 제공합니다.

## 핵심 기능

### 1. 사용자 인증 및 프로필 관리
- Supabase Auth를 활용한 이메일 기반 회원가입 및 로그인
- 사용자 프로필 관리 (닉네임, 프로필 이미지 등)

### 2. 여행 방 생성 및 관리
- 여행 방 생성 (제목, 지역, 예상 인원 등 설정)
- 초대 코드를 통한 친구 초대 기능
- 방 참여자 목록 및 상태 확인

### 3. 성향 테스트
- 여행 선호도 파악을 위한 성향 테스트
- 선호하는 장소 유형, 활동, 음식 등에 대한 질문
- 테스트 결과 저장 및 분석

### 4. 경로 추천 시스템
- LangGraph.js를 활용한 AI 기반 경로 추천
- 참여자들의 선호도를 종합적으로 분석하여 최적의 경로 제안
- 여러 개의 경로 옵션 제공

### 5. 실시간 협업 기능
- Socket.io를 활용한 실시간 상태 업데이트
- 참여자들의 준비 상태 실시간 확인
- 경로 투표 결과 실시간 반영

### 6. 경로 투표 및 선택
- 추천된 경로에 대한 투표 시스템
- 투표 결과 시각화
- 최종 경로 선택 및 확정

### 7. AI 챗봇 지원
- 여행 관련 질문에 답변해주는 AI 챗봇
- 선택된 경로에 대한 추가 정보 제공
- 여행 팁 및 추천 사항 제공

## 기술적 구현

### 프론트엔드
- **Next.js 15**: 서버 사이드 렌더링 및 정적 생성 지원
- **React 19**: 최신 리액트 기능 활용
- **TypeScript**: 타입 안정성 확보
- **Tailwind CSS**: 반응형 UI 구현
- **Socket.io Client**: 실시간 통신 구현
- **Supabase Client**: 데이터베이스 및 인증 연동

### 백엔드
- **Express.js**: REST API 구현
- **TypeScript**: 타입 안정성 확보
- **Socket.io**: 실시간 양방향 통신
- **LangChain & LangGraph.js**: AI 워크플로우 구현
- **OpenAI API**: GPT 모델을 활용한 자연어 처리

### 데이터베이스
- **Supabase (PostgreSQL)**: 관계형 데이터베이스
- **Row Level Security (RLS)**: 데이터 접근 제어
- **실시간 구독**: 데이터 변경 실시간 감지

## 데이터 모델

### 사용자 (users)
- id: UUID (PK)
- email: TEXT
- display_name: TEXT
- avatar_url: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### 사용자 선호도 (user_preferences)
- id: UUID (PK)
- user_id: UUID (FK -> users.id)
- preferences: JSONB
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### 여행 방 (rooms)
- id: UUID (PK)
- title: TEXT
- owner_id: UUID (FK -> users.id)
- region: TEXT
- budget: INTEGER
- start_time: TIMESTAMP
- end_time: TIMESTAMP
- expected_members: INTEGER
- invite_code: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### 방 멤버 (room_members)
- id: UUID (PK)
- room_id: UUID (FK -> rooms.id)
- user_id: UUID (FK -> users.id)
- relationship: TEXT
- preferences: JSONB
- is_ready: BOOLEAN
- joined_at: TIMESTAMP

### 추천 경로 (routes)
- id: UUID (PK)
- room_id: UUID (FK -> rooms.id)
- route_data: JSONB
- travel_time: INTEGER
- total_cost: INTEGER
- created_at: TIMESTAMP

### 경로 투표 (route_votes)
- id: UUID (PK)
- route_id: UUID (FK -> routes.id)
- user_id: UUID (FK -> users.id)
- vote_value: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### 최종 선택 경로 (selected_routes)
- id: UUID (PK)
- room_id: UUID (FK -> rooms.id)
- route_id: UUID (FK -> routes.id)
- selected_by: UUID (FK -> users.id)
- selected_at: TIMESTAMP

### 채팅 메시지 (chat_messages)
- id: UUID (PK)
- room_id: UUID (FK -> rooms.id)
- user_id: UUID (FK -> users.id)
- is_ai: BOOLEAN
- message: TEXT
- created_at: TIMESTAMP

## 사용자 흐름

1. **회원가입/로그인**: 사용자는 이메일을 통해 회원가입하거나 로그인합니다.
2. **방 생성/참여**: 새로운 여행 방을 생성하거나 초대 코드를 통해 기존 방에 참여합니다.
3. **성향 테스트**: 여행 선호도를 파악하기 위한 성향 테스트를 완료합니다.
4. **대기 화면**: 모든 참여자가 성향 테스트를 완료할 때까지 대기합니다.
5. **경로 추천**: 모든 참여자가 준비되면 AI가 여러 경로를 추천합니다.
6. **경로 투표**: 참여자들은 추천된 경로에 투표합니다.
7. **최종 선택**: 방장은 투표 결과를 바탕으로 최종 경로를 선택합니다.
8. **결과 확인**: 모든 참여자는 최종 선택된 경로를 확인하고 공유할 수 있습니다.
9. **AI 챗봇 활용**: 여행 관련 질문이 있을 경우 AI 챗봇을 통해 답변을 받을 수 있습니다.

## 향후 개선 사항

1. **소셜 로그인 추가**: 카카오, 구글 등 소셜 로그인 옵션 추가
2. **경로 공유 기능**: SNS를 통한 경로 공유 기능 구현
3. **지도 통합 강화**: 카카오맵 API를 활용한 상세 경로 시각화
4. **알림 시스템**: 푸시 알림 및 이메일 알림 기능 추가
5. **모바일 앱 개발**: 네이티브 모바일 앱 버전 개발
6. **다국어 지원**: 영어, 일본어 등 다국어 지원 추가
7. **여행 후기 시스템**: 사용자들이 여행 후기를 공유할 수 있는 기능 추가

## 결론

당일치기 여행 추천 서비스는 AI 기술과 실시간 협업 기능을 결합하여 사용자들이 쉽고 효율적으로 여행 계획을 세울 수 있도록 도와줍니다. Supabase를 활용한 데이터베이스 관리와 LangGraph.js를 활용한 AI 워크플로우를 통해 사용자 경험을 극대화하고, 최적의 여행 경로를 제공하는 것을 목표로 합니다. 