'use client'

import { useEffect } from 'react'
import { initializeSocket } from '@/lib/socket'

export function SocketInitializer() {
  useEffect(() => {
    const socket = initializeSocket();
    
    return () => {
      // 페이지가 언마운트될 때 연결 닫기
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // UI 렌더링 없이 초기화 로직만 수행
  return null;
}