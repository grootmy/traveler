'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase/client'
import { createServerClient } from '@/lib/utils/server'

// 초대 코드 검증 Server Action
export async function validateInviteCode(code: string) {
  try {
    console.log('[Server] 초대 코드 검증 시작 (원본 코드):', code);
    
    // 코드가 없는 경우 빠른 실패
    if (!code) {
      console.log('[Server] 코드가 제공되지 않았습니다');
      return { isValid: false, error: '초대 코드가 제공되지 않았습니다' };
    }
    
    const normalizedCode = normalizeCode(code);
    console.log('[Server] 초대 코드 정규화 결과:', normalizedCode);

    if (!normalizedCode || normalizedCode.length < 6) {
      console.log('[Server] 유효하지 않은 초대 코드 형식:', normalizedCode);
      return { isValid: false, error: '유효하지 않은 초대 코드 형식입니다' };
    }

    // 서버 Supabase 클라이언트 생성
    const serverSupabase = createServerClient();
    
    // 환경 변수 확인 로깅 (디버깅용)
    console.log('[Server] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '없음');
    console.log('[Server] Supabase 환경 변수 동일 여부:', 
      process.env.NEXT_PUBLIC_SUPABASE_URL === process.env.SUPABASE_URL);
    
    // 데이터베이스 직접 쿼리 로깅
    console.log('[Server] 실행할 SQL 쿼리:', `SELECT * FROM rooms WHERE code = '${normalizedCode}'`);
    
    // 간단한 테스트 쿼리로 데이터베이스 연결 확인
    try {
      console.log('[Server] 데이터베이스 연결 테스트...');
      // 수정된 쿼리 - count(*) 대신 정상적인 select 사용
      const { data: testData, error: testError } = await serverSupabase
        .from('rooms')
        .select('*')
        .limit(1);
      
      console.log('[Server] 연결 테스트 결과:', {
        success: !testError,
        dataExists: testData && testData.length > 0 ? 'yes' : 'no',
        error: testError ? testError.message : 'none'
      });
      
      if (testError) {
        throw new Error('데이터베이스 연결 실패: ' + testError.message);
      }
    } catch (testErr) {
      console.error('[Server] 데이터베이스 연결 테스트 오류:', testErr);
      
      // 중요: 서버 액션이 실패했으므로, 클라이언트 측 검증에 의존하도록 처리
      console.log('[Server] 서버 연결 문제로 검증 실패, 클라이언트 측 검증을 사용하도록 처리');
      // 연결 오류이므로 특정 오류 메시지 대신 일반적인 DB 오류 반환
      return { isValid: false, error: 'DB_CONNECTION_ERROR' };
    }
    
    console.log('[Server] Supabase 쿼리 실행:', normalizedCode);
    
    try {
      // 기본 쿼리 수행
      const { data, error } = await serverSupabase
        .from('rooms')
        .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
        .eq('code', normalizedCode)
        .maybeSingle();
      
      console.log('[Server] Supabase 쿼리 결과:', { data: data ? 'exists' : 'null', error: error ? error.message : 'none' });

      if (error) {
        console.error('[Server] 초대 코드 검증 DB 오류:', error);
        return { isValid: false, error: 'DB_QUERY_ERROR' };
      }

      if (!data) {
        console.log('[Server] 존재하지 않는 초대 코드:', normalizedCode);
        
        // 대체 검색 시도 - 대문자화만 적용
        console.log('[Server] 대체 쿼리 시도 (대문자만 변환)');
        const uppercaseCode = code.toUpperCase();
        const { data: altData, error: altError } = await serverSupabase
          .from('rooms')
          .select('textid, title, owner_id, purpose_category, expected_members, district, status, code')
          .eq('code', uppercaseCode)
          .maybeSingle();
          
        if (!altError && altData) {
          console.log('[Server] 대체 쿼리로 찾음:', altData.code);
          return { isValid: true, roomInfo: altData };
        }
        
        return { isValid: false, error: '존재하지 않는 초대 코드입니다' };
      }

      if (data.status === 'closed') {
        console.log('[Server] 종료된 여행 초대 코드:', normalizedCode);
        return { isValid: false, error: '이미 종료된 여행입니다' };
      }

      console.log('[Server] 유효한 초대 코드 확인:', normalizedCode, data.textid);
      return { isValid: true, roomInfo: data };
    } catch (dbError) {
      console.error('[Server] Supabase 쿼리 예외 발생:', dbError);
      return { isValid: false, error: 'DB_QUERY_ERROR' };
    }
  } catch (error) {
    console.error('[Server] 초대 코드 검증 중 예외 발생:', error);
    return { isValid: false, error: '초대 코드 검증 중 오류가 발생했습니다' };
  }
}

// 익명 사용자 방 참여 Server Action
export async function joinRoomAnonymously(formData: FormData) {
  try {
    const roomId = formData.get('roomId') as string;
    const nickname = formData.get('nickname') as string;
    
    console.log('[Server] 익명 사용자 방 참여 시작:', roomId, nickname);
    
    if (!roomId) {
      return { error: '방 ID가 필요합니다' };
    }
    
    if (!nickname || nickname.trim() === '') {
      return { error: '닉네임이 필요합니다' };
    }
    
    // 익명 ID 가져오기 (쿠키에 저장된 경우)
    let anonymousId = cookies().get('anonymous_id')?.value;
    
    // 익명 ID가 없으면 생성
    if (!anonymousId) {
      anonymousId = crypto.randomUUID();
      cookies().set('anonymous_id', anonymousId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30일
        httpOnly: true,
        sameSite: 'lax',
      });
    }
    
    const serverSupabase = createServerClient();
    
    // 이미 참여 중인지 확인
    const { data: existingMember } = await serverSupabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('anonymous_id', anonymousId)
      .maybeSingle();
    
    if (existingMember) {
      // 이미 참여 중이면 닉네임만 업데이트
      const { error: updateError } = await serverSupabase
        .from('room_members')
        .update({ nickname })
        .eq('textid', existingMember.textid);
      
      if (updateError) {
        return { error: '닉네임 업데이트 중 오류가 발생했습니다' };
      }
    } else {
      // 새 멤버로 추가
      const { error: joinError } = await serverSupabase
        .from('room_members')
        .insert({
          room_id: roomId,
          nickname,
          anonymous_id: anonymousId,
          joined_at: new Date().toISOString(),
          is_anonymous: true
        });
      
      if (joinError) {
        return { error: '방 참여 중 오류가 발생했습니다' };
      }
    }
    
    revalidatePath(`/rooms/${roomId}`);
    redirect(`/rooms/${roomId}/routes`);
  } catch (error) {
    console.error('[Server] 익명 사용자 방 참여 중 오류 발생:', error);
    return { error: '익명 사용자 방 참여 중 오류가 발생했습니다' };
  }
}

// 로그인 사용자 방 참여 Server Action
export async function joinRoomAsUser(formData: FormData) {
  try {
    const roomId = formData.get('roomId') as string;
    
    console.log('[Server] 로그인 사용자 방 참여 시작:', roomId);
    
    if (!roomId) {
      return { error: '방 ID가 필요합니다' };
    }
    
    const serverSupabase = createServerClient();
    const { data: { session }, error: sessionError } = await serverSupabase.auth.getSession();
    
    if (sessionError) {
      console.error('[Server] 세션 가져오기 오류:', sessionError);
      return { error: '로그인 정보를 가져올 수 없습니다' };
    }
    
    if (!session?.user) {
      console.log('[Server] 로그인되지 않은 사용자');
      redirect(`/login?redirect=${encodeURIComponent(`/invite?roomId=${roomId}`)}`);
    }
    
    const user = session.user;
    console.log('[Server] 사용자 정보:', user.id);
    
    // 이미 참여 중인지 확인
    const { data: existingMember, error: memberError } = await serverSupabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (memberError) {
      console.error('[Server] 멤버 확인 오류:', memberError);
      return { error: '회원 정보 확인 중 오류가 발생했습니다' };
    }
    
    if (!existingMember) {
      console.log('[Server] 새 멤버 추가:', roomId, user.id);
      // 새 멤버로 추가
      const { error: joinError } = await serverSupabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: user.id,
          joined_at: new Date().toISOString(),
          is_anonymous: false
        });
      
      if (joinError) {
        console.error('[Server] 멤버 추가 오류:', joinError);
        return { error: '방 참여 중 오류가 발생했습니다' };
      }
    } else {
      console.log('[Server] 이미 참여한 멤버:', existingMember.textid);
    }
    
    // 성공 시 리다이렉트
    console.log('[Server] 방 참여 성공, 리다이렉트:', roomId);
    revalidatePath(`/rooms/${roomId}`);
    redirect(`/rooms/${roomId}/routes`);
  } catch (error) {
    console.error('[Server] 로그인 사용자 방 참여 중 오류 발생:', error);
    return { error: '방 참여 중 오류가 발생했습니다' };
  }
}

// 초대 코드 재생성 Server Action
export async function regenerateInviteCodeAction(formData: FormData) {
  const roomId = formData.get('roomId') as string;
  
  const serverSupabase = createServerClient();
  const { data: { session } } = await serverSupabase.auth.getSession();
  
  if (!session?.user) {
    return { error: '로그인이 필요합니다' };
  }
  
  try {
    // 방 소유자 확인
    const { data: room, error: roomError } = await serverSupabase
      .from('rooms')
      .select('owner_id')
      .eq('textid', roomId)
      .single();
    
    if (roomError) throw roomError;
    
    if (room.owner_id !== session.user.id) {
      return {
        success: false,
        error: '방장만 초대 코드를 재생성할 수 있습니다'
      };
    }
    
    // 새로운 초대 코드 생성
    const inviteCode = generateInviteCode();
    
    // 초대 코드 업데이트
    const { error: updateError } = await serverSupabase
      .from('rooms')
      .update({ code: inviteCode })
      .eq('textid', roomId);
    
    if (updateError) throw updateError;
    
    revalidatePath(`/rooms/${roomId}/invite`);
    
    return {
      success: true,
      inviteCode
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '초대 코드 재생성 중 오류가 발생했습니다'
    };
  }
}

// 유틸리티 함수들
function normalizeCode(code: string): string {
  if (!code) return '';
  
  // 미들웨어의 정규화 함수와 일치
  // 알파벳과 숫자 외 모든 문자 제거하고 대문자로 변환
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateInviteCode() {
  const characters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
} 