import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/utils/server';

// 이 라우트가 항상 동적으로 렌더링되어야 함을 명시
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const roomId = request.nextUrl.searchParams.get('roomId');
    
    if (!roomId) {
      return NextResponse.redirect(new URL('/mypage', request.url));
    }
    
    // 서버 클라이언트 생성
    const serverSupabase = createServerClient();
    
    // 세션 확인
    const { data: { session }, error: sessionError } = await serverSupabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      console.error('세션 오류:', sessionError);
      // 로그인되지 않은 경우 초대 페이지로 리다이렉트
      return NextResponse.redirect(new URL(`/invite?roomId=${roomId}`, request.url));
    }
    
    const user = session.user;
    console.log('인증된 사용자:', user.id);
    
    // 이미 참여 중인지 확인
    const { data: existingMember, error: memberError } = await serverSupabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (memberError) {
      console.error('멤버 확인 오류:', memberError);
      // 오류 발생 시 방 페이지로 그냥 리다이렉트
      return NextResponse.redirect(new URL(`/rooms/${roomId}/routes`, request.url));
    }
    
    if (!existingMember) {
      // 사용자 정보 가져오기
      const { data: userData, error: userError } = await serverSupabase
        .from('users')
        .select('nickname')
        .eq('textid', user.id)
        .maybeSingle();
      
      if (userError) {
        console.error('사용자 정보 조회 오류:', userError);
      }
      
      const nickname = userData?.nickname || '익명 사용자';
      
      // 새 멤버로 추가
      const { error: joinError } = await serverSupabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: user.id,
          nickname: nickname,
          joined_at: new Date().toISOString(),
          is_anonymous: false
        });
      
      if (joinError) {
        console.error('멤버 추가 오류:', joinError);
      } else {
        console.log('새 멤버 추가 성공:', user.id);
      }
    } else {
      console.log('이미 방에 참여 중인 사용자입니다.');
    }
    
    // 방으로 리다이렉트
    return NextResponse.redirect(new URL(`/rooms/${roomId}/routes`, request.url));
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.redirect(new URL('/mypage', request.url));
  }
} 