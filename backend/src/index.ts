import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
// Socket.io 임포트 주석 해제
import { setupSocketIO } from './socket';
import recommendationsRouter from './routes/recommendations';
// Supabase 클라이언트 임포트
import { supabase } from './supabase';

// 환경 변수 로드
dotenv.config();

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 4000;

// 미들웨어 설정
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// 라우트 설정
app.use('/api/recommendations', recommendationsRouter);

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: '여행 서비스 API 서버입니다.' });
});

// HTTP 서버 생성
const server = http.createServer(app);

// Socket.IO 설정 활성화
const io = setupSocketIO(server);

// Supabase 연결 확인
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Supabase 연결 오류:', error);
  } else {
    console.log('Supabase에 성공적으로 연결되었습니다.');
  }
});

// 서버 시작
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Socket.IO가 활성화되었습니다.`);
}); 