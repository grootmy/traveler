# 당일치기 여행 추천 서비스

당일치기 여행 추천 서비스는 사용자들이 함께 여행할 친구들과 협업하여 최적의 당일치기 여행 계획을 세울 수 있도록 도와주는 웹 애플리케이션입니다.

## 주요 기능

- **사용자 인증**: Supabase를 활용한 이메일 기반 회원가입 및 로그인
- **여행 방 생성 및 초대**: 여행 방을 생성하고 초대 링크를 통해 친구들을 초대
- **성향 테스트**: 각 참여자의 여행 성향을 파악하기 위한 테스트
- **경로 추천**: 참여자들의 성향을 분석하여 최적의 여행 경로 추천
- **경로 투표**: 추천된 경로에 대한 투표 시스템
- **최종 경로 선택**: 투표 결과를 바탕으로 최종 경로 선택
- **AI 챗봇**: 여행 관련 질문에 답변해주는 AI 챗봇

## 기술 스택

### 프론트엔드
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Socket.io Client
- Supabase Client

### 백엔드
- Express.js
- TypeScript
- Socket.io
- LangChain
- LangGraph.js

### 데이터베이스
- Supabase (PostgreSQL)

### 인공지능
- OpenAI API (GPT-4)

## 프로젝트 구조

```
travel_service/
├── frontend/                # 프론트엔드 코드
│   ├── public/              # 정적 파일
│   │   └── index.html       # 메인 페이지
│   ├── src/                 # 소스 코드
│   │   ├── app/             # Next.js 앱 라우터
│   │   ├── components/      # 리액트 컴포넌트
│   │   ├── lib/             # 유틸리티 및 API 클라이언트
│   │   │   ├── api.ts       # 백엔드 API 클라이언트
│   │   │   └── supabase/    # Supabase 클라이언트
│   │   └── providers/       # 리액트 컨텍스트 프로바이더
│   ├── .env.local           # 환경 변수 (로컬)
│   └── package.json         # 의존성 및 스크립트
│
├── backend/                 # 백엔드 코드
│   ├── src/                 # 소스 코드
│   │   ├── index.ts         # 메인 서버 파일
│   │   ├── routes/          # API 라우트
│   │   ├── services/        # 비즈니스 로직
│   │   └── socket.ts        # Socket.io 설정
│   ├── .env                 # 환경 변수
│   └── package.json         # 의존성 및 스크립트
│
└── supabase_schema.sql      # Supabase 데이터베이스 스키마
```

## 설치 및 실행 방법

### 사전 요구사항
- Node.js 18 이상
- npm 또는 yarn
- Supabase 계정
- OpenAI API 키

### 프론트엔드 설정
1. 프론트엔드 디렉토리로 이동
   ```bash
   cd frontend
   ```

2. 의존성 설치
   ```bash
   npm install
   ```

3. 환경 변수 설정
   `.env.local` 파일을 생성하고 다음 변수 설정:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_API_URL=http://localhost:4000
   NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
   NEXT_PUBLIC_KAKAO_MAP_API_KEY=your_kakao_map_api_key
   ```

4. 개발 서버 실행
   ```bash
   npm run dev
   ```

### 백엔드 설정
1. 백엔드 디렉토리로 이동
   ```bash
   cd backend
   ```

2. 의존성 설치
   ```bash
   npm install
   ```

3. 환경 변수 설정
   `.env` 파일을 생성하고 다음 변수 설정:
   ```
   PORT=4000
   NODE_ENV=development
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_api_key
   FRONTEND_URL=http://localhost:3000
   SESSION_SECRET=your_session_secret_key
   ```

4. 개발 서버 실행
   ```bash
   npm run dev
   ```

### Supabase 데이터베이스 설정
1. Supabase 프로젝트 생성
2. SQL 에디터에서 `supabase_schema.sql` 파일의 내용을 실행하여 필요한 테이블과 정책 생성

## 사용 흐름

1. 사용자 회원가입/로그인
2. 여행 방 생성 또는 초대 링크를 통해 참여
3. 성향 테스트 완료
4. 모든 참여자가 준비되면 경로 추천 생성
5. 추천된 경로에 투표
6. 최종 경로 선택 및 확인
7. AI 챗봇을 통해 여행 관련 질문 및 답변

## 개발자 정보

이 프로젝트는 당일치기 여행 계획을 쉽고 재미있게 만들기 위해 개발되었습니다.
