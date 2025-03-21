import { RealtimeChannel, REALTIME_LISTEN_TYPES, REALTIME_PRESENCE_LISTEN_EVENTS } from '@supabase/supabase-js'
import { supabase } from './client'
import { v4 as uuidv4 } from 'uuid'

// 모든 구독 상태를 추적하는 객체
type SubscriptionStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | 'SUBSCRIPTION_ERROR'

interface SubscriptionInfo {
  channel: RealtimeChannel
  status: SubscriptionStatus
  lastError?: Error
  reconnecting: boolean
  reconnectTimeout?: NodeJS.Timeout
}

const subscriptions: Record<string, SubscriptionInfo> = {}

// 재연결 스케줄러
const scheduleReconnect = (roomId: string, delay: number = 5000) => {
  // 이미 재연결 시도 중이면 중복 실행 방지
  if (subscriptions[roomId]?.reconnecting) {
    console.log(`[Realtime] 방 ${roomId}에 대한 재연결이 이미 진행 중입니다`)
    return
  }
  
  // 기존 타임아웃이 있으면 취소
  if (subscriptions[roomId]?.reconnectTimeout) {
    clearTimeout(subscriptions[roomId].reconnectTimeout)
  }
  
  console.log(`[Realtime] 방 ${roomId}에 대한 재연결 예약 (${delay}ms 후)`)
  
  // 재연결 상태 설정 및 타이머 등록
  if (subscriptions[roomId]) {
    subscriptions[roomId].reconnecting = true
    subscriptions[roomId].reconnectTimeout = setTimeout(() => {
      try {
        console.log(`[Realtime] 방 ${roomId}에 재연결 시도 중...`)
        delete subscriptions[roomId]  // 기존 구독 정보 삭제
        joinRoomRealtime(roomId)  // 새로운 채널 생성
      } catch (error) {
        console.error(`[Realtime] 방 ${roomId} 재연결 실패:`, error)
        // 재연결 실패 시 더 긴 간격으로 다시 시도
        scheduleReconnect(roomId, Math.min(delay * 1.5, 30000))
      }
    }, delay)
  }
}

/**
 * 지정된 방에 대한 Supabase Realtime 채널에 참여하고 구독을 설정합니다.
 */
export function joinRoomRealtime(roomId: string): RealtimeChannel {
  // 이미 구독이 있는지 확인
  if (subscriptions[roomId]) {
    // 연결 상태 확인
    if (subscriptions[roomId].status === 'SUBSCRIBED') {
      console.log(`[Realtime] 방 ${roomId}에 대한 기존 채널 사용 (상태: ${subscriptions[roomId].status})`)
      return subscriptions[roomId].channel
    } else if (subscriptions[roomId].reconnecting) {
      console.log(`[Realtime] 방 ${roomId}에 대한 재연결이 진행 중입니다`)
      return subscriptions[roomId].channel
    } else {
      // 연결이 끊어진 상태면 새로 구독
      console.log(`[Realtime] 방 ${roomId}에 대한 연결이 끊어짐, 재구독 시도 (상태: ${subscriptions[roomId].status})`)
      try {
        // 기존 채널 정리
        subscriptions[roomId].channel.unsubscribe()
      } catch (error) {
        console.error(`[Realtime] 기존 채널 정리 중 오류:`, error)
      }
      delete subscriptions[roomId]
    }
  }
  
  try {
    console.log(`[Realtime] 방 ${roomId}에 대한 새 채널 생성 중...`)
    
    // 새 채널 생성
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        presence: {
          key: roomId,
        },
        broadcast: {
          self: true, // 자신이 보낸 메시지도 수신하도록 설정
        },
      },
    })
    
    // 채널 상태 이벤트 핸들러 등록
    channel
      .on('presence', { event: REALTIME_PRESENCE_LISTEN_EVENTS.SYNC }, () => {
        console.log(`[Realtime] 방 ${roomId} presence 동기화 완료`)
      })
      .on('presence', { event: REALTIME_PRESENCE_LISTEN_EVENTS.JOIN }, ({ key, newPresences }) => {
        console.log(`[Realtime] 신규 참여:`, newPresences)
      })
      .on('presence', { event: REALTIME_PRESENCE_LISTEN_EVENTS.LEAVE }, ({ key, leftPresences }) => {
        console.log(`[Realtime] 퇴장:`, leftPresences)
      })
      .on('system', { event: 'error' }, (err) => {
        // 에러 발생 시
        console.error(`[Realtime] 방 ${roomId} 채널 오류:`, err)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'CHANNEL_ERROR'
          subscriptions[roomId].lastError = err as Error
        }
        // 에러 발생 시 재연결 시도
        scheduleReconnect(roomId)
      })
      .on('system', { event: 'upgrade' }, (payload) => {
        // 업그레이드 발생 시
        console.log(`[Realtime] 방 ${roomId} 채널 업그레이드:`, payload)
      })
      .on('system', { event: 'disconnect' }, (payload) => {
        // 연결 해제
        console.log(`[Realtime] 방 ${roomId} 채널 연결 해제:`, payload)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'CLOSED'
        }
        // 연결 해제 시 재연결 시도
        scheduleReconnect(roomId)
      })
      .on('broadcast', { event: '*' }, (payload) => {
        // 모든 브로드캐스트 이벤트에 대한 로깅
        console.log(`[Realtime] 방 ${roomId} 브로드캐스트 수신:`, payload.event)
      })
    
    // 채널 구독
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] 방 ${roomId} 채널 구독 성공`)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'SUBSCRIBED'
          subscriptions[roomId].reconnecting = false
          if (subscriptions[roomId].reconnectTimeout) {
            clearTimeout(subscriptions[roomId].reconnectTimeout)
            subscriptions[roomId].reconnectTimeout = undefined
          }
        }
      } else if (status === 'TIMED_OUT') {
        console.error(`[Realtime] 방 ${roomId} 채널 타임아웃:`, err)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'TIMED_OUT'
          subscriptions[roomId].lastError = err as Error
        }
        // 타임아웃 시 재연결 시도
        scheduleReconnect(roomId)
      } else if (status === 'CLOSED') {
        console.log(`[Realtime] 방 ${roomId} 채널 연결 종료:`, err)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'CLOSED'
        }
        // 연결 종료 시 재연결 시도 (명시적으로 leaveRoomRealtime이 호출되지 않은 경우)
        if (!subscriptions[roomId]?.reconnecting) {
          scheduleReconnect(roomId)
        }
      } else if (err) {
        console.error(`[Realtime] 방 ${roomId} 구독 오류:`, err)
        if (subscriptions[roomId]) {
          subscriptions[roomId].status = 'SUBSCRIPTION_ERROR'
          subscriptions[roomId].lastError = err
        }
        // 구독 오류 시 재연결 시도
        scheduleReconnect(roomId)
      }
    })
    
    // 구독 정보 저장
    subscriptions[roomId] = {
      channel,
      status: 'SUBSCRIBED', // 최초 상태는 낙관적으로 설정
      reconnecting: false
    }
    
    console.log(`[Realtime] 방 ${roomId}에 대한 채널 초기화 완료`)
    return channel
  } catch (error) {
    console.error(`[Realtime] 방 ${roomId} 채널 생성 오류:`, error)
    // 오류가 발생하면 재연결 시도
    scheduleReconnect(roomId)
    
    // 에러 발생 시에도 채널 객체를 생성하여 반환
    try {
      // 에러 복구를 위한 재시도
      const channel = supabase.channel(`room:${roomId}`, {
        config: {
          presence: { key: roomId },
          broadcast: { self: true },
        },
      })
      
      // 구독 정보 저장
      subscriptions[roomId] = {
        channel,
        status: 'CHANNEL_ERROR',
        lastError: error as Error,
        reconnecting: true
      }
      
      return channel
    } catch (fallbackError) {
      console.error(`[Realtime] 방 ${roomId} 채널 생성 재시도 오류:`, fallbackError)
      // 마지막 수단으로 최소한의 기능이 있는 채널 객체를 반환
      const errorChannel = supabase.channel(`error-recovery:${roomId}`)
      
      // 구독 정보 저장
      subscriptions[roomId] = {
        channel: errorChannel,
        status: 'CHANNEL_ERROR',
        lastError: fallbackError as Error,
        reconnecting: true
      }
      
      return errorChannel
    }
  }
}

/**
 * 지정된 방에 대한 Supabase Realtime 구독을 해제합니다.
 */
export function leaveRoomRealtime(roomId: string): boolean {
  try {
    if (subscriptions[roomId]) {
      console.log(`[Realtime] 방 ${roomId}에서 퇴장합니다`)
      
      // 재연결 타이머가 있으면 삭제
      if (subscriptions[roomId].reconnectTimeout) {
        clearTimeout(subscriptions[roomId].reconnectTimeout)
      }
      
      try {
        // 채널 구독 해제
        subscriptions[roomId].channel.unsubscribe()
      } catch (error) {
        console.error(`[Realtime] 방 ${roomId} 구독 해제 오류:`, error)
      }
      
      // 구독 정보 삭제
      delete subscriptions[roomId]
      return true
    }
    
    console.log(`[Realtime] 방 ${roomId}에 대한 구독 정보가 없습니다`)
    return false
  } catch (error) {
    console.error(`[Realtime] 방 ${roomId} 퇴장 중 오류:`, error)
    return false
  }
}

/**
 * 방에 대한 참여자 입장/퇴장 상태 업데이트를 구독합니다.
 */
export function subscribeToRoomPresence(roomId: string, callback: (presences: any) => void): void {
  try {
    const channel = joinRoomRealtime(roomId)
    channel.on('presence', { event: REALTIME_PRESENCE_LISTEN_EVENTS.SYNC }, () => {
      const state = channel.presenceState()
      callback(state)
    })
  } catch (error) {
    console.error('[Realtime] 참여자 상태 구독 오류:', error)
  }
}

/**
 * 투표 업데이트를 구독합니다.
 */
export function subscribeToVoteUpdates(
  roomId: string,
  callback: (payload: { routeId: string; userId: string; voteType: 'like' | 'dislike' | null }) => void
): void {
  try {
    const channel = joinRoomRealtime(roomId)
    
    channel.on('broadcast', { event: 'vote_update' }, (payload) => {
      console.log('[Realtime] 투표 업데이트 수신:', payload)
      callback(payload.payload)
    })
  } catch (error) {
    console.error('[Realtime] 투표 업데이트 구독 오류:', error)
  }
}

/**
 * 투표를 브로드캐스트합니다.
 */
export function broadcastVote(
  roomId: string,
  routeId: string,
  userId: string,
  voteType: 'like' | 'dislike' | null
): boolean {
  try {
    const channel = joinRoomRealtime(roomId)
    
    channel.send({
      type: 'broadcast',
      event: 'vote_update',
      payload: { routeId, userId, voteType },
    })
    
    return true
  } catch (error) {
    console.error('[Realtime] 투표 브로드캐스트 오류:', error)
    return false
  }
}

/**
 * 경로 선택 이벤트를 구독합니다.
 */
export function subscribeToRouteSelection(
  roomId: string,
  callback: (payload: { routeId: string }) => void
): void {
  try {
    const channel = joinRoomRealtime(roomId)
    
    channel.on('broadcast', { event: 'route_selection' }, (payload) => {
      console.log('[Realtime] 경로 선택 수신:', payload)
      callback(payload.payload)
    })
  } catch (error) {
    console.error('[Realtime] 경로 선택 구독 오류:', error)
  }
}

/**
 * 선택된 경로를 브로드캐스트합니다.
 */
export function broadcastRouteSelection(roomId: string, routeId: string): boolean {
  try {
    const channel = joinRoomRealtime(roomId)
    
    channel.send({
      type: 'broadcast',
      event: 'route_selection',
      payload: { routeId },
    })
    
    return true
  } catch (error) {
    console.error('[Realtime] 경로 선택 브로드캐스트 오류:', error)
    return false
  }
}

/**
 * 채팅 메시지 변경사항을 구독합니다.
 */
export function subscribeToChatMessages(
  roomId: string,
  callback: (message: {
    id: string
    content: string
    isAI: boolean
    isAIChat: boolean
    sender: { id: string; name: string; avatar?: string }
    timestamp: Date
  }) => void
): void {
  try {
    const channel = joinRoomRealtime(roomId)
    
    channel.on('broadcast', { event: 'chat_message' }, (payload) => {
      console.log('[Realtime] 채팅 메시지 수신:', payload.payload)
      callback(payload.payload)
    })
    
    console.log(`[Realtime] 방 ${roomId}에 대한 채팅 메시지 구독 완료`)
  } catch (error) {
    console.error('[Realtime] 채팅 메시지 구독 오류:', error)
  }
}

/**
 * 채팅 메시지를 브로드캐스트합니다.
 */
export function subscribeToChatBroadcast(
  roomId: string,
  callback: (message: {
    id: string
    content: string
    isAI: boolean
    sender: { id: string; name: string; avatar?: string }
    timestamp: Date
  }) => void
): void {
  try {
    const channel = joinRoomRealtime(roomId)
    
    // 기존에 동일한 리스너가 등록되어 있는지 확인하는 방법은 제한적이므로
    // 클라이언트 측에서 중복 등록 방지 로직을 구현해야 합니다.
    channel.on('broadcast', { event: 'chat_broadcast' }, (payload) => {
      console.log('[Realtime] 브로드캐스트 메시지 수신:', payload.event)
      
      // 유효성 검사를 추가하여 잘못된 데이터로 인한 오류 방지
      if (!payload.payload || typeof payload.payload !== 'object') {
        console.error('[Realtime] 유효하지 않은 메시지 페이로드:', payload)
        return
      }
      
      callback(payload.payload)
    })
    
    console.log(`[Realtime] 방 ${roomId}에 대한 채팅 브로드캐스트 구독 완료`)
  } catch (error) {
    console.error('[Realtime] 채팅 브로드캐스트 구독 오류:', error)
  }
}

/**
 * 채팅 메시지를 브로드캐스트합니다.
 */
export function broadcastChatMessage(
  roomId: string,
  message: {
    id: string
    content: string
    isAI: boolean
    sender: { id: string; name: string; avatar?: string }
    timestamp: Date
  }
): boolean {
  try {
    // 메시지 유효성 검사
    if (!message || !message.id || !message.content || !message.sender || !message.sender.id) {
      console.error('[Realtime] 유효하지 않은 메시지 객체:', message)
      return false
    }
    
    console.log(`[Realtime] 메시지 브로드캐스트 시작: ${message.id} (${message.content.substring(0, 15)}...)`)
    
    // 채널 가져오기
    if (!subscriptions[roomId]) {
      console.error(`[Realtime] 방 ${roomId}에 대한 채널이 없습니다.`)
      // 채널이 없으면 새로 생성
      joinRoomRealtime(roomId)
    }
    
    const channel = subscriptions[roomId]?.channel
    if (!channel) {
      console.error(`[Realtime] 방 ${roomId}에 대한 채널을 찾을 수 없습니다.`)
      return false
    }
    
    // 채널 상태 확인
    if (subscriptions[roomId]?.status !== 'SUBSCRIBED') {
      console.warn(`[Realtime] 방 ${roomId} 채널 상태가 구독 완료가 아닙니다: ${subscriptions[roomId]?.status}`)
      
      // 연결이 끊어진 경우 재연결 시도
      if (subscriptions[roomId]?.status === 'CLOSED' || 
          subscriptions[roomId]?.status === 'CHANNEL_ERROR' || 
          subscriptions[roomId]?.status === 'SUBSCRIPTION_ERROR') {
        console.log(`[Realtime] 연결이 끊어진 상태에서 메시지 브로드캐스트 시도, 재연결 시도`)
        
        // 기존 구독 정보 삭제 후 새로 연결
        try {
          if (subscriptions[roomId]) {
            try {
              subscriptions[roomId].channel.unsubscribe()
            } catch (error) {
              console.error(`[Realtime] 채널 구독 해제 오류:`, error)
            }
            delete subscriptions[roomId]
          }
          
          // 새 채널 생성
          const newChannel = joinRoomRealtime(roomId)
          
          // 메시지 전송 재시도 (0.5초 후)
          setTimeout(() => {
            try {
              newChannel.send({
                type: 'broadcast',
                event: 'chat_broadcast',
                payload: message,
              })
              console.log(`[Realtime] 재연결 후 메시지 브로드캐스트 성공: ${message.id}`)
            } catch (retryError) {
              console.error(`[Realtime] 재연결 후 메시지 브로드캐스트 실패:`, retryError)
            }
          }, 500)
          
          return true
        } catch (reconnectError) {
          console.error(`[Realtime] 재연결 시도 중 오류:`, reconnectError)
          return false
        }
      }
    }
    
    // 메시지 전송
    channel.send({
      type: 'broadcast',
      event: 'chat_broadcast',
      payload: message,
    })
    
    console.log(`[Realtime] 메시지 브로드캐스트 완료: ${message.id}`)
    return true
  } catch (error) {
    console.error('[Realtime] 메시지 브로드캐스트 오류:', error)
    
    // 오류 발생 시 채널 상태 업데이트 및 재연결 시도
    if (subscriptions[roomId]) {
      subscriptions[roomId].status = 'CHANNEL_ERROR'
      subscriptions[roomId].lastError = error as Error
      scheduleReconnect(roomId)
    }
    
    return false
  }
} 