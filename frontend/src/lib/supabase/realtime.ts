import { supabase } from './client';

// 채널 구독 상태를 저장하는 객체
const subscriptions: Record<string, { channel: any; listeners: Set<string> }> = {};

/**
 * 방에 참가하고 실시간 업데이트를 구독합니다.
 */
export const joinRoomRealtime = (roomId: string) => {
  if (subscriptions[roomId]) {
    return subscriptions[roomId].channel;
  }

  // 방 채널 구독
  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      broadcast: { self: false },
    },
  });

  // 구독 정보 저장
  subscriptions[roomId] = {
    channel,
    listeners: new Set(),
  };

  // 채널 구독 시작
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`방 ${roomId}에 연결되었습니다.`);
    }
  });

  return channel;
};

/**
 * 방에서 나가고 실시간 업데이트 구독을 취소합니다.
 */
export const leaveRoomRealtime = (roomId: string) => {
  const subscription = subscriptions[roomId];
  if (subscription) {
    subscription.channel.unsubscribe();
    delete subscriptions[roomId];
    console.log(`방 ${roomId}에서 연결이 해제되었습니다.`);
  }
};

/**
 * 성향 테스트 완료 알림을 구독합니다.
 */
// export const subscribeToPreferencesCompleted = (
//   roomId: string,
//   callback: (payload: { userId: string; nickname: string }) => void
// ) => {
//   const subscription = subscriptions[roomId];
//   if (!subscription) {
//     return;
//   }

//   const eventName = 'preferences_completed';
  
//   // 이미 등록된 리스너가 있는지 확인
//   if (subscription.listeners.has(eventName)) {
//     return;
//   }

//   subscription.listeners.add(eventName);
  
//   // 브로드캐스트 메시지 수신 설정
//   subscription.channel.on('broadcast', { event: eventName }, (payload: any) => {
//     callback(payload);
//   });
// };

// /**
//  * 성향 테스트 완료 알림을 보냅니다.
//  */
// export const notifyPreferencesCompletedRealtime = async (
//   roomId: string,
//   userId: string,
//   nickname: string
// ) => {
//   const channel = joinRoomRealtime(roomId);
  
//   // 브로드캐스트 메시지 전송
//   await channel.send({
//     type: 'broadcast',
//     event: 'preferences_completed',
//     payload: { userId, nickname },
//   });
  
//   console.log(`사용자 ${userId}가 성향 테스트를 완료했습니다.`);
// };

/**
 * 투표 업데이트 알림을 구독합니다.
 */
export const subscribeToVoteUpdates = (
  roomId: string,
  callback: (payload: { routeId: string; userId: string; voteType: 'like' | 'dislike' }) => void
) => {
  const subscription = subscriptions[roomId];
  if (!subscription) {
    return;
  }

  const eventName = 'vote_updated';
  
  // 이미 등록된 리스너가 있는지 확인
  if (subscription.listeners.has(eventName)) {
    return;
  }

  subscription.listeners.add(eventName);
  
  // 브로드캐스트 메시지 수신 설정
  subscription.channel.on('broadcast', { event: eventName }, (payload: any) => {
    callback(payload);
  });
};

/**
 * 투표 업데이트 알림을 보냅니다.
 */
export const updateVoteRealtime = async (
  roomId: string,
  routeId: string,
  userId: string,
  voteType: 'like' | 'dislike'
) => {
  const channel = joinRoomRealtime(roomId);
  
  // 브로드캐스트 메시지 전송
  await channel.send({
    type: 'broadcast',
    event: 'vote_updated',
    payload: { routeId, userId, voteType },
  });
  
  console.log(`사용자 ${userId}가 경로 ${routeId}에 ${voteType} 투표했습니다.`);
};

/**
 * 최종 경로 선택 알림을 구독합니다.
 */
export const subscribeToRouteSelection = (
  roomId: string,
  callback: (payload: { routeId: string }) => void
) => {
  const subscription = subscriptions[roomId];
  if (!subscription) {
    return;
  }

  const eventName = 'route_selected';
  
  // 이미 등록된 리스너가 있는지 확인
  if (subscription.listeners.has(eventName)) {
    return;
  }

  subscription.listeners.add(eventName);
  
  // 브로드캐스트 메시지 수신 설정
  subscription.channel.on('broadcast', { event: eventName }, (payload: any) => {
    callback(payload);
  });
};

/**
 * 최종 경로 선택 알림을 보냅니다.
 */
export const selectRouteRealtime = async (roomId: string, routeId: string) => {
  const channel = joinRoomRealtime(roomId);
  
  // 브로드캐스트 메시지 전송
  await channel.send({
    type: 'broadcast',
    event: 'route_selected',
    payload: { routeId },
  });
  
  console.log(`방 ${roomId}에서 경로 ${routeId}가 최종 선택되었습니다.`);
};

/**
 * 데이터베이스 변경 사항을 구독합니다.
 */
export const subscribeToTableChanges = (
  roomId: string,
  table: string,
  callback: (payload: any) => void,
  filter?: string
) => {
  const subscription = subscriptions[roomId];
  if (!subscription) {
    return;
  }

  const eventName = `${table}_changes`;
  
  // 이미 등록된 리스너가 있는지 확인
  if (subscription.listeners.has(eventName)) {
    return;
  }

  subscription.listeners.add(eventName);
  
  // 테이블 변경 사항 구독
  const channel = subscription.channel;
  
  if (filter) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter,
      },
      (payload: any) => {
        callback(payload);
      }
    );
  } else {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
      },
      (payload: any) => {
        callback(payload);
      }
    );
  }
};

/**
 * 모든 실시간 구독을 정리합니다.
 */
export const cleanupRealtimeSubscriptions = () => {
  Object.keys(subscriptions).forEach((roomId) => {
    leaveRoomRealtime(roomId);
  });
};

/**
 * 채팅 메시지 구독을 설정합니다.
 */
export const subscribeToChatMessages = (
  roomId: string,
  callback: (message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string;
      avatar?: string;
    };
    timestamp: Date;
    isAI: boolean;
    isAIChat: boolean;
  }) => void
) => {
  try {
    const channel = joinRoomRealtime(roomId);
    
    // 채팅 메시지 테이블 변경 구독
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`
      },
      async (payload: any) => {
        const message = payload.new;
        
        // AI 메시지인 경우 바로 처리
        if (message.is_ai) {
          callback({
            id: message.textid,
            content: message.content,
            sender: {
              id: 'ai',
              name: 'AI 비서',
              avatar: undefined
            },
            timestamp: new Date(message.created_at),
            isAI: true,
            isAIChat: message.is_ai_chat
          });
          return;
        }
        
        // 사용자 메시지인 경우 사용자 정보 조회
        try {
          // 사용자 ID가 없는 경우 (익명 사용자)
          if (!message.user_id) {
            callback({
              id: message.textid,
              content: message.content,
              sender: {
                id: 'anonymous',
                name: '익명 사용자',
                avatar: undefined
              },
              timestamp: new Date(message.created_at),
              isAI: false,
              isAIChat: message.is_ai_chat
            });
            return;
          }
          
          // Supabase에서 사용자 정보 조회
          const { data: userData, error } = await supabase
            .from('users')
            .select('id, display_name, avatar_url')
            .eq('id', message.user_id)
            .single();
          
          if (error || !userData) {
            console.error('사용자 정보 조회 실패:', error);
            // 사용자 정보 조회 실패 시 기본값 사용
            callback({
              id: message.textid,
              content: message.content,
              sender: {
                id: message.user_id,
                name: '사용자',
                avatar: undefined
              },
              timestamp: new Date(message.created_at),
              isAI: false,
              isAIChat: message.is_ai_chat
            });
            return;
          }
          
          // 사용자 데이터로 메시지 콜백 호출
          callback({
            id: message.textid,
            content: message.content,
            sender: {
              id: message.user_id,
              name: userData.display_name || '사용자',
              avatar: userData.avatar_url
            },
            timestamp: new Date(message.created_at),
            isAI: false,
            isAIChat: message.is_ai_chat
          });
        } catch (userError) {
          console.error('사용자 정보 처리 중 오류:', userError);
          // 오류 발생 시 기본값으로 콜백 호출
          callback({
            id: message.textid,
            content: message.content,
            sender: {
              id: message.user_id || 'unknown',
              name: '사용자',
              avatar: undefined
            },
            timestamp: new Date(message.created_at),
            isAI: false,
            isAIChat: message.is_ai_chat
          });
        }
      }
    );
    
    console.log(`방 ${roomId}의 채팅 메시지 구독 완료`);
  } catch (error) {
    console.error('채팅 메시지 구독 실패:', error);
  }
};

/**
 * 채팅 메시지 브로드캐스트 구독을 설정합니다.
 * (사용자 정보를 포함한 실시간 메시지 전송용)
 */
export const subscribeToChatBroadcast = (
  roomId: string,
  callback: (message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string;
      avatar?: string;
    };
    timestamp: Date;
    isAI: boolean;
  }) => void
) => {
  const subscription = subscriptions[roomId];
  if (!subscription) {
    return;
  }

  const eventName = 'chat_message';
  
  // 이미 등록된 리스너가 있는지 확인
  if (subscription.listeners.has(eventName)) {
    return;
  }

  subscription.listeners.add(eventName);
  
  // 브로드캐스트 메시지 수신 설정
  subscription.channel.on('broadcast', { event: eventName }, (payload: any) => {
    callback(payload);
  });
  
  console.log(`방 ${roomId}의 채팅 브로드캐스트 구독 완료`);
};

/**
 * 채팅 메시지를 브로드캐스트합니다.
 */
export const broadcastChatMessage = async (
  roomId: string, 
  message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string;
      avatar?: string;
    };
    timestamp: Date;
    isAI: boolean;
  }
) => {
  const channel = joinRoomRealtime(roomId);
  
  // 브로드캐스트 메시지 전송
  await channel.send({
    type: 'broadcast',
    event: 'chat_message',
    payload: message,
  });
  
  console.log(`방 ${roomId}에 채팅 메시지 브로드캐스트 완료`);
}; 