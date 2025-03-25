import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/utils/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const roomId = formData.get('roomId') as string;
    
    if (!roomId) {
      return NextResponse.json(
        { error: '방 ID가 필요합니다' }, 
        { status: 400 }
      );
    }
    console.log('방 참여 요청 받음:', roomId);
    
    // 인증 헤더 확인
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    
    // 서버 클라이언트 생성
    const serverSupabase = createServerClient();
    
    // 인증 방식 분기처리
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // 토큰 방식 인증
      const token = authHeader.substring(7);
      try {
        const { data: { user }, error } = await serverSupabase.auth.getUser(token);
        if (error || !user) {
          console.error('토큰 인증 오류:', error);
          return NextResponse.json(
            { error: '인증에 실패했습니다' }, 
            { status: 401 }
          );
        }
        userId = user.id;
        console.log('토큰으로 인증된 사용자:', userId);
      } catch (err) {
        console.error('토큰 처리 오류:', err);
        return NextResponse.json(
          { error: '인증 처리 중 오류가 발생했습니다' }, 
          { status: 401 }
        );
      }
    } else {
      // 쿠키 방식 인증
      const { data: { session }, error: sessionError } = await serverSupabase.auth.getSession();
      
      if (sessionError || !session?.user) {
        console.log('쿠키 세션 오류 또는 사용자 없음:', sessionError);
        return NextResponse.json(
          { error: '로그인이 필요합니다' }, 
          { status: 401 }
        );
      }
      userId = session.user.id;
      console.log('쿠키로 인증된 사용자:', userId);
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: '사용자 ID를 확인할 수 없습니다' }, 
        { status: 401 }
      );
    }
    
    // 방 정보 확인
    try {
      const { data: roomData, error: roomError } = await serverSupabase
        .from('rooms')
        .select('textid, title')
        .eq('textid', roomId)
        .single();
      
      if (roomError || !roomData) {
        console.error('방 정보 조회 오류:', roomError);
        return NextResponse.json(
          { error: '존재하지 않는 방입니다' }, 
          { status: 404 }
        );
      }
      
      console.log('방 정보 확인됨:', roomData.title);
    } catch (error) {
      console.error('방 정보 확인 중 오류:', error);
    }
    
    // 이미 참여 중인지 확인
    try {
      const { data: existingMember, error: memberError } = await serverSupabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (memberError) {
        console.error('멤버 확인 오류:', memberError);
        return NextResponse.json(
          { error: '회원 정보 확인 중 오류가 발생했습니다' }, 
          { status: 500 }
        );
      }
      
      if (existingMember) {
        console.log('이미 방에 참여 중인 사용자:', userId);
        return NextResponse.json(
          { success: true, message: '이미://방에 참여 중입니다', alreadyMember: true }, 
          { status: 200 }
        );
      }
    } catch (error) {
      console.error('멤버 확인 중 예외 발생:', error);
    }
    
    // 새 멤버로 추가
    try {
      console.log('새 멤버 추가 시도:', { room_id: roomId, user_id: userId });
      
      const insertData = {
        room_id: roomId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        is_anonymous: false,
      };
      
      const { data: insertResult, error: joinError } = await serverSupabase
        .from('room_members')
        .insert(insertData)
        .select();
      
      if (joinError) {
        console.error('멤버 추가 오류:', joinError);
        return NextResponse.json(
          { error: `방 참여 중 오류가 발생했습니다: ${joinError.message}` }, 
          { status: 500 }
        );
      }
      
      console.log('멤버 추가 성공:', insertResult);
    } catch (error: any) {
      console.error('멤버 추가 중 예외 발생:', error);
      return NextResponse.json(
        { error: `예외 발생: ${error.message}` }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { success: true, message: '방 참여에 성공했습니다' }, 
      { status: 200 }
    );
  } catch (error: any) {
    console.error('방 참여 중 오류 발생:', error);
    return NextResponse.json(
      { error: `방 참여 중 오류가 발생했습니다: ${error.message}` }, 
      { status: 500 }
    );
  }
}

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic'; 