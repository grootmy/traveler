import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  return { data, error };
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

export async function saveUserPreferences(userId: string, preferences: any) {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, preferences })
    .select();
  return { data, error };
}

export async function updateUserProfile(userId: string, profile: { display_name?: string, avatar_url?: string }) {
  const { data, error } = await supabase
    .from('users')
    .update(profile)
    .eq('id', userId)
    .select();
  return { data, error };
}

/**
 * 사용자의 닉네임을 업데이트합니다.
 * 익명 사용자와 회원 모두 사용할 수 있습니다.
 */
export async function updateUserNickname(userId: string, nickname: string) {
  try {
    // 사용자 프로필 업데이트
    const { error } = await supabase
      .from('users')
      .update({ display_name: nickname })
      .eq('id', userId);
    
    if (error) throw error;
    
    // 사용자가 참여 중인 모든 방의 멤버 정보 업데이트
    const { data: roomMembers, error: membersError } = await supabase
      .from('room_members')
      .select('id, room_id')
      .eq('user_id', userId);
    
    if (membersError) throw membersError;
    
    if (roomMembers && roomMembers.length > 0) {
      // 각 방 멤버의 닉네임 업데이트
      for (const member of roomMembers) {
        await supabase
          .from('room_members')
          .update({ nickname })
          .eq('id', member.id);
      }
    }
    
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '닉네임 업데이트 중 오류가 발생했습니다.' } 
    };
  }
}

// 방 관련 함수들
export async function createRoom(ownerId: string, roomData: { title: string, region: string, expected_members: number, budget?: number, start_time?: string, end_time?: string }) {
  // 초대 코드 생성 (6자리 영문+숫자)
  const inviteCode = generateInviteCode();
  
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      owner_id: ownerId,
      title: roomData.title,
      region: roomData.region,
      expected_members: roomData.expected_members,
      budget: roomData.budget,
      start_time: roomData.start_time,
      end_time: roomData.end_time,
      invite_code: inviteCode
    })
    .select();
  
  if (data && data.length > 0) {
    // 방 생성 후 자동으로 방장을 멤버로 추가
    await addRoomMember(data[0].id, ownerId);
  }
  
  return { data, error };
}

export async function getRoomByInviteCode(inviteCode: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('invite_code', inviteCode)
    .single();
  
  return { data, error };
}

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  
  return { data, error };
}

export async function getUserRooms(userId: string) {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      room_id,
      rooms:room_id (*)
    `)
    .eq('user_id', userId);
  
  return { data, error };
}

export async function addRoomMember(roomId: string, userId: string, relationship?: string) {
  const { data, error } = await supabase
    .from('room_members')
    .insert({
      room_id: roomId,
      user_id: userId,
      relationship: relationship
    })
    .select();
  
  return { data, error };
}

export async function updateRoomMemberPreferences(roomId: string, userId: string, preferences: any) {
  const { data, error } = await supabase
    .from('room_members')
    .update({
      preferences: preferences,
      is_ready: true
    })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select();
  
  return { data, error };
}

export async function getRoomMembers(roomId: string) {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      *,
      user:user_id (id, email, display_name, avatar_url)
    `)
    .eq('room_id', roomId);
  
  return { data, error };
}

// 경로 관련 함수들
export async function getRoutesByRoomId(roomId: string) {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('room_id', roomId);
  
  return { data, error };
}

export async function voteForRoute(routeId: string, userId: string, voteValue: number) {
  const { data, error } = await supabase
    .from('route_votes')
    .upsert({
      route_id: routeId,
      user_id: userId,
      vote_value: voteValue
    })
    .select();
  
  return { data, error };
}

export async function getRouteVotes(routeId: string) {
  const { data, error } = await supabase
    .from('route_votes')
    .select('*')
    .eq('route_id', routeId);
  
  return { data, error };
}

export async function selectFinalRoute(roomId: string, routeId: string, selectedBy: string) {
  const { data, error } = await supabase
    .from('selected_routes')
    .upsert({
      room_id: roomId,
      route_id: routeId,
      selected_by: selectedBy
    })
    .select();
  
  return { data, error };
}

export async function getFinalRoute(roomId: string) {
  const { data, error } = await supabase
    .from('selected_routes')
    .select(`
      *,
      route:route_id (*)
    `)
    .eq('room_id', roomId)
    .single();
  
  return { data, error };
}

// 채팅 관련 함수들
export async function saveChatMessage(roomId: string, userId: string | null, message: string, isAi: boolean = false) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
      user_id: userId,
      message: message,
      is_ai: isAi
    })
    .select();
  
  return { data, error };
}

export async function getChatMessages(roomId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      user:user_id (id, display_name, avatar_url)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  
  return { data, error };
}

// 유틸리티 함수
function generateInviteCode() {
  // 더 안전하고 읽기 쉬운 초대 코드 생성
  // 숫자 0, 알파벳 O, 숫자 1, 알파벳 I, 알파벳 L 등 혼동되기 쉬운 문자 제외
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  
  // 8자리 코드 생성 (기존 6자리에서 증가)
  for (let i = 0; i < 8; i++) {
    // 4자리마다 하이픈 추가하여 가독성 향상
    if (i === 4) result += '-';
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}

/**
 * 초대 코드의 유효성을 검사합니다.
 * 하이픈이 있거나 없는 형식 모두 지원합니다.
 */
export async function validateInviteCode(inviteCode: string) {
  // 하이픈 제거하고 대문자로 변환
  const normalizedCode = inviteCode.replace(/-/g, '').toUpperCase();
  
  // 코드가 너무 짧으면 오류
  if (normalizedCode.length < 6) {
    return { 
      valid: false, 
      error: { message: '유효하지 않은 초대 코드입니다.' } 
    };
  }
  
  // 데이터베이스에서 초대 코드로 방 검색
  const { data, error } = await supabase
    .from('rooms')
    .select('id, title, status')
    .ilike('invite_code', `%${normalizedCode}%`)
    .maybeSingle();
  
  if (error || !data) {
    return { 
      valid: false, 
      error: { message: '유효하지 않은 초대 코드입니다.' } 
    };
  }
  
  // 방이 이미 완료된 상태인지 확인
  if (data.status === 'completed') {
    return { 
      valid: false, 
      error: { message: '이미 완료된 방입니다.' } 
    };
  }
  
  return { 
    valid: true, 
    roomId: data.id,
    roomTitle: data.title
  };
}

/**
 * 새로운 초대 코드를 생성하고 방 정보를 업데이트합니다.
 */
export async function regenerateInviteCode(roomId: string, userId: string) {
  try {
    // 방 소유자 확인
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id')
      .eq('id', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    // 방장이 아니면 초대 코드 재생성 불가
    if (room.owner_id !== userId) {
      return { 
        success: false, 
        error: { message: '방장만 초대 코드를 재생성할 수 있습니다.' } 
      };
    }
    
    // 새 초대 코드 생성
    const newInviteCode = generateInviteCode();
    
    // 방 정보 업데이트
    const { error } = await supabase
      .from('rooms')
      .update({ invite_code: newInviteCode })
      .eq('id', roomId);
    
    if (error) throw error;
    
    return { 
      success: true,
      inviteCode: newInviteCode
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '초대 코드 재생성 중 오류가 발생했습니다.' } 
    };
  }
}

/**
 * 방을 삭제합니다. 방장만 삭제할 수 있습니다.
 * 관련된 모든 데이터(멤버, 경로, 투표 등)도 함께 삭제됩니다.
 */
export async function deleteRoom(roomId: string, userId: string) {
  try {
    // 방 소유자 확인
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id')
      .eq('id', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    // 방장이 아니면 삭제 불가
    if (room.owner_id !== userId) {
      return { 
        success: false, 
        error: { message: '방장만 방을 삭제할 수 있습니다.' } 
      };
    }
    
    // 관련 데이터 삭제 (트랜잭션은 지원되지 않으므로 순차적으로 삭제)
    
    // 1. 채팅 메시지 삭제
    await supabase
      .from('chat_messages')
      .delete()
      .eq('room_id', roomId);
    
    // 2. 투표 삭제
    const { data: routes } = await supabase
      .from('routes')
      .select('id')
      .eq('room_id', roomId);
    
    if (routes && routes.length > 0) {
      const routeIds = routes.map(route => route.id);
      
      await supabase
        .from('route_votes')
        .delete()
        .in('route_id', routeIds);
      
      // 3. 선택된 경로 삭제
      await supabase
        .from('selected_routes')
        .delete()
        .eq('room_id', roomId);
      
      // 4. 경로 삭제
      await supabase
        .from('routes')
        .delete()
        .eq('room_id', roomId);
    }
    
    // 5. 방 멤버 삭제
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId);
    
    // 6. 방 삭제
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '방 삭제 중 오류가 발생했습니다.' } 
    };
  }
} 