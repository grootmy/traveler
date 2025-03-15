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
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
} 