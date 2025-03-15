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
export const subscribeToPreferencesCompleted = (
  roomId: string,
  callback: (payload: { userId: string; nickname: string }) => void
) => {
  const subscription = subscriptions[roomId];
  if (!subscription) {
    return;
  }

  const eventName = 'preferences_completed';
  
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
 * 성향 테스트 완료 알림을 보냅니다.
 */
export const notifyPreferencesCompletedRealtime = async (
  roomId: string,
  userId: string,
  nickname: string
) => {
  const channel = joinRoomRealtime(roomId);
  
  // 브로드캐스트 메시지 전송
  await channel.send({
    type: 'broadcast',
    event: 'preferences_completed',
    payload: { userId, nickname },
  });
  
  console.log(`사용자 ${userId}가 성향 테스트를 완료했습니다.`);
};

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