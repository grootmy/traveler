# 당일치기 여행 추천 서비스 - 백엔드

당일치기 여행 장소 및 경로 추천 서비스의 백엔드 코드입니다.

## 기술 스택

- Node.js
- Express
- TypeScript
- Socket.IO
- Supabase
- LangChain
- OpenAI

## 설치 방법

1. 저장소 클론

```bash
git clone <repository-url>
cd travel-service/backend
```

2. 의존성 설치

```bash
npm install
```

3. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 환경 변수를 설정합니다.

```bash
cp .env.example .env
```

## 실행 방법

### 개발 모드

```bash
npm run dev
```

### 빌드 및 실행

```bash
npm run build
npm start
```

## API 엔드포인트

### 경로 추천

- `POST /api/recommendations/generate`: 사용자 성향에 맞는 여행 경로 생성
- `POST /api/recommendations/chat`: AI 챗봇과 대화

## Socket.IO 이벤트

### 클라이언트 → 서버

- `join-room`: 방 참가
- `leave-room`: 방 나가기
- `preferences-completed`: 성향 테스트 완료
- `vote-update`: 경로 투표 업데이트
- `route-selected`: 최종 경로 선택

### 서버 → 클라이언트

- `user-ready`: 사용자 준비 완료
- `vote-updated`: 투표 업데이트
- `final-route`: 최종 경로 선택 