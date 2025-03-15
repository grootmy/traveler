import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

// Supabase 클라이언트 생성
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase URL 또는 Service Role Key가 설정되지 않았습니다.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * 성향 테스트 완료 알림을 보냅니다.
 */
export const notifyPreferencesCompleted = async (
  roomId: string,
  userId: string,
  nickname: string
) => {
  try {
    // 방 채널 생성
    const channel = supabase.channel(`room:${roomId}`);
    
    // 브로드캐스트 메시지 전송
    await channel.send({
      type: 'broadcast',
      event: 'preferences_completed',
      payload: { userId, nickname },
    });
    
    // 채널 구독 해제
    channel.unsubscribe();
    
    console.log(`사용자 ${userId}가 성향 테스트를 완료했습니다.`);
  } catch (error) {
    console.error('성향 테스트 완료 알림 전송 오류:', error);
  }
};

/**
 * 투표 업데이트 알림을 보냅니다.
 */
export const updateVote = async (
  roomId: string,
  routeId: string,
  userId: string,
  voteType: 'like' | 'dislike'
) => {
  try {
    // 방 채널 생성
    const channel = supabase.channel(`room:${roomId}`);
    
    // 브로드캐스트 메시지 전송
    await channel.send({
      type: 'broadcast',
      event: 'vote_updated',
      payload: { routeId, userId, voteType },
    });
    
    // 채널 구독 해제
    channel.unsubscribe();
    
    console.log(`사용자 ${userId}가 경로 ${routeId}에 ${voteType} 투표했습니다.`);
  } catch (error) {
    console.error('투표 업데이트 알림 전송 오류:', error);
  }
};

/**
 * 최종 경로 선택 알림을 보냅니다.
 */
export const selectRoute = async (roomId: string, routeId: string) => {
  try {
    // 방 채널 생성
    const channel = supabase.channel(`room:${roomId}`);
    
    // 브로드캐스트 메시지 전송
    await channel.send({
      type: 'broadcast',
      event: 'route_selected',
      payload: { routeId },
    });
    
    // 채널 구독 해제
    channel.unsubscribe();
    
    console.log(`방 ${roomId}에서 경로 ${routeId}가 최종 선택되었습니다.`);
  } catch (error) {
    console.error('경로 선택 알림 전송 오류:', error);
  }
}; 