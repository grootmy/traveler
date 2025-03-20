import { Server } from 'socket.io';
import http from 'http';
import { supabase } from './supabase';

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
      
      // 참가 메시지를 방에 브로드캐스트
      socket.to(roomId).emit('user-joined', { 
        userId,
        timestamp: new Date().toISOString()
      });
    });
    
    // 방 나가기
    socket.on('leave-room', (roomId: string, userId: string) => {
      socket.leave(roomId);
      console.log(`사용자 ${userId}가 방 ${roomId}에서 나갔습니다.`);
      
      // 퇴장 메시지를 방에 브로드캐스트
      socket.to(roomId).emit('user-left', { 
        userId,
        timestamp: new Date().toISOString()
      });
    });
    
    // 성향 테스트 완료
    socket.on('preferences-completed', (roomId: string, userId: string) => {
      socket.to(roomId).emit('user-ready', userId);
      console.log(`사용자 ${userId}가 성향 테스트를 완료했습니다.`);
    });
    
    // 투표 업데이트
    socket.on('vote-update', (roomId: string, userId: string, routeId: string, voteType: string) => {
      socket.to(roomId).emit('vote-updated', { userId, routeId, voteType });
      console.log(`사용자 ${userId}가 경로 ${routeId}에 ${voteType} 투표했습니다.`);
    });
    
    // 경로 선택
    socket.on('route-selected', (roomId: string, routeId: string) => {
      io.to(roomId).emit('final-route', routeId);
      console.log(`방 ${roomId}에서 경로 ${routeId}가 최종 선택되었습니다.`);
    });
    
    // 팀 채팅 메시지
    socket.on('team-chat', async (data: { 
      roomId: string,
      userId: string,
      message: string,
      isAiChat: boolean
    }) => {
      try {
        // Supabase에 메시지 저장
        const { data: chatData, error } = await supabase
          .from('chat_messages')
          .insert({
            room_id: data.roomId,
            user_id: data.userId,
            content: data.message,
            is_ai: false,
            is_ai_chat: data.isAiChat
          })
          .select();
        
        if (error) throw error;
        
        // 메시지를 방에 브로드캐스트
        io.to(data.roomId).emit('chat-message', {
          textid: chatData[0].textid,
          room_id: data.roomId,
          user_id: data.userId,
          content: data.message,
          is_ai: false,
          is_ai_chat: data.isAiChat,
          created_at: chatData[0].created_at,
        });
        
        console.log(`사용자 ${data.userId}가 방 ${data.roomId}에 메시지를 보냈습니다.`);
      } catch (err) {
        console.error('채팅 메시지 저장 오류:', err);
        socket.emit('error', { message: '메시지 전송 중 오류가 발생했습니다.' });
      }
    });
    
    // 타이핑 상태 (사용자가 입력 중...)
    socket.on('typing', (roomId: string, userId: string, isTyping: boolean) => {
      socket.to(roomId).emit('user-typing', { userId, isTyping });
    });
    
    socket.on('disconnect', () => {
      console.log('사용자가 연결을 해제했습니다:', socket.id);
    });
  });

  return io;
} 