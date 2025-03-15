import { Server } from 'socket.io';
import http from 'http';

export function setupSocketIO(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('사용자가 연결되었습니다:', socket.id);
    
    // 방 참가
    socket.on('join-room', (roomId: string, userId: string) => {
      socket.join(roomId);
      console.log(`사용자 ${userId}가 방 ${roomId}에 참가했습니다.`);
    });
    
    // 방 나가기
    socket.on('leave-room', (roomId: string, userId: string) => {
      socket.leave(roomId);
      console.log(`사용자 ${userId}가 방 ${roomId}에서 나갔습니다.`);
    });
    
    // 성향 테스트 완료
    socket.on('preferences-completed', (roomId: string, userId: string) => {
      socket.to(roomId).emit('user-ready', userId);
      console.log(`사용자 ${userId}가 성향 테스트를 완료했습니다.`);
    });
    
    // 투표 업데이트
    socket.on('vote-update', (roomId: string, userId: string, routeId: string) => {
      socket.to(roomId).emit('vote-updated', { userId, routeId });
      console.log(`사용자 ${userId}가 경로 ${routeId}에 투표했습니다.`);
    });
    
    // 경로 선택
    socket.on('route-selected', (roomId: string, routeId: string) => {
      io.to(roomId).emit('final-route', routeId);
      console.log(`방 ${roomId}에서 경로 ${routeId}가 최종 선택되었습니다.`);
    });
    
    socket.on('disconnect', () => {
      console.log('사용자가 연결을 해제했습니다:', socket.id);
    });
  });

  return io;
} 