import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initializeSocket = () => {
  if (!socket) {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    socket = io(socketUrl);
    
    socket.on('connect', () => {
      console.log('Socket connected:', socket?.id);
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }
  
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const joinRoom = (roomId: string) => {
  const socket = getSocket();
  socket.emit('join-room', roomId);
};

export const leaveRoom = (roomId: string) => {
  const socket = getSocket();
  socket.emit('leave-room', roomId);
};

export const notifyPreferencesCompleted = (roomId: string, userId: string, nickname: string) => {
  const socket = getSocket();
  socket.emit('preferences-completed', { roomId, userId, nickname });
};

export const updateVote = (roomId: string, routeId: string, userId: string, voteType: 'like' | 'dislike') => {
  const socket = getSocket();
  socket.emit('vote-update', { roomId, routeId, userId, voteType });
};

export const selectRoute = (roomId: string, routeId: string) => {
  const socket = getSocket();
  socket.emit('route-selected', { roomId, routeId });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}; 