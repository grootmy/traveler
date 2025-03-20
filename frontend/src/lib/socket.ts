import { io, Socket } from 'socket.io-client';

// 싱글톤 패턴으로 소켓 관리
let socket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

// 소켓 연결 함수
export const initializeSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    // 기본 이벤트 핸들러
    socket.on('connect', () => {
      console.log('Socket connected:', socket?.id);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
  }

  return socket;
};

// 소켓 가져오기
export const getSocket = (): Socket => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

// 방 입장
export const joinRoom = (roomId: string, userId: string): void => {
  const socket = getSocket();
  socket.emit('join-room', roomId, userId);
};

// 방 퇴장
export const leaveRoom = (roomId: string, userId: string): void => {
  const socket = getSocket();
  socket.emit('leave-room', roomId, userId);
};

// 투표 업데이트 이벤트 전송
export const emitVoteUpdate = (roomId: string, userId: string, routeId: string, voteType: 'like' | 'dislike' | null): void => {
  const socket = getSocket();
  socket.emit('vote-update', roomId, userId, routeId, voteType);
};

// 경로 선택 이벤트 전송
export const emitRouteSelection = (roomId: string, routeId: string): void => {
  const socket = getSocket();
  socket.emit('route-selected', roomId, routeId);
};

// 성향 테스트 완료 이벤트 전송
export const emitPreferencesCompleted = (roomId: string, userId: string): void => {
  const socket = getSocket();
  socket.emit('preferences-completed', roomId, userId);
};

// 팀 채팅 메시지 전송
export const sendChatMessage = (roomId: string, userId: string, message: string, isAiChat: boolean = false): void => {
  const socket = getSocket();
  socket.emit('team-chat', { roomId, userId, message, isAiChat });
};

// 타이핑 상태 전송
export const sendTypingStatus = (roomId: string, userId: string, isTyping: boolean): void => {
  const socket = getSocket();
  socket.emit('typing', roomId, userId, isTyping);
};

// 채팅 메시지 수신 리스너 등록
export const listenForChatMessages = (callback: (message: any) => void): () => void => {
  const socket = getSocket();
  socket.on('chat-message', callback);
  
  // 클린업 함수 반환
  return () => {
    socket.off('chat-message', callback);
  };
};

// 투표 업데이트 리스너 등록
export const listenForVoteUpdates = (callback: (data: { userId: string, routeId: string, voteType: string }) => void): () => void => {
  const socket = getSocket();
  socket.on('vote-updated', callback);
  
  // 클린업 함수 반환
  return () => {
    socket.off('vote-updated', callback);
  };
};

// 최종 경로 선택 리스너 등록
export const listenForFinalRoute = (callback: (routeId: string) => void): () => void => {
  const socket = getSocket();
  socket.on('final-route', callback);
  
  // 클린업 함수 반환
  return () => {
    socket.off('final-route', callback);
  };
};

// 타이핑 상태 리스너 등록
export const listenForTypingStatus = (callback: (data: { userId: string, isTyping: boolean }) => void): () => void => {
  const socket = getSocket();
  socket.on('user-typing', callback);
  
  // 클린업 함수 반환
  return () => {
    socket.off('user-typing', callback);
  };
};

// 사용자 입장/퇴장 리스너 등록
export const listenForUserPresence = (
  joinCallback: (data: { userId: string, timestamp: string }) => void,
  leaveCallback: (data: { userId: string, timestamp: string }) => void
): () => void => {
  const socket = getSocket();
  socket.on('user-joined', joinCallback);
  socket.on('user-left', leaveCallback);
  
  // 클린업 함수 반환
  return () => {
    socket.off('user-joined', joinCallback);
    socket.off('user-left', leaveCallback);
  };
};

// 소켓 연결 해제
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}; 