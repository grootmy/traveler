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
      .eq('textid', userId);
    
    if (error) throw error;
    
    // 사용자가 참여 중인 모든 방의 멤버 정보 업데이트
    const { data: roomMembers, error: membersError } = await supabase
      .from('room_members')
      .select('textid, room_id')
      .eq('user_id', userId);
    
    if (membersError) throw membersError;
    
    if (roomMembers && roomMembers.length > 0) {
      // 각 방 멤버의 닉네임 업데이트
      for (const member of roomMembers) {
        await supabase
          .from('room_members')
          .update({ nickname })
          .eq('textid', member.textid);
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
export async function createRoom(ownerId: string, roomData: { 
  title: string, 
  purpose_category: string, 
  expected_members: number, 
  budget_min?: number, 
  budget_max?: number, 
  start_time?: string, 
  end_time?: string,
  district: string 
}) {
  // 초대 코드 생성 (6자리 영문+숫자)
  const inviteCode = generateInviteCode();
  
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      owner_id: ownerId,
      title: roomData.title,
      purpose_category: roomData.purpose_category,
      expected_members: roomData.expected_members,
      budget_min: roomData.budget_min,
      budget_max: roomData.budget_max,
      start_time: roomData.start_time,
      end_time: roomData.end_time,
      district: roomData.district,
      code: inviteCode,
      status: 'active'
    })
    .select();
  
  if (data && data.length > 0) {
    // 방 생성 후 자동으로 방장을 멤버로 추가
    await addRoomMember(data[0].textid, ownerId);
  }
  
  return { data, error };
}

/**
 * 초대 코드로 방 정보 조회
 * @param code 초대 코드
 * @returns 방 정보
 */
export async function getRoomByInviteCode(code: string) {
  try {
    // 코드 정규화 (대문자로 변환, 공백 및 하이픈 제거)
    const normalizedCode = code.toUpperCase().replace(/[\s-]/g, '');
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', normalizedCode)
      .single();
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('초대 코드로 방 조회 오류:', error);
    return { data: null, error };
  }
}

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('textid', roomId)
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
/**
 * 채팅 메시지를 저장합니다.
 */
export async function saveChatMessage(roomId: string, userId: string | null, content: string, isAi: boolean, isAiChat: boolean = false) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        content,
        is_ai: isAi,
        is_ai_chat: isAiChat
      })
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('메시지 저장 오류:', error);
    return { data: null, error };
  }
}

/**
 * 채팅 메시지 목록을 가져옵니다.
 */
export async function getChatMessages(roomId: string, isAiChat: boolean = false, limit: number = 50) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`
        textid,
        room_id,
        user_id,
        content,
        is_ai,
        is_ai_chat,
        created_at,
        user:user_id (
          textid,
          nickname,
          avatar_url
        )
      `)
      .eq('room_id', roomId)
      .eq('is_ai_chat', isAiChat)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error: any) {
    console.error('채팅 메시지 조회 오류:', error);
    return { data: null, error };
  }
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
 * 방 초대 코드 유효성 검사
 * @param code 초대 코드
 * @returns 유효성 여부 및 방 정보
 */
export async function validateInviteCode(code: string) {
  try {
    // 코드 정규화 (대문자로 변환, 공백 및 하이픈 제거)
    const normalizedCode = code.toUpperCase().replace(/[\s-]/g, '');
    
    if (normalizedCode.length < 6) {
      return {
        isValid: false,
        error: '유효하지 않은 초대 코드 형식입니다'
      };
    }
    
    // 초대 코드로 방 조회
    const { data, error } = await supabase
      .from('rooms')
      .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
      .eq('code', normalizedCode)
      .single();
    
    if (error || !data) {
      return {
        isValid: false,
        error: '존재하지 않는 초대 코드입니다'
      };
    }
    
    if (data.status === 'closed') {
      return {
        isValid: false,
        error: '이미 종료된 여행입니다'
      };
    }
    
    return {
      isValid: true,
      roomInfo: data
    };
  } catch (error: any) {
    console.error('초대 코드 검증 오류:', error);
    return {
      isValid: false,
      error: error.message || '초대 코드 검증 중 오류가 발생했습니다'
    };
  }
}

/**
 * 초대 코드 재생성
 * @param roomId 방 ID
 * @param userId 사용자 ID (방장 확인용)
 * @returns 성공 여부 및 새 초대 코드
 */
export async function regenerateInviteCode(roomId: string, userId: string) {
  try {
    // 방 소유자인지 확인
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('owner_id, textid')
      .eq('textid', roomId)
      .single();
    
    if (roomError || !roomData) {
      throw new Error('방을 찾을 수 없습니다');
    }
    
    if (roomData.owner_id !== userId) {
      throw new Error('방장만 초대 코드를 재생성할 수 있습니다');
    }
    
    // 새 초대 코드 생성 (6자리 영문과 숫자 조합)
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let inviteCode = '';
    
    for (let i = 0; i < 6; i++) {
      inviteCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // 코드 업데이트
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ code: inviteCode })
      .eq('textid', roomId);
    
    if (updateError) {
      throw updateError;
    }
    
    return {
      success: true,
      inviteCode
    };
  } catch (error: any) {
    console.error('초대 코드 재생성 오류:', error);
    return {
      success: false,
      error: error.message || '초대 코드 재생성 중 오류가 발생했습니다'
    };
  }
}

/**
 * 방 참여 함수
 * @param options 방 참여 옵션 (방 ID, 사용자 ID, 닉네임, 역할)
 * @returns 성공 여부
 */
export async function joinRoom(options: {
  roomId: string;
  userId: string | null;
  nickname?: string;
  role?: 'member' | 'owner';
}) {
  try {
    const { roomId, userId, nickname, role = 'member' } = options;
    
    // 익명 사용자 또는 로그인 사용자 확인
    if (!userId && !nickname) {
      throw new Error('익명 사용자는 닉네임이 필요합니다');
    }
    
    // 이미 참여 중인지 확인 (로그인 사용자만)
    if (userId) {
      const { data: existingMember, error: checkError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      // 이미 참여 중이면 성공 반환
      if (existingMember) {
        return { success: true };
      }
    }
    
    // 방 멤버로 추가
    const memberData: any = {
      room_id: roomId,
      role,
      joined_at: new Date().toISOString()
    };
    
    // 로그인 사용자 또는 익명 사용자에 따라 다른 데이터 설정
    if (userId) {
      memberData.user_id = userId;
    } else {
      memberData.nickname = nickname;
      memberData.is_anonymous = true;
    }
    
    const { error: joinError } = await supabase
      .from('room_members')
      .insert(memberData);
    
    if (joinError) throw joinError;
    
    return { success: true };
  } catch (error: any) {
    console.error('방 참여 오류:', error);
    return {
      success: false,
      error: error.message || '방 참여 중 오류가 발생했습니다'
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
      .eq('textid', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    if (!room) {
      return { 
        success: false, 
        error: { message: '방을 찾을 수 없습니다.' } 
      };
    }
    
    if (room.owner_id !== userId) {
      return { 
        success: false, 
        error: { message: '방장만 방을 삭제할 수 있습니다.' } 
      };
    }
    
    // 방 삭제 (CASCADE 설정으로 관련 데이터도 모두 삭제됨)
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('textid', roomId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: { message: error.message || '방 삭제 중 오류가 발생했습니다.' } 
    };
  }
} 